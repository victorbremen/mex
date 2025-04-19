const express = require('express');
const crypto = require('crypto');
const axios = require('axios');

const app = express();
app.use(express.json());

// 🔑 Claves de tu cuenta
const API_KEY = process.env.API_KEY;
const API_SECRET = process.env.API_SECRET;

// 🧠 Firma HMAC SHA256
function sign(queryString) {
  return crypto.createHmac('sha256', API_SECRET).update(queryString).digest('hex');
}

// 🔁 Ejecutar orden en Spot
async function placeOrder(params) {
  const timestamp = Date.now();
  const query = new URLSearchParams({
    ...params,
    timestamp
  }).toString();

  const signature = sign(query);
  const finalQuery = `${query}&signature=${signature}`;

  try {
    const res = await axios.post(`https://api.mexc.com/api/v3/order?${finalQuery}`, null, {
      headers: { 'X-MEXC-APIKEY': API_KEY }
    });
    return res.data;
  } catch (err) {
    return { error: err.response?.data || err.message };
  }
}

// 🔎 Consulta una orden por ID
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

app.post('/ordenar', async (req, res) => {
  const { symbol, price, quantity, stop_loss, take_profit } = req.body;

  // Paso 1: orden BUY LIMIT
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

  // Paso 2: esperar que se ejecute
  let status = '';
  for (let i = 0; i < 10; i++) {
    const result = await getOrderStatus(symbol, buyOrder.orderId);
    if (result.status === 'FILLED') {
      status = 'FILLED';
      break;
    }
    await new Promise(r => setTimeout(r, 3000)); // espera 3 segundos
  }

  if (status !== 'FILLED') return res.json({ error: 'La orden de compra no se ejecutó a tiempo' });

  // Paso 3: colocar TP y SL (como órdenes independientes)
  const sellTP = await placeOrder({
    symbol,
    side: 'SELL',
    type: 'LIMIT',
    timeInForce: 'GTC',
    quantity,
    price: take_profit
  });

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

app.listen(3000, () => console.log('🟢 Servidor Spot listo en puerto 3000'));
