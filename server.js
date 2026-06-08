const express = require('express');
const WebSocket = require('ws');
const cors = require('cors');
const path = require('path');
const https = require('https');

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

let newCoins = [];
let clients = [];
let lastIds = new Set();

function fetchNewCoins() {
  const options = {
    hostname: 'frontend-api.pump.fun',
    path: '/coins?offset=0&limit=20&sort=created_timestamp&order=DESC&includeNsfw=false',
    method: 'GET',
    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
  };
  const req = https.request(options, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      try {
        const coins = JSON.parse(data);
        if (!Array.isArray(coins)) return;
        coins.forEach(coin => {
          if (lastIds.has(coin.mint)) return;
          lastIds.add(coin.mint);
          if (lastIds.size > 500) lastIds = new Set([...lastIds].slice(-200));
          processCoin(coin);
        });
      } catch(e) { console.log('خطأ:', e.message); }
    });
  });
  req.on('error', e => console.log('خطأ:', e.message));
  req.end();
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
    createdAt: coin.created_timestamp || Date.now(),
    pumpLink: 'https://pump.fun/' + coin.mint,
    dexLink: 'https://dexscreener.com/solana/' + coin.mint,
    score: calcScore(coin),
    twitter: coin.twitter || '',
    telegram: coin.telegram || '',
    website: coin.website || ''
  };
  newCoins.unshift(c);
  if (newCoins.length > 100) newCoins = newCoins.slice(0, 100);
  console.log('🚀 ' + c.name + ' (' + c.symbol + ') score:' + c.score);
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
  console.log('🌐 يعمل على المنفذ ' + (process.env.PORT || 3000));
});

const wss = new WebSocket.Server({ server, path: '/ws' });
wss.on('connection', (ws) => {
  clients.push(ws);
  ws.send(JSON.stringify({ type: 'init', coins: newCoins }));
  ws.on('close', () => { clients = clients.filter(c => c !== ws); });
});

console.log('🔄 بدء جلب العملات كل 10 ثواني...');
fetchNewCoins();
setInterval(fetchNewCoins, 10000);
