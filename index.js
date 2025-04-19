require('dotenv').config();
const express = require('express');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
app.use(express.json());

const API_KEY = process.env.BINANCE_API_KEY;
const API_SECRET = process.env.BINANCE_API_SECRET;
const BASE_URL = 'https://api.binance.com';

function sign(queryString) {
  return crypto.createHmac('sha256', API_SECRET).update(queryString).digest('hex');
}

async function getUSDCBalance() {
  const timestamp = Date.now();
  const query = `timestamp=${timestamp}`;
  const signature = sign(query);

  const response = await axios.get(`${BASE_URL}/api/v3/account?${query}&signature=${signature}`, {
    headers: { 'X-MBX-APIKEY': API_KEY },
  });

  const usdc = response.data.balances.find(b => b.asset === 'USDC');
  return parseFloat(usdc?.free || 0);
}

app.post('/orden', async (req, res) => {
  try {
    const { symbol, price, take_profit, stop_loss } = req.body;

    const balanceUSDC = await getUSDCBalance();
    const stepSize = 0.000001; // ajusta si usas otro par como ETHUSDC
    const rawQty = balanceUSDC / parseFloat(price);
    const quantity = (Math.floor(rawQty / stepSize) * stepSize).toFixed(6);

    const timestamp = Date.now();
    const baseParams = `symbol=${symbol}&side=BUY&type=LIMIT&timeInForce=GTC&quantity=${quantity}&price=${price}&recvWindow=60000&timestamp=${timestamp}`;
    const signature = sign(baseParams);

    await axios.post(`${BASE_URL}/api/v3/order?${baseParams}&signature=${signature}`, null, {
      headers: { 'X-MBX-APIKEY': API_KEY },
    });

    const tpParams = `symbol=${symbol}&side=SELL&type=LIMIT&timeInForce=GTC&quantity=${quantity}&price=${take_profit}&recvWindow=60000&timestamp=${Date.now()}`;
    const tpSignature = sign(tpParams);

    await axios.post(`${BASE_URL}/api/v3/order?${tpParams}&signature=${tpSignature}`, null, {
      headers: { 'X-MBX-APIKEY': API_KEY },
    });

    const slParams = `symbol=${symbol}&side=SELL&type=STOP_LOSS_LIMIT&quantity=${quantity}&price=${stop_loss}&stopPrice=${stop_loss}&timeInForce=GTC&recvWindow=60000&timestamp=${Date.now()}`;
    const slSignature = sign(slParams);

    await axios.post(`${BASE_URL}/api/v3/order?${slParams}&signature=${slSignature}`, null, {
      headers: { 'X-MBX-APIKEY': API_KEY },
    });

    res.json({ success: true, message: 'Orden creada con TP y SL usando saldo total USDC' });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ success: false, error: err.response?.data || err.message });
  }
});

app.listen(3000, () => {
  console.log('Servidor corriendo en puerto 3000');
});
