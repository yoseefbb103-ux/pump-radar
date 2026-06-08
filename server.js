const express = require('express');
const WebSocket = require('ws');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

let newCoins = [];
let clients = [];

function connectPumpFun() {
  console.log('🔌 جاري الاتصال بـ pump.fun...');
  const ws = new WebSocket('wss://frontend-api.pump.fun/socket.io/?EIO=4&transport=websocket');

  ws.on('open', () => {
    console.log('✅ متصل بـ pump.fun');
    ws.send('40');
  });

  ws.on('message', (data) => {
    const msg = data.toString();
    if (msg === '2') { ws.send('3'); return; }
    if (msg.startsWith('40')) {
      ws.send('42["subscribe",{"action":"newCoin"}]');
      return;
    }
    if (msg.startsWith('42')) {
      try {
        const json = JSON.parse(msg.slice(2));
        if (json[0] === 'newCoin') processCoin(json[1]);
      } catch(e) {}
    }
  });

  ws.on('close', () => {
    console.log('❌ انقطع، إعادة المحاولة...');
    setTimeout(connectPumpFun, 3000);
  });

  ws.on('error', (e) => console.log('خطأ:', e.message));
}

function processCoin(coin) {
  const c = {
    id: coin.mint || Date.now().toString(),
    name: coin.name || 'Unknown',
    symbol: coin.symbol || '???',
    address: coin.mint || '',
    image: coin.image_uri || '',
    description: coin.description || '',
    marketCap: coin.usd_market_cap || 0,
    createdAt: Date.now(),
    pumpLink: `https://pump.fun/${coin.mint}`,
    dexLink: `https://dexscreener.com/solana/${coin.mint}`,
    score: calcScore(coin),
    twitter: coin.twitter || '',
    telegram: coin.telegram || '',
    website: coin.website || ''
  };
  newCoins.unshift(c);
  if (newCoins.length > 100) newCoins = newCoins.slice(0, 100);
  console.log(`🚀 ${c.name} (${c.symbol}) - score:${c.score}`);
  broadcast({ type: 'newCoin', coin: c });
}

function calcScore(coin) {
  let s = 0;
  if (coin.twitter) s += 25;
  if (coin.telegram) s += 25;
  if (coin.website) s += 20;
  if (coin.description && coin.description.length > 50) s += 15;
  if (coin.image_uri) s += 15;
  return s;
}

function broadcast(data) {
  const msg = JSON.stringify(data);
  clients = clients.filter(c => c.readyState === WebSocket.OPEN);
  clients.forEach(c => c.send(msg));
}

app.get('/api/coins', (req, res) => res.json(newCoins));
app.get('/api/status', (req, res) => res.json({ ok: true, count: newCoins.length }));

const server = app.listen(process.env.PORT || 3000, () => {
  console.log(`🌐 يعمل على المنفذ ${process.env.PORT || 3000}`);
});

const wss = new WebSocket.Server({ server, path: '/ws' });
wss.on('connection', (ws) => {
  clients.push(ws);
  ws.send(JSON.stringify({ type: 'init', coins: newCoins }));
  ws.on('close', () => { clients = clients.filter(c => c !== ws); });
});

connectPumpFun();
