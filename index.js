const express = require('express');
const crypto = require('crypto');
const axios = require('axios');

const app = express();
app.use(express.json());

const API_KEY = process.env.API_KEY;
const API_SECRET = process.env.API_SECRET;

// 👉 Firmar parámetros
function sign(queryString) {
  return crypto.createHmac('sha256', API_SECRET).update(queryString).digest('hex');
}

// 👉 Ejecutar orden spot
async function placeOrder(params) {
  const timestamp = Date.now();
  const query = new URLSearchParams({
    ...params,
    timestamp
  });

  const queryString = query.toString();
  const signature = sign(queryString);
  const finalQuery = `${queryString}&signature=${signature}`;

  try {
    const res = await axios({
      method: 'POST',
      url: `https://api.mexc.com/api/v3/order?${finalQuery}`,
      headers: {
        'X-MEXC-APIKEY': API_KEY,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    return res.data;
  } catch (err) {
    return { error: err.response?.data || err.message };
  }
}

app.post('/ordenar', async (req, res) => {
  const { symbol, price, quantity, stop_loss, take_profit } = req.body;

  // 👉 Orden de compra LIMIT inmediata
  const buyOrder = await placeOrder({
    symbol,
    side: 'BUY',
    type: 'LIMIT',
    timeInForce: 'GTC',
    quantity,
    price
  });

  // 👉 TP directo
  const tpOrder = await placeOrder({
    symbol,
    side: 'SELL',
    type: 'LIMIT',
    timeInForce: 'GTC',
    quantity,
    price: take_profit
  });

  // 👉 SL directo
  const slOrder = await placeOrder({
    symbol,
    side: 'SELL',
    type: 'STOP_LOSS_LIMIT',
    timeInForce: 'GTC',
    quantity,
    price: stop_loss,
    stopPrice: stop_loss
  });

  res.json({ buyOrder, tpOrder, slOrder });
});

app.listen(3000, () => {
  console.log('🟢 Servidor Spot MEXC listo en puerto 3000');
});
