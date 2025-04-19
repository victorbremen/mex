const express = require('express');
const crypto = require('crypto');
const axios = require('axios');

const app = express();
app.use(express.json());

const API_KEY = process.env.API_KEY;
const API_SECRET = process.env.API_SECRET;

// Firma HMAC SHA256 para MEXC
function sign(queryString) {
  return crypto.createHmac('sha256', API_SECRET).update(queryString).digest('hex');
}

// Enviar orden Spot (CORREGIDO)
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

// Consultar estado de la orden
async function getOrderStatus(symbol, orderId) {
  const timestamp = Date.now();
  const query = `symbol=${symbol}&orderId=${orderId}&timestamp=${timestamp}`;
  const signature = sign(query);
  const url = `https://api.mexc.com/api/v3/order?${query}&signature=${signature}`;

  try {
    const res = await axios.get(url, {
      headers: { 'X-MEXC-APIKEY': API_KEY }
    });
    return res.data;
  } catch (err) {
    return { error: err.response?.data || err.message };
  }
}

// Ruta principal
app.post('/ordenar', async (req, res) => {
  const { symbol, price, quantity, stop_loss, take_profit } = req.body;

  // Orden de compra LIMIT
  const buyParams = {
    symbol,
    side: 'BUY',
    type: 'LIMIT',
    timeInForce: 'GTC',
    quantity,
    price
  };

  const buyOrder = await placeOrder(buyParams);
  if (buyOrder.error) return res.json({ buyOrder });

  // Esperar ejecución
  let status = '';
  for (let i = 0; i < 10; i++) {
    const result = await getOrderStatus(symbol, buyOrder.orderId);
    if (result.status === 'FILLED') {
      status = 'FILLED';
      break;
    }
    await new Promise(r => setTimeout(r, 3000));
  }

  if (status !== 'FILLED') {
    return res.json({ error: 'La orden de compra no se ejecutó a tiempo' });
  }

  // Take Profit
  const sellTP = await placeOrder({
    symbol,
    side: 'SELL',
    type: 'LIMIT',
    timeInForce: 'GTC',
    quantity,
    price: take_profit
  });

  // Stop Loss
  const sellSL = await placeOrder({
    symbol,
    side: 'SELL',
    type: 'STOP_LOSS_LIMIT',
    timeInForce: 'GTC',
    quantity,
    price: stop_loss,
    stopPrice: stop_loss
  });

  res.json({ buyOrder, sellTP, sellSL });
});

// Iniciar servidor
app.listen(3000, () => console.log('🟢 Servidor Spot listo en puerto 3000'));
