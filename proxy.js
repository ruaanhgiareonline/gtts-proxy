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

// Dọn cache hết hạn mỗi 10 phút
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

function splitText(text, max = 190) {
  const words = text.split(' ');
  const chunks = [];
  let cur = '';
  for (const w of words) {
    const candidate = cur ? `${cur} ${w}` : w;
    if (candidate.length > max) { if (cur) chunks.push(cur); cur = w; }
    else cur = candidate;
  }
  if (cur) chunks.push(cur);
  return chunks;
}

app.get('/tts', async (req, res) => {
  const { q, tl = 'en', speed = '1' } = req.query;
  if (!q) return res.status(400).json({ error: 'Missing q' });

  const key  = cacheKey(q, tl, speed);
  const file = path.join(CACHE_DIR, `${key}.mp3`);

  // Có cache còn hạn → trả ngay
  if (fs.existsSync(file)) {
    const age = Date.now() - fs.statSync(file).mtimeMs;
    if (age < CACHE_TTL) {
      res.set('Content-Type', 'audio/mpeg');
      res.set('X-Cache', 'HIT');
      return res.sendFile(file);
    }
    fs.unlinkSync(file);
  }

  // Gọi Google TTS
  try {
    const chunks  = splitText(q);
    const buffers = [];
    for (const chunk of chunks) {
      const url = `https://translate.google.com/translate_tts`
        + `?ie=UTF-8&q=${encodeURIComponent(chunk)}`
        + `&tl=${tl}&client=tw-ob&ttsspeed=${speed}`;
      const r = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 12000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer':    'https://translate.google.com/'
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

app.get('/', (req, res) => res.send('✅ TTS Proxy running'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Running on port ${PORT}`));
```

---

### Bước 2: Deploy lên Render

**2.1** Vào [render.com](https://render.com) → **Sign up with GitHub**

**2.2** Sau khi đăng nhập → Nhấn **New +** → chọn **Web Service**

**2.3** Chọn repo `gtts-proxy` vừa tạo → Nhấn **Connect**

**2.4** Điền thông tin như sau:

| Trường | Giá trị |
|---|---|
| **Name** | `gtts-proxy` (tuỳ đặt) |
| **Region** | Singapore (gần VN nhất) |
| **Branch** | `main` |
| **Runtime** | `Node` |
| **Build Command** | `npm install` |
| **Start Command** | `npm start` |
| **Instance Type** | `Free` |

**2.5** Kéo xuống → Nhấn **Deploy Web Service**

**2.6** Đợi ~2–3 phút cho đến khi thấy chữ **Live** màu xanh

---

### Bước 3: Lấy URL

Sau khi deploy xong, Render hiển thị URL ngay đầu trang:
```
https://gtts-proxy.onrender.com
         ↑ tên bạn đặt ở bước 2.4
