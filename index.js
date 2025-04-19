const express = require('express');
const crypto = require('crypto');
const axios = require('axios');

const app = express();
app.use(express.json());

// 👉 TUS CLAVES
const API_KEY = 'bNupFgyDRmoCr1vrFGI75mpldGp1nICYKPUO68aLiS1WBRdhK3AG88YFcthiMPIA';
const API_SECRET = '8ZdMgbFEUQ85t7RhFKedRqrPhVhFG75x1CkfyEoUbdi6sh0UCBre2FmLhbMmCuOd';

const BINANCE_URL = 'https://fapi.binance.com/fapi/v1/order';

function signQuery(params) {
  const queryString = new URLSearchParams(params).toString();
  const signature = crypto
    .createHmac('sha256', API_SECRET)
    .update(queryString)
    .digest('hex');
  return `${queryString}&signature=${signature}`;
}

async function sendOrder(order) {
  const timestamp = Date.now();
  const baseParams = {
    symbol: order.symbol,
    side: order.side,
    type: order.type,
    quantity: order.quantity,
    timeInForce: order.timeInForce,
    price: order.price,
    stopPrice: order.stopPrice,
    closePosition: order.closePosition,
    timestamp,
    recvWindow: 5000
  };

  const filteredParams = Object.fromEntries(
    Object.entries(baseParams).filter(([_, v]) => v !== undefined)
  );

  const signedQuery = signQuery(filteredParams);

  try {
    const response = await axios.post(`${BINANCE_URL}?${signedQuery}`, null, {
      headers: { 'X-MBX-APIKEY': API_KEY }
    });
    return response.data;
  } catch (error) {
    return { error: error.response?.data || error.message };
  }
}

app.post('/ordenar', async (req, res) => {
  const { entryOrder, stopLossOrder, takeProfitOrder } = req.body;

  const results = {
    entry: await sendOrder(entryOrder),
    stopLoss: await sendOrder(stopLossOrder),
    takeProfit: await sendOrder(takeProfitOrder)
  };

  res.json(results);
});

app.listen(3000, () => console.log('🟢 Servidor listo en http://localhost:3000'));
