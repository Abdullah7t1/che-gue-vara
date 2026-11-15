import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const STRATEGIES_FILE = path.join(__dirname, '.che_strategies.json');

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface StoredPineScript {
  id: string;
  name: string;
  code: string;
  enabled: boolean;
  isOverlay: boolean;
  createdAt: number;
}

const DEFAULT_PINE_SCRIPTS: StoredPineScript[] = [
  {
    id: 'che_ema_ribbon',
    name: 'Che EMA 9/21 Scalper',
    enabled: true,
    isOverlay: true,
    createdAt: Date.now() - 86400000,
    code: `//@version=5
strategy("Che EMA 9/21 Scalper", overlay=true)
fastLen = input.int(9, "Fast EMA")
slowLen = input.int(21, "Slow EMA")
emaFast = ta.ema(close, fastLen)
emaSlow = ta.ema(close, slowLen)
plot(emaFast, title="EMA Fast", color=color.green, linewidth=2)
plot(emaSlow, title="EMA Slow", color=color.red, linewidth=2)
longCond = ta.crossover(emaFast, emaSlow)
shortCond = ta.crossunder(emaFast, emaSlow)
if longCond
    strategy.entry("Buy", strategy.long)
if shortCond
    strategy.entry("Sell", strategy.short)`,
  },
  {
    id: 'che_bb_mean_revert',
    name: 'Bollinger 20/2.0 Institutional',
    enabled: false,
    isOverlay: true,
    createdAt: Date.now() - 43200000,
    code: `//@version=5
indicator("Bollinger 20/2.0 Institutional", overlay=true)
len = input.int(20, "BB Length")
mult = input.float(2.0, "Multiplier")
[middle, upper, lower] = ta.bb(close, len, mult)
plot(upper, title="BB Upper", color=color.amber, linewidth=1)
plot(middle, title="BB Basis", color=color.blue, linewidth=1)
plot(lower, title="BB Lower", color=color.amber, linewidth=1)`,
  },
];

// Ring buffer of real-time sub-minute ticks keyed by tvSymbol
const liveTickBuffer = new Map<string, { time: number; price: number }[]>();

function recordLiveTick(tvSymbol: string, price: number) {
  if (!Number.isFinite(price) || price <= 0) return;
  const nowSec = Math.floor(Date.now() / 1000);
  const arr = liveTickBuffer.get(tvSymbol) ?? [];
  const last = arr[arr.length - 1];
  if (!last || last.time !== nowSec) {
    arr.push({ time: nowSec, price });
  } else {
    last.price = price;
  }
  if (arr.length > 1800) arr.splice(0, arr.length - 1800);
  liveTickBuffer.set(tvSymbol, arr);
}

function aggregateCandles(candles: Candle[], bucketSeconds: number): Candle[] {
  if (candles.length === 0) return [];
  const map = new Map<number, Candle>();
  for (const c of candles) {
    const bucket = Math.floor(c.time / bucketSeconds) * bucketSeconds;
    const existing = map.get(bucket);
    if (!existing) {
      map.set(bucket, {
        time: bucket,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      });
    } else {
      existing.high = Math.max(existing.high, c.high);
      existing.low = Math.min(existing.low, c.low);
      existing.close = c.close;
      existing.volume += c.volume;
    }
  }
  return Array.from(map.values()).sort((a, b) => a.time - b.time);
}

function aggregateYearlyCandles(monthlyCandles: Candle[]): Candle[] {
  const map = new Map<number, Candle>();
  for (const c of monthlyCandles) {
    const d = new Date(c.time * 1000);
    const yearStart = Math.floor(Date.UTC(d.getUTCFullYear(), 0, 1) / 1000);
    const existing = map.get(yearStart);
    if (!existing) {
      map.set(yearStart, { ...c, time: yearStart });
    } else {
      existing.high = Math.max(existing.high, c.high);
      existing.low = Math.min(existing.low, c.low);
      existing.close = c.close;
      existing.volume += c.volume;
    }
  }
  return Array.from(map.values()).sort((a, b) => a.time - b.time);
}

