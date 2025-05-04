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

    // Obtener filtros del símbolo
    const exchangeInfo = await axios.get(`${BASE_URL}/api/v3/exchangeInfo?symbol=${symbol}`);
    const filters = exchangeInfo.data.symbols[0].filters;
    const lotSizeFilter = filters.find(f => f.filterType === 'LOT_SIZE');
    const stepSize = parseFloat(lotSizeFilter.stepSize);
    const minQty = parseFloat(lotSizeFilter.minQty);

    // Calcular cantidad ajustada con el 99% del balance de USDC
    const balanceUSDC = await getUSDCBalance();
    const qtyRaw = (balanceUSDC * 0.99) / parseFloat(price);

    const stepSizeDecimals = (stepSize.toString().split('.')[1] || '').length;
    const quantity = (Math.floor(qtyRaw / stepSize) * stepSize).toFixed(stepSizeDecimals);

    if (parseFloat(quantity) < minQty) {
      return res.status(400).json({ success: false, error: 'Cantidad insuficiente para operar según LOT_SIZE' });
    }

    const timestamp = Date.now();
    const buyParams = `symbol=${symbol}&side=BUY&type=LIMIT&timeInForce=GTC&quantity=${quantity}&price=${price}&recvWindow=60000&timestamp=${timestamp}`;
    const buySignature = sign(buyParams);

    await axios.post(`${BASE_URL}/api/v3/order?${buyParams}&signature=${buySignature}`, null, {
      headers: { 'X-MBX-APIKEY': API_KEY },
    });

    // Crear orden de Take Profit (LIMIT SELL)
    const tpParams = `symbol=${symbol}&side=SELL&type=LIMIT&timeInForce=GTC&quantity=${quantity}&price=${take_profit}&recvWindow=60000&timestamp=${Date.now()}`;
    const tpSignature = sign(tpParams);

    await axios.post(`${BASE_URL}/api/v3/order?${tpParams}&signature=${tpSignature}`, null, {
      headers: { 'X-MBX-APIKEY': API_KEY },
    });

    // Crear orden de Stop Loss (STOP_LOSS_LIMIT)
    const slParams = `symbol=${symbol}&side=SELL&type=STOP_LOSS_LIMIT&quantity=${quantity}&price=${stop_loss}&stopPrice=${stop_loss}&timeInForce=GTC&recvWindow=60000&timestamp=${Date.now()}`;
    const slSignature = sign(slParams);

    await axios.post(`${BASE_URL}/api/v3/order?${slParams}&signature=${slSignature}`, null, {
      headers: { 'X-MBX-APIKEY': API_KEY },
    });

    res.json({ success: true, message: 'Orden BUY con TP y SL creada con USDC (99%)' });

  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ success: false, error: err.response?.data || err.message });
  }
});

app.listen(3000, () => {
  console.log('Servidor corriendo en puerto 3000');
});
