const express = require('express');
const axios   = require('axios');
const crypto  = require('crypto');
const fs      = require('fs');
const path    = require('path');

const app       = express();
const CACHE_DIR = path.join(__dirname, 'tts_cache');
const CACHE_TTL = 120 * 60 * 1000;

if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR);

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  next();
});

setInterval(() => {
  const now = Date.now();
  fs.readdirSync(CACHE_DIR).forEach(file => {
    const fp  = path.join(CACHE_DIR, file);
    const age = now - fs.statSync(fp).mtimeMs;
    if (age > CACHE_TTL) fs.unlinkSync(fp);
  });
}, 10 * 60 * 1000);

function cacheKey(q, tl, speed) {
  return crypto.createHash('md5').update(`${q}|${tl}|${speed}`).digest('hex');
}

function splitText(text, max) {
  max = max || 190;
  const words = text.split(' ');
  const chunks = [];
  let cur = '';
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const candidate = cur ? cur + ' ' + w : w;
    if (candidate.length > max) {
      if (cur) chunks.push(cur);
      cur = w;
    } else {
      cur = candidate;
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

app.get('/tts', async (req, res) => {
  const q     = req.query.q;
  const tl    = req.query.tl    || 'en';
  const speed = req.query.speed || '1';

  if (!q) return res.status(400).json({ error: 'Missing q' });

  const key  = cacheKey(q, tl, speed);
  const file = path.join(CACHE_DIR, key + '.mp3');

  if (fs.existsSync(file)) {
    const age = Date.now() - fs.statSync(file).mtimeMs;
    if (age < CACHE_TTL) {
      res.set('Content-Type', 'audio/mpeg');
      res.set('X-Cache', 'HIT');
      return res.sendFile(file);
    }
    fs.unlinkSync(file);
  }

  try {
    const chunks  = splitText(q);
    const buffers = [];
    for (let i = 0; i < chunks.length; i++) {
      const url = 'https://translate.google.com/translate_tts'
        + '?ie=UTF-8&q=' + encodeURIComponent(chunks[i])
        + '&tl=' + tl
        + '&client=tw-ob&ttsspeed=' + speed;
      const r = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 12000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://translate.google.com/'
        }
      });
      buffers.push(Buffer.from(r.data));
    }
    const audio = Buffer.concat(buffers);
    fs.writeFileSync(file, audio);
    res.set('Content-Type', 'audio/mpeg');
    res.set('X-Cache', 'MISS');
    res.send(audio);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/', function(req, res) {
  res.send('TTS Proxy running');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, function() {
  console.log('Running on port ' + PORT);
});