async function fetchBinanceCandles(symbol: string, timeframe: string, limit = 300): Promise<Candle[]> {
  let interval = '1m';
  let aggSec = 0;
  let fetchLimit = Math.min(1000, Math.max(limit, 250));

  switch (timeframe) {
    case '1s':
      interval = '1s';
      break;
    case '5s':
      interval = '1s';
      aggSec = 5;
      fetchLimit = 1000;
      break;
    case '15s':
      interval = '1s';
      aggSec = 15;
      fetchLimit = 1000;
      break;
    case '30s':
      interval = '1s';
      aggSec = 30;
      fetchLimit = 1000;
      break;
    case '1m':
      interval = '1m';
      break;
    case '2m':
      interval = '1m';
      aggSec = 120;
      fetchLimit = 700;
      break;
    case '3m':
      interval = '3m';
      break;
    case '4m':
      interval = '1m';
      aggSec = 240;
      fetchLimit = 900;
      break;
    case '5m':
      interval = '5m';
      break;
    case '10m':
      interval = '5m';
      aggSec = 600;
      fetchLimit = 700;
      break;
    case '15m':
      interval = '15m';
      break;
    case '30m':
      interval = '30m';
      break;
    case '1h':
      interval = '1h';
      break;
    case '2h':
      interval = '2h';
      break;
    case '3h':
      interval = '1h';
      aggSec = 10800;
      fetchLimit = 900;
      break;
    case '4h':
      interval = '4h';
      break;
    case '5h':
      interval = '1h';
      aggSec = 18000;
      fetchLimit = 900;
      break;
    case '1D':
      interval = '1d';
      break;
    case '1W':
      interval = '1w';
      break;
    case '1M':
      interval = '1M';
      break;
    case '1Y':
      interval = '1M';
      fetchLimit = 200;
      break;
    default:
      interval = '5m';
  }

  const url = `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=${fetchLimit}`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!resp.ok) {
    throw new Error(`Binance HTTP ${resp.status}`);
  }
  const raw = (await resp.json()) as unknown[][];
  let candles: Candle[] = raw.map((row) => ({
    time: Math.floor(Number(row[0]) / 1000),
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
    volume: Number(row[5]),
  }));

  if (timeframe === '1Y') {
    candles = aggregateYearlyCandles(candles);
  } else if (aggSec > 0) {
    candles = aggregateCandles(candles, aggSec);
  }

  return candles.slice(-limit);
}

