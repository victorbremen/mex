// index.js
const express = require('express');
const crypto  = require('crypto');
const axios   = require('axios');

const app = express();
app.use(express.json());

const API_KEY    = process.env.API_KEY;
const API_SECRET = process.env.API_SECRET;

function sign(queryString) {
  return crypto
    .createHmac('sha256', API_SECRET)
    .update(queryString)
    .digest('hex');
}

async function getBalance(asset) {
  const timestamp = Date.now();
  const query     = `timestamp=${timestamp}`;
  const signature = sign(query);
  const url       = `https://api.mexc.com/api/v3/account?${query}&signature=${signature}`;

  try {
    const res = await axios.get(url, {
      headers: {
        'X-MEXC-APIKEY':  API_KEY,
        'Content-Type':   'application/json'
      }
    });
    const found = res.data.balances.find(b => b.asset === asset);
    return found ? parseFloat(found.free) : 0;
  } catch (err) {
    console.error('⛔ Error al obtener balance:', err.message);
    return 0;
  }
}

app.post('/ordenar', async (req, res) => {
  const { symbol, price } = req.body;
  if (!symbol || !price) {
    return res.status(400).json({ error: 'Faltan parámetros obligatorios' });
  }

  const balance = await getBalance('USDT');
  if (balance <= 0) {
    return res.status(400).json({ error: 'Saldo USDT insuficiente' });
  }

  const quantity  = (balance / parseFloat(price)).toFixed(6);
  const timestamp = Date.now();

  const params = new URLSearchParams({
    symbol,
    side: 'BUY',
    type: 'LIMIT',
    timeInForce: 'GTC',
    price,
    quantity,
    timestamp: timestamp.toString()
  });

  const signature = sign(params.toString());
  params.append('signature', signature);

  const url = `https://api.mexc.com/api/v3/order?${params.toString()}`;

  try {
    const response = await axios.post(
      url,
      null,
      {
        headers: {
          'X-MEXC-APIKEY': API_KEY,
          'Content-Type':  'application/json'    // ← imprescindible aquí
        }
      }
    );
    res.json({ result: response.data });
  } catch (err) {
    res.json({ error: err.response?.data || err.message });
  }
});

app.listen(3000, () => {
  console.log('🟢 Bot MEXC funcionando en puerto 3000');
});
