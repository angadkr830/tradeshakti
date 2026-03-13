# 🚀 Tradeshakti — Deployment Guide

A live NSE/BSE trade signal platform powered by Yahoo Finance.

## 📁 Project Structure
```
tradeshakti/
├── server.js          ← Node.js backend (Yahoo Finance proxy + cache)
├── package.json
├── render.yaml        ← Render.com auto-deploy config
├── Procfile           ← Railway / Heroku config
└── public/
    └── index.html     ← Full frontend (served by backend)
```

---

## ⚡ OPTION 1 — Render.com (FREE, Recommended)

1. **Push to GitHub**
   ```bash
   git init
   git add .
   git commit -m "Tradeshakti launch"
   git remote add origin https://github.com/YOUR_USERNAME/tradeshakti.git
   git push -u origin main
   ```

2. **Deploy on Render**
   - Go to [render.com](https://render.com) → Sign up free
   - Click **"New +"** → **"Web Service"**
   - Connect your GitHub repo
   - Settings auto-fill from `render.yaml`
   - Click **"Create Web Service"**
   - ✅ Live in ~2 minutes at `https://tradeshakti.onrender.com`

---

## ⚡ OPTION 2 — Railway.app (FREE $5 credit/month)

1. Go to [railway.app](https://railway.app) → Sign up with GitHub
2. Click **"New Project"** → **"Deploy from GitHub repo"**
3. Select your repo → Railway auto-detects Node.js
4. ✅ Live in 60 seconds

---

## ⚡ OPTION 3 — Run Locally

```bash
# Install dependencies
npm install

# Start server
node server.js

# Open browser
http://localhost:3000
```

---

## 🌐 Custom Domain (tradeshakti.in)

1. Buy domain at [namecheap.com](https://namecheap.com) (~₹500/year)
2. In Render dashboard → Settings → Custom Domains
3. Add your domain → Follow DNS instructions
4. Done! `tradeshakti.in` is live ✅

---

## 📡 API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/all` | All 25 stock/index quotes |
| `GET /api/quotes?symbols=TCS.NS,INFY.NS` | Specific quotes |
| `GET /api/history/TCS.NS?range=3mo` | Price history |
| `GET /api/search?q=TATA` | Symbol search |
| `GET /api/status` | Server health check |

---

## 🔄 How It Works

```
Visitor → tradeshakti.in → Your Server (Node.js)
                               ↓
                         Yahoo Finance API
                               ↓
                     Cache (60s quotes, 10min history)
                               ↓
                         Live data to all visitors
```

No CORS issues. Data cached so Yahoo Finance rate limits aren't hit.