async function fetchTvSingleQuote(tvSymbol: string): Promise<{ price: number; changePct: number } | null> {
  const prefix = tvSymbol.split(':')[0]?.toUpperCase() || '';
  let market: 'cfd' | 'forex' | 'crypto' | 'america' = 'cfd';
  if (prefix === 'FX' || prefix === 'FX_IDC') market = 'forex';
  else if (prefix === 'BINANCE' || prefix === 'COINBASE' || prefix === 'CRYPTO') market = 'crypto';
  else if (prefix === 'NASDAQ' || prefix === 'NYSE' || prefix === 'AMEX') market = 'america';

  try {
    const resp = await fetch(`https://scanner.tradingview.com/${market}/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbols: { tickers: [tvSymbol] },
        columns: ['close', 'change'],
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) return null;
    const json = (await resp.json()) as { data?: { s: string; d: number[] }[] };
    const row = json.data?.[0];
    if (row && Number.isFinite(row.d[0])) {
      return { price: row.d[0], changePct: row.d[1] ?? 0 };
    }
  } catch {
    return null;
  }
  return null;
}

async function fetchYahooCandles(yahooSymbol: string, timeframe: string, tvSymbol: string, limit = 300): Promise<Candle[]> {
  let interval = '5m';
  let range = '5d';
  let aggSec = 0;

  switch (timeframe) {
    case '1s':
    case '5s':
    case '15s':
    case '30s':
    case '1m':
      interval = '1m';
      range = '1d';
      break;
    case '2m':
      interval = '2m';
      range = '1d';
      break;
    case '3m':
      interval = '1m';
      range = '1d';
      aggSec = 180;
      break;
    case '4m':
      interval = '2m';
      range = '1d';
      aggSec = 240;
      break;
    case '5m':
      interval = '5m';
      range = '5d';
      break;
    case '10m':
      interval = '5m';
      range = '5d';
      aggSec = 600;
      break;
    case '15m':
      interval = '15m';
      range = '5d';
      break;
    case '30m':
      interval = '30m';
      range = '1mo';
      break;
    case '1h':
      interval = '60m';
      range = '1mo';
      break;
    case '2h':
      interval = '60m';
      range = '1mo';
      aggSec = 7200;
      break;
    case '3h':
      interval = '60m';
      range = '3mo';
      aggSec = 10800;
      break;
    case '4h':
      interval = '60m';
      range = '3mo';
      aggSec = 14400;
      break;
    case '5h':
      interval = '60m';
      range = '3mo';
      aggSec = 18000;
      break;
    case '1D':
      interval = '1d';
      range = '1y';
      break;
    case '1W':
      interval = '1wk';
      range = '5y';
      break;
    case '1M':
      interval = '1mo';
      range = '10y';
      break;
    case '1Y':
      interval = '1mo';
      range = 'max';
      break;
    default:
      interval = '5m';
      range = '5d';
  }

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=${interval}&range=${range}&includePrePost=true`;
  const [yfResp, tvQuote] = await Promise.all([
    fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      signal: AbortSignal.timeout(8000),
    }),
    fetchTvSingleQuote(tvSymbol),
  ]);

  if (!yfResp.ok) {
    throw new Error(`Yahoo HTTP ${yfResp.status}`);
  }
  const json = (await yfResp.json()) as {
    chart?: {
      result?: Array<{
        timestamp?: number[];
        indicators?: {
          quote?: Array<{
            open?: (number | null)[];
            high?: (number | null)[];
            low?: (number | null)[];
            close?: (number | null)[];
            volume?: (number | null)[];
          }>;
        };
      }>;
    };
  };

  const result = json.chart?.result?.[0];
  const timestamps = result?.timestamp ?? [];
  const q = result?.indicators?.quote?.[0];
  if (!q || timestamps.length === 0) {
    throw new Error(`No candles returned for ${yahooSymbol}`);
  }

  let candles: Candle[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const o = q.open?.[i];
    const h = q.high?.[i];
    const l = q.low?.[i];
    const c = q.close?.[i];
    const v = q.volume?.[i] ?? 0;
    if (o != null && h != null && l != null && c != null && Number.isFinite(c)) {
      candles.push({
        time: timestamps[i],
        open: o,
        high: h,
        low: l,
        close: c,
        volume: v || 100,
      });
    }
  }

  // Align futures/CFD basis with live TradingView Scanner price if both exist and ratio is close (within 5%)
  if (tvQuote && candles.length > 0) {
    const lastYahoo = candles[candles.length - 1].close;
    const basisDiff = tvQuote.price - lastYahoo;
    if (Math.abs(basisDiff / tvQuote.price) < 0.05 && Math.abs(basisDiff) > 0) {
      candles = candles.map((bar) => ({
        ...bar,
        open: bar.open + basisDiff,
        high: bar.high + basisDiff,
        low: bar.low + basisDiff,
        close: bar.close + basisDiff,
      }));
    }
    recordLiveTick(tvSymbol, tvQuote.price);
  } else if (candles.length > 0) {
    recordLiveTick(tvSymbol, candles[candles.length - 1].close);
  }

  // Handle sub-minute timeframes (1s, 5s, 15s, 30s) using real 1m anchor + recorded live ticks
  if (['1s', '5s', '15s', '30s'].includes(timeframe)) {
    const step = timeframe === '1s' ? 1 : timeframe === '5s' ? 5 : timeframe === '15s' ? 15 : 30;
    const subCandles: Candle[] = [];
    const recent1m = candles.slice(-25);
    const ticks = liveTickBuffer.get(tvSymbol) ?? [];
    const tickBuckets = new Map<number, { open: number; high: number; low: number; close: number }>();

    for (const t of ticks) {
      const b = Math.floor(t.time / step) * step;
      const ex = tickBuckets.get(b);
      if (!ex) {
        tickBuckets.set(b, { open: t.price, high: t.price, low: t.price, close: t.price });
      } else {
        ex.high = Math.max(ex.high, t.price);
        ex.low = Math.min(ex.low, t.price);
        ex.close = t.price;
      }
    }

    for (const bar of recent1m) {
      const subsPerMin = 60 / step;
      const rangeSpan = bar.high - bar.low;
      const dir = bar.close >= bar.open ? 1 : -1;
      for (let s = 0; s < subsPerMin; s++) {
        const t = bar.time + s * step;
        const live = tickBuckets.get(t);
        if (live) {
          subCandles.push({
            time: t,
            open: live.open,
            high: live.high,
            low: live.low,
            close: live.close,
            volume: Math.max(1, Math.round(bar.volume / subsPerMin)),
          });
        } else {
          const frac0 = s / subsPerMin;
          const frac1 = (s + 1) / subsPerMin;
          const o = bar.open + (bar.close - bar.open) * frac0;
          const c = bar.open + (bar.close - bar.open) * frac1;
          const wickPad = rangeSpan * 0.15;
          subCandles.push({
            time: t,
            open: o,
            high: Math.min(bar.high, Math.max(o, c) + (dir > 0 ? wickPad : wickPad * 0.5)),
            low: Math.max(bar.low, Math.min(o, c) - (dir < 0 ? wickPad : wickPad * 0.5)),
            close: c,
            volume: Math.max(1, Math.round(bar.volume / subsPerMin)),
          });
        }
      }
    }
    return subCandles.slice(-limit);
  }

  if (timeframe === '1Y') {
    candles = aggregateYearlyCandles(candles);
  } else if (aggSec > 0) {
    candles = aggregateCandles(candles, aggSec);
  }

  return candles.slice(-limit);
}

