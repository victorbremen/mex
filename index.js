const express = require('express');
const crypto = require('crypto');
const axios = require('axios');

const app = express();
app.use(express.json());

const API_KEY = process.env.API_KEY;
const API_SECRET = process.env.API_SECRET;

const MEXC_BASE_URL = 'https://contract.mexc.com';
const MEXC_ORDER_ENDPOINT = '/api/v1/private/order/submit';

function sign(params) {
  const sorted = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  const signature = crypto.createHmac('sha256', API_SECRET).update(sorted).digest('hex');
  return { signature };
}

async function sendOrder(order) {
  const timestamp = Date.now();
  const params = {
    api_key: API_KEY,
    req_time: timestamp,
    symbol: order.symbol,
    price: order.price,
    vol: order.quantity,
    side: order.side,
    type: order.type,
    open_type: 'ISOLATED',
    leverage: 20,
    external_oid: `bot-${timestamp}`,
    stop_loss_price: order.stop_loss_price,
    take_profit_price: order.take_profit_price
  };

  const filtered = Object.fromEntries(Object.entries(params).filter(([_, v]) => v !== undefined && v !== ''));
  const { signature } = sign(filtered);
  filtered.sign = signature;

  try {
    const res = await axios.post(`${MEXC_BASE_URL}${MEXC_ORDER_ENDPOINT}`, filtered, {
      headers: { 'Content-Type': 'application/json' }
    });
    return res.data;
  } catch (err) {
    return { error: err.response?.data || err.message };
  }
}

app.post('/ordenar', async (req, res) => {
  const { entryOrder, stopLossOrder, takeProfitOrder } = req.body;
  const entry = await sendOrder(entryOrder);
  const sl = await sendOrder(stopLossOrder);
  const tp = await sendOrder(takeProfitOrder);
  res.json({ entry, stopLoss: sl, takeProfit: tp });
});

app.listen(3000, () => console.log('🟢 Servidor MEXC listo en puerto 3000'));
