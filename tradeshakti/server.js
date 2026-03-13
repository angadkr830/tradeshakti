// ═══════════════════════════════════════════════════════════
//  TRADESHAKTI  —  Backend Server
//  Proxies Yahoo Finance API calls so all visitors get
//  live NSE/BSE data without CORS issues.
//
//  DEPLOY OPTIONS:
//    • Render.com   (free tier, recommended)
//    • Railway.app  (free tier)
//    • Heroku       (free tier removed, ~$5/mo)
//    • VPS / any Node.js host
//
//  LOCAL DEV:
//    npm install
//    node server.js   →  http://localhost:3000
// ═══════════════════════════════════════════════════════════

const express    = require('express');
const axios      = require('axios');
const cors       = require('cors');
const NodeCache  = require('node-cache');
const compression= require('compression');
const path       = require('path');

const app   = express();
const PORT  = process.env.PORT || 3000;

// ── CACHE  (quotes: 60s,  history: 10min) ──────────────────
const quoteCache   = new NodeCache({ stdTTL: 60,   checkperiod: 30 });
const historyCache = new NodeCache({ stdTTL: 600,  checkperiod: 60 });

// ── MIDDLEWARE ─────────────────────────────────────────────
app.use(compression());
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));  // serves index.html

// ── YAHOO FINANCE HEADERS ──────────────────────────────────
const YF_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
  'Origin': 'https://finance.yahoo.com',
  'Referer': 'https://finance.yahoo.com/',
};

// ── SYMBOLS ────────────────────────────────────────────────
const SYMBOLS = [
  '^NSEI', '^BSESN', '^NSEBANK', '^CNXIT', '^CNXAUTO', '^CNXPHARMA',
  'RELIANCE.NS','TCS.NS','HDFCBANK.NS','INFY.NS','ICICIBANK.NS',
  'BAJFINANCE.NS','WIPRO.NS','TATAMOTORS.NS','SBIN.NS','MARUTI.NS',
  'AXISBANK.NS','LT.NS','KOTAKBANK.NS','HINDUNILVR.NS','SUNPHARMA.NS',
  'ADANIENT.NS','ONGC.NS','DRREDDY.NS','TITAN.NS',
];

// ══════════════════════════════════════════════════════════
//  ROUTES
// ══════════════════════════════════════════════════════════

// ── GET /api/quotes?symbols=RELIANCE.NS,TCS.NS,... ─────────
app.get('/api/quotes', async (req, res) => {
  const syms = (req.query.symbols || SYMBOLS.join(',')).split(',').filter(Boolean);
  const cacheKey = 'quotes_' + syms.sort().join(',');

  // Return from cache if fresh
  const cached = quoteCache.get(cacheKey);
  if (cached) {
    return res.json({ source: 'cache', data: cached });
  }

  try {
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${syms.join(',')}`;
    const response = await axios.get(url, {
      headers: YF_HEADERS,
      timeout: 10000,
    });

    const result = response.data?.quoteResponse?.result || [];
    if (result.length === 0) throw new Error('Empty response');

    // Normalize data
    const quotes = result.map(q => ({
      symbol:       q.symbol,
      shortName:    q.shortName || q.longName || q.symbol,
      price:        q.regularMarketPrice,
      change:       q.regularMarketChange,
      changePct:    q.regularMarketChangePercent,
      open:         q.regularMarketOpen,
      high:         q.regularMarketDayHigh,
      low:          q.regularMarketDayLow,
      volume:       q.regularMarketVolume,
      avgVolume:    q.averageDailyVolume3Month,
      marketCap:    q.marketCap,
      high52:       q.fiftyTwoWeekHigh,
      low52:        q.fiftyTwoWeekLow,
      pe:           q.trailingPE,
      exchange:     q.fullExchangeName,
    }));

    quoteCache.set(cacheKey, quotes);
    res.json({ source: 'live', data: quotes });

  } catch (err) {
    console.error('[/api/quotes] Error:', err.message);
    // Try backup Yahoo URL
    try {
      const url2 = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${syms.join(',')}`;
      const r2 = await axios.get(url2, { headers: YF_HEADERS, timeout: 8000 });
      const result2 = r2.data?.quoteResponse?.result || [];
      const quotes2 = result2.map(q => ({
        symbol: q.symbol, shortName: q.shortName || q.symbol,
        price: q.regularMarketPrice, change: q.regularMarketChange,
        changePct: q.regularMarketChangePercent, open: q.regularMarketOpen,
        high: q.regularMarketDayHigh, low: q.regularMarketDayLow,
        volume: q.regularMarketVolume, avgVolume: q.averageDailyVolume3Month,
        high52: q.fiftyTwoWeekHigh, low52: q.fiftyTwoWeekLow,
        pe: q.trailingPE, exchange: q.fullExchangeName,
      }));
      quoteCache.set(cacheKey, quotes2);
      return res.json({ source: 'live_backup', data: quotes2 });
    } catch (e2) {
      res.status(503).json({ error: 'Yahoo Finance unavailable', message: err.message });
    }
  }
});