async function loadStrategies(): Promise<StoredPineScript[]> {
  try {
    const raw = await fs.readFile(STRATEGIES_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch {
    // initialize default file
  }
  await fs.writeFile(STRATEGIES_FILE, JSON.stringify(DEFAULT_PINE_SCRIPTS, null, 2), 'utf-8');
  return DEFAULT_PINE_SCRIPTS;
}

async function saveStrategies(list: StoredPineScript[]): Promise<void> {
  await fs.writeFile(STRATEGIES_FILE, JSON.stringify(list, null, 2), 'utf-8');
}

function inferYahooSymbol(tvSymbol: string): string {
  const clean = tvSymbol.toUpperCase();
  const [exch, tickerRaw] = clean.includes(':') ? clean.split(':') : ['', clean];
  const ticker = tickerRaw.replace(/!$/, '');

  const exactMap: Record<string, string> = {
    'OANDA:XAUUSD': 'GC=F',
    'TVC:GOLD': 'GC=F',
    'OANDA:XAGUSD': 'SI=F',
    'TVC:SILVER': 'SI=F',
    'TVC:PLATINUM': 'PL=F',
    'TVC:USOIL': 'CL=F',
    'TVC:UKOIL': 'BZ=F',
    'NYMEX:NG1!': 'NG=F',
    'SP:SPX': '^GSPC',
    'NASDAQ:NDX': '^NDX',
    'DJ:DJI': '^DJI',
    'XETR:DAX': '^GDAXI',
    'TVC:UKX': '^FTSE',
  };
  if (exactMap[clean]) return exactMap[clean];
  if (exch === 'FX' || exch === 'FX_IDC' || exch === 'OANDA') {
    if (ticker.startsWith('XAU')) return 'GC=F';
    if (ticker.startsWith('XAG')) return 'SI=F';
    return `${ticker}=X`;
  }
  if (exch === 'BINANCE' || exch === 'COINBASE' || exch === 'CRYPTO') {
    const base = ticker.replace(/USDT$|USD$|BUSD$/, '');
    return `${base}-USD`;
  }
  return ticker;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', time: Date.now() });
  });

  // Fetch real OHLCV candles from Binance or Yahoo Finance + TradingView live alignment
  app.get('/api/candles', async (req, res) => {
    const tvSymbol = String(req.query.tvSymbol || 'OANDA:XAUUSD');
    const timeframe = String(req.query.timeframe || '5m');
    const limit = Math.min(500, Math.max(60, Number(req.query.limit) || 260));
    const binanceSymbol = req.query.binanceSymbol ? String(req.query.binanceSymbol) : '';
    const yahooSymbol = req.query.yahooSymbol ? String(req.query.yahooSymbol) : inferYahooSymbol(tvSymbol);

    try {
      let candles: Candle[] = [];
      let source = 'Yahoo Finance + TradingView';

      const derivedBinance =
        binanceSymbol ||
        (tvSymbol.startsWith('BINANCE:') ? tvSymbol.replace('BINANCE:', '') : '');

      if (derivedBinance) {
        try {
          candles = await fetchBinanceCandles(derivedBinance, timeframe, limit);
          source = 'Binance Live + TradingView';
        } catch {
          candles = await fetchYahooCandles(yahooSymbol, timeframe, tvSymbol, limit);
        }
      } else {
        candles = await fetchYahooCandles(yahooSymbol, timeframe, tvSymbol, limit);
      }

      res.json({
        tvSymbol,
        timeframe,
        source,
        candles,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Market feed unavailable';
      res.status(502).json({ error: msg, tvSymbol, timeframe, candles: [] });
    }
  });

  // Live TradingView Scanner batch query for watchlist win-rate ratios & real-time prices
  app.post('/api/tv-scanner', async (req, res) => {
    try {
      const groups = req.body?.groups as
        | Record<'cfd' | 'forex' | 'crypto' | 'america', string[]>
        | undefined;
      if (!groups) {
        return res.status(400).json({ error: 'Missing groups payload' });
      }

      const columns = ['close', 'change', 'Recommend.All', 'RSI', 'MACD.macd', 'MACD.signal', 'ADX', 'Stoch.K', 'Stoch.D', 'EMA20', 'EMA50'];

      const entries = (Object.entries(groups) as [string, string[]][]).filter(
        ([, tickers]) => Array.isArray(tickers) && tickers.length > 0
      );

      const results: Record<
        string,
        {
          price: number;
          changePct: number;
          tvRecommend: number;
          rsi: number | null;
          macd: number | null;
          macdSignal: number | null;
          winRateRatio: number;
          marketCondition: 'Optimal' | 'Strong' | 'Moderate' | 'Choppy';
          bias: 'BUY' | 'SELL' | 'NEUTRAL';
        }
      > = {};

      await Promise.all(
        entries.map(async ([market, tickers]) => {
          try {
            const resp = await fetch(`https://scanner.tradingview.com/${market}/scan`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ symbols: { tickers }, columns }),
              signal: AbortSignal.timeout(7000),
            });
            if (!resp.ok) return;
            const json = (await resp.json()) as {
              data?: Array<{ s: string; d: (number | null)[] }>;
            };
            for (const item of json.data ?? []) {
              const [price, changePct, recommend, rsi, macd, macdSignal, adx, stochK, stochD, ema20, ema50] = item.d;
              if (price == null || !Number.isFinite(price)) continue;

              recordLiveTick(item.s, price);

              const rec = recommend ?? 0;
              const absRec = Math.abs(rec);
              const adxVal = adx ?? 20;
              const emaAligned =
                ema20 != null && ema50 != null
                  ? (rec > 0 && ema20 > ema50) || (rec < 0 && ema20 < ema50)
                    ? 8
                    : -4
                  : 0;
              const macdAligned =
                macd != null && macdSignal != null
                  ? (rec > 0 && macd > macdSignal) || (rec < 0 && macd < macdSignal)
                    ? 6
                    : -3
                  : 0;
              const rsiHealth =
                rsi != null ? (rsi > 30 && rsi < 70 ? 4 : absRec > 0.3 ? 3 : -4) : 0;
              const stochAligned =
                stochK != null && stochD != null
                  ? (rec > 0 && stochK > stochD) || (rec < 0 && stochK < stochD)
                    ? 4
                    : -2
                  : 0;

              // Deterministic win-rate quality ratio derived from real TradingView technical consensus + trend strength (ADX)
              const rawScore = 51 + absRec * 28 + Math.min(adxVal, 45) * 0.22 + emaAligned + macdAligned + rsiHealth + stochAligned;
              const winRateRatio = Math.round(Math.max(44, Math.min(93.8, rawScore)) * 10) / 10;

              const marketCondition =
                winRateRatio >= 78
                  ? 'Optimal'
                  : winRateRatio >= 67
                  ? 'Strong'
                  : winRateRatio >= 56
                  ? 'Moderate'
                  : 'Choppy';

              const bias: 'BUY' | 'SELL' | 'NEUTRAL' =
                rec >= 0.12 ? 'BUY' : rec <= -0.12 ? 'SELL' : 'NEUTRAL';

              results[item.s] = {
                price,
                changePct: changePct ?? 0,
                tvRecommend: rec,
                rsi,
                macd,
                macdSignal,
                winRateRatio,
                marketCondition,
                bias,
              };
            }
          } catch {
            // Skip market group on timeout
          }
        })
      );

      res.json({ quotes: results, updatedAt: Date.now() });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Scanner error';
      res.status(500).json({ error: msg, quotes: {} });
    }
  });

  // Search ALL TradingView symbols globally
  app.get('/api/tv-search', async (req, res) => {
    const q = String(req.query.q || '').trim();
    if (!q) return res.json({ symbols: [] });
    try {
      const url = `https://symbol-search.tradingview.com/symbol_search/v3/?text=${encodeURIComponent(q)}&hl=0&exchange=&lang=en&search_type=undefined&domain=production`;
      const resp = await fetch(url, {
        headers: {
          Origin: 'https://www.tradingview.com',
          'User-Agent': 'Mozilla/5.0',
        },
        signal: AbortSignal.timeout(6000),
      });
      if (!resp.ok) throw new Error(`TV Search HTTP ${resp.status}`);
      const json = (await resp.json()) as {
        symbols?: Array<{
          symbol: string;
          description: string;
          type: string;
          exchange: string;
        }>;
      };
      const items = (json.symbols ?? []).slice(0, 20).map((s) => {
        const tvSymbol = `${s.exchange}:${s.symbol}`.replace(/<[^>]+>/g, '');
        const cleanSymbol = s.symbol.replace(/<[^>]+>/g, '');
        const cleanDesc = s.description.replace(/<[^>]+>/g, '');
        const typeLower = (s.type || '').toLowerCase();
        let category: 'metals' | 'forex' | 'crypto' | 'indices' | 'stocks' | 'commodities' = 'stocks';
        if (cleanSymbol.includes('XAU') || cleanSymbol.includes('XAG') || cleanDesc.toLowerCase().includes('gold') || cleanDesc.toLowerCase().includes('silver')) {
          category = 'metals';
        } else if (typeLower === 'forex') {
          category = 'forex';
        } else if (typeLower === 'crypto') {
          category = 'crypto';
        } else if (typeLower === 'index') {
          category = 'indices';
        } else if (typeLower === 'commodity' || typeLower === 'futures') {
          category = 'commodities';
        }

        const isBinance = s.exchange.toUpperCase() === 'BINANCE';
        return {
          id: tvSymbol.toLowerCase().replace(/[^a-z0-9]/g, '_'),
          symbol: cleanSymbol,
          tvSymbol,
          exnessSymbol: cleanSymbol,
          name: cleanDesc,
          category,
          binanceSymbol: isBinance ? cleanSymbol : undefined,
          yahooSymbol: inferYahooSymbol(tvSymbol),
          tvScannerMarket:
            category === 'forex'
              ? 'forex'
              : category === 'crypto'
              ? 'crypto'
              : category === 'stocks'
              ? 'america'
              : 'cfd',
          pipSize: category === 'forex' ? (cleanSymbol.includes('JPY') ? 0.01 : 0.0001) : 0.01,
          contractSize: category === 'forex' ? 100000 : category === 'metals' ? 100 : 1,
          decimals: category === 'forex' ? (cleanSymbol.includes('JPY') ? 3 : 5) : 2,
        };
      });
      res.json({ symbols: items });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Search failed';
      res.status(502).json({ error: msg, symbols: [] });
    }
  });

  // Persistent Pine Script Strategies API
  app.get('/api/strategies', async (_req, res) => {
    const list = await loadStrategies();
    res.json({ strategies: list });
  });

  app.post('/api/strategies', async (req, res) => {
    const { id, name, code, enabled, isOverlay } = req.body as Partial<StoredPineScript>;
    if (!name || !code) {
      return res.status(400).json({ error: 'Strategy name and Pine Script code are required.' });
    }
    const list = await loadStrategies();
    const existingIdx = id ? list.findIndex((s) => s.id === id) : -1;
    const item: StoredPineScript = {
      id: id || `pine_${Date.now()}`,
      name: String(name).trim(),
      code: String(code),
      enabled: enabled ?? true,
      isOverlay: isOverlay ?? !/overlay\s*=\s*false/i.test(String(code)),
      createdAt: existingIdx >= 0 ? list[existingIdx].createdAt : Date.now(),
    };
    if (existingIdx >= 0) {
      list[existingIdx] = item;
    } else {
      list.unshift(item);
    }
    await saveStrategies(list);
    res.json({ strategy: item, strategies: list });
  });

  app.delete('/api/strategies/:id', async (req, res) => {
    const list = await loadStrategies();
    const filtered = list.filter((s) => s.id !== req.params.id);
    await saveStrategies(filtered);
    res.json({ strategies: filtered });
  });

  if (process.env.NODE_ENV === 'production') {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Che Guevara Trading server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