// ── GET /api/history/:symbol?range=3mo&interval=1d ─────────
app.get('/api/history/:symbol', async (req, res) => {
  const sym      = req.params.symbol;
  const range    = req.query.range    || '3mo';
  const interval = req.query.interval || '1d';
  const cacheKey = `hist_${sym}_${range}_${interval}`;

  const cached = historyCache.get(cacheKey);
  if (cached) {
    return res.json({ source: 'cache', data: cached });
  }

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=${interval}&range=${range}`;
    const response = await axios.get(url, { headers: YF_HEADERS, timeout: 12000 });

    const result = response.data?.chart?.result?.[0];
    if (!result) throw new Error('No chart data');

    const timestamps = result.timestamp || [];
    const quote      = result.indicators?.quote?.[0] || {};
    const closes     = quote.close   || [];
    const volumes    = quote.volume  || [];
    const opens      = quote.open    || [];
    const highs      = quote.high    || [];
    const lows       = quote.low     || [];

    const rows = timestamps.map((t, i) => ({
      date:   new Date(t * 1000).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
      close:  closes[i],
      open:   opens[i],
      high:   highs[i],
      low:    lows[i],
      volume: volumes[i] || 0,
    })).filter(r => r.close != null);

    if (rows.length < 5) throw new Error('Insufficient data');

    const data = {
      symbol:  sym,
      range,
      interval,
      meta:    result.meta,
      rows,
    };

    historyCache.set(cacheKey, data);
    res.json({ source: 'live', data });

  } catch (err) {
    console.error(`[/api/history/${sym}] Error:`, err.message);
    res.status(503).json({ error: 'History unavailable', symbol: sym, message: err.message });
  }
});

// ── GET /api/search?q=TATA ─────────────────────────────────
app.get('/api/search', async (req, res) => {
  const q = req.query.q;
  if (!q) return res.json({ data: [] });
  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&newsCount=0&enableFuzzyQuery=false&enableCb=true&enableNavLinks=false&enableEnhancedTrivialQuery=true`;
    const r = await axios.get(url, { headers: YF_HEADERS, timeout: 8000 });
    const quotes = (r.data?.quotes || [])
      .filter(q => q.exchange && (q.exchange.includes('NSE') || q.exchange.includes('BSE') || q.exchange.includes('SNP')))
      .slice(0, 8)
      .map(q => ({ symbol: q.symbol, name: q.shortname || q.longname, type: q.typeDisp, exchange: q.exchange }));
    res.json({ data: quotes });
  } catch (err) {
    res.status(503).json({ error: 'Search unavailable' });
  }
});

// ── GET /api/all  (all quotes in one shot) ─────────────────
app.get('/api/all', async (req, res) => {
  const cacheKey = 'all_quotes';
  const cached = quoteCache.get(cacheKey);
  if (cached) return res.json({ source: 'cache', data: cached });

  try {
    // Fetch in 2 batches to avoid URL length limits
    const batch1 = SYMBOLS.slice(0, 13);
    const batch2 = SYMBOLS.slice(13);
    const [r1, r2] = await Promise.all([
      axios.get(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${batch1.join(',')}`, { headers: YF_HEADERS, timeout: 12000 }),
      axios.get(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${batch2.join(',')}`, { headers: YF_HEADERS, timeout: 12000 }),
    ]);
    const all = [
      ...(r1.data?.quoteResponse?.result || []),
      ...(r2.data?.quoteResponse?.result || []),
    ].map(q => ({
      symbol: q.symbol, shortName: q.shortName || q.symbol,
      price: q.regularMarketPrice, change: q.regularMarketChange,
      changePct: q.regularMarketChangePercent, open: q.regularMarketOpen,
      high: q.regularMarketDayHigh, low: q.regularMarketDayLow,
      volume: q.regularMarketVolume, avgVolume: q.averageDailyVolume3Month,
      high52: q.fiftyTwoWeekHigh, low52: q.fiftyTwoWeekLow,
      pe: q.trailingPE,
    }));
    if (!all.length) throw new Error('Empty');
    quoteCache.set(cacheKey, all);
    res.json({ source: 'live', data: all });
  } catch (err) {
    console.error('[/api/all] Error:', err.message);
    res.status(503).json({ error: err.message });
  }
});

// ── GET /api/status ────────────────────────────────────────
app.get('/api/status', (req, res) => {
  res.json({
    status: 'ok',
    time: new Date().toISOString(),
    cacheStats: {
      quotes:  quoteCache.getStats(),
      history: historyCache.getStats(),
    },
  });
});

// ── Serve frontend for all other routes ───────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── START ──────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║   TradeShakti Server running on :${PORT}  ║
╚════════════════════════════════════════╝
  API endpoints:
    GET /api/all                 → all quotes
    GET /api/quotes?symbols=...  → specific quotes
    GET /api/history/:symbol     → price history
    GET /api/search?q=...        → symbol search
    GET /api/status              → health check
  `);
});

module.exports = app;
