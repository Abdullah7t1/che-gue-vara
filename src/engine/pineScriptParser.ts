import {
  Candle,
  CompiledPineHLine,
  CompiledPineMarker,
  CompiledPinePlot,
  CompiledPineResult,
  PineScriptItem,
} from '../types/trading';
import {
  calcATR,
  calcBollinger,
  calcEMA,
  calcHighest,
  calcLowest,
  calcMACD,
  calcRMA,
  calcRSI,
  calcSMA,
  calcStochastic,
  calcSuperTrend,
  calcVWAP,
  calcWMA,
} from './indicators';

export const PINE_TEMPLATES: { name: string; code: string }[] = [
  {
    name: 'Che EMA 9/21 Scalper',
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
    name: 'SuperTrend Pro Institutional',
    code: `//@version=5
strategy("SuperTrend Pro Institutional", overlay=true)
atrLen = input.int(10, "ATR Length")
mult = input.float(3.0, "Factor")
[st, dir] = ta.supertrend(mult, atrLen)
plot(st, title="SuperTrend", color=color.amber, linewidth=2)
longCond = close > st and close[1] <= st[1]
shortCond = close < st and close[1] >= st[1]
if longCond
    strategy.entry("ST Buy", strategy.long)
if shortCond
    strategy.entry("ST Sell", strategy.short)`,
  },
  {
    name: 'Bollinger 20/2.0 Mean Reversion',
    code: `//@version=5
strategy("Bollinger 20/2.0 Mean Reversion", overlay=true)
len = input.int(20, "BB Length")
mult = input.float(2.0, "Multiplier")
[middle, upper, lower] = ta.bb(close, len, mult)
plot(upper, title="BB Upper", color=color.amber, linewidth=1)
plot(middle, title="BB Basis", color=color.blue, linewidth=1)
plot(lower, title="BB Lower", color=color.amber, linewidth=1)
longCond = ta.crossover(close, lower)
shortCond = ta.crossunder(close, upper)
if longCond
    strategy.entry("BB Buy", strategy.long)
if shortCond
    strategy.entry("BB Sell", strategy.short)`,
  },
  {
    name: 'RSI 14 Momentum Oscillator',
    code: `//@version=5
indicator("RSI 14 Momentum Oscillator", overlay=false)
rsiLen = input.int(14, "RSI Period")
r = ta.rsi(close, rsiLen)
plot(r, title="RSI 14", color=color.cyan, linewidth=2)
hline(70, "Overbought", color=color.red)
hline(30, "Oversold", color=color.green)`,
  },
  {
    name: 'Triple EMA 8/21/55 Trend Matrix',
    code: `//@version=5
strategy("Triple EMA 8/21/55 Trend Matrix", overlay=true)
e8 = ta.ema(close, 8)
e21 = ta.ema(close, 21)
e55 = ta.ema(close, 55)
plot(e8, title="EMA 8", color=color.green, linewidth=1)
plot(e21, title="EMA 21", color=color.blue, linewidth=2)
plot(e55, title="EMA 55", color=color.red, linewidth=2)
longCond = ta.crossover(e8, e21) and close > e55
shortCond = ta.crossunder(e8, e21) and close < e55
if longCond
    strategy.entry("Triple Long", strategy.long)
if shortCond
    strategy.entry("Triple Short", strategy.short)`,
  },
];

type SeriesValue = (number | boolean | null)[];

function resolveColor(token: string | undefined): string {
  if (!token) return '#38BDF8';
  const t = token.trim().toLowerCase();
  if (t.startsWith('#')) return t;
  if (t.includes('green') || t.includes('lime') || t.includes('teal')) return '#10B981';
  if (t.includes('red') || t.includes('maroon') || t.includes('crimson')) return '#EF4444';
  if (t.includes('amber') || t.includes('orange') || t.includes('yellow')) return '#F59E0B';
  if (t.includes('blue') || t.includes('navy')) return '#3B82F6';
  if (t.includes('cyan') || t.includes('aqua')) return '#06B6D4';
  if (t.includes('purple') || t.includes('fuchsia')) return '#A855F7';
  if (t.includes('white') || t.includes('silver')) return '#E2E8F0';
  return '#38BDF8';
}

function splitTopLevelArgs(str: string): string[] {
  const args: string[] = [];
  let depth = 0;
  let inQuote: string | null = null;
  let cur = '';
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (inQuote) {
      cur += ch;
      if (ch === inQuote && str[i - 1] !== '\\') inQuote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inQuote = ch;
      cur += ch;
      continue;
    }
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if (ch === ',' && depth === 0) {
      args.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) args.push(cur.trim());
  return args;
}

function stripKeywordPrefix(arg: string): { key: string | null; value: string } {
  const m = arg.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.+)$/);
  if (m) return { key: m[1].trim(), value: m[2].trim() };
  return { key: null, value: arg.trim() };
}

function toNumberArray(series: SeriesValue, fallback = 0): number[] {
  return series.map((v) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback));
}

export function compilePineScript(script: PineScriptItem, candles: Candle[]): CompiledPineResult {
  const errors: string[] = [];
  const plots: CompiledPinePlot[] = [];
  const hlines: CompiledPineHLine[] = [];
  const markers: CompiledPineMarker[] = [];

  if (candles.length < 5) {
    return {
      scriptId: script.id,
      name: script.name,
      isOverlay: script.isOverlay,
      plots,
      hlines,
      markers,
      latestSignal: 'NEUTRAL',
      errors,
    };
  }

  const len = candles.length;
  const env = new Map<string, SeriesValue>();

  // Built-in Pine series
  env.set('close', candles.map((c) => c.close));
  env.set('open', candles.map((c) => c.open));
  env.set('high', candles.map((c) => c.high));
  env.set('low', candles.map((c) => c.low));
  env.set('volume', candles.map((c) => c.volume));
  env.set('hl2', candles.map((c) => (c.high + c.low) / 2));
  env.set('hlc3', candles.map((c) => (c.high + c.low + c.close) / 3));
  env.set('ohlc4', candles.map((c) => (c.open + c.high + c.low + c.close) / 4));
  env.set('ta.vwap', calcVWAP(candles));
  env.set('vwap', calcVWAP(candles));

  let isOverlay = script.isOverlay;

  const evalScalar = (expr: string): number => {
    const clean = expr.trim();
    if (/^-?\d+(\.\d+)?$/.test(clean)) return Number(clean);
    const v = env.get(clean);
    if (v) {
      const last = v[v.length - 1];
      if (typeof last === 'number') return last;
    }
    return 14;
  };

  const evalExpr = (rawExpr: string): SeriesValue => {
    const expr = rawExpr.trim();

    // Numeric literal
    if (/^-?\d+(\.\d+)?$/.test(expr)) {
      const num = Number(expr);
      return new Array(len).fill(num);
    }
    if (expr === 'true') return new Array(len).fill(true);
    if (expr === 'false') return new Array(len).fill(false);

    // Direct variable or historical index e.g. close[1]
    const histMatch = expr.match(/^([a-zA-Z0-9_.]+)\[(\d+)\]$/);
    if (histMatch) {
      const base = env.get(histMatch[1]) ?? evalExpr(histMatch[1]);
      const shift = Number(histMatch[2]);
      return base.map((_, idx) => (idx - shift >= 0 ? base[idx - shift] : null));
    }

    if (env.has(expr)) {
      return env.get(expr)!;
    }

    // Parenthesized expression
    if (expr.startsWith('(') && expr.endsWith(')')) {
      return evalExpr(expr.slice(1, -1));
    }

    // input.int / input.float / input
    const inputMatch = expr.match(/^(?:input\.int|input\.float|input)\s*\((.+)\)$/);
    if (inputMatch) {
      const args = splitTopLevelArgs(inputMatch[1]);
      const defVal = stripKeywordPrefix(args[0] || '14').value;
      const num = Number(defVal);
      return new Array(len).fill(Number.isFinite(num) ? num : 14);
    }

    // Function calls like ta.ema(close, 9)
    const fnMatch = expr.match(/^([a-zA-Z0-9_.]+)\s*\((.*)\)$/);
    if (fnMatch) {
      const fn = fnMatch[1];
      const args = splitTopLevelArgs(fnMatch[2]).map((a) => stripKeywordPrefix(a).value);

      if (fn === 'ta.sma' || fn === 'sma') {
        const src = toNumberArray(evalExpr(args[0] || 'close'));
        const p = Math.max(1, Math.round(evalScalar(args[1] || '14')));
        return calcSMA(src, p);
      }
      if (fn === 'ta.ema' || fn === 'ema') {
        const src = toNumberArray(evalExpr(args[0] || 'close'));
        const p = Math.max(1, Math.round(evalScalar(args[1] || '14')));
        return calcEMA(src, p);
      }
      if (fn === 'ta.wma' || fn === 'wma') {
        const src = toNumberArray(evalExpr(args[0] || 'close'));
        const p = Math.max(1, Math.round(evalScalar(args[1] || '14')));
        return calcWMA(src, p);
      }
      if (fn === 'ta.rma' || fn === 'rma') {
        const src = toNumberArray(evalExpr(args[0] || 'close'));
        const p = Math.max(1, Math.round(evalScalar(args[1] || '14')));
        return calcRMA(src, p);
      }
      if (fn === 'ta.rsi' || fn === 'rsi') {
        const src = toNumberArray(evalExpr(args[0] || 'close'));
        const p = Math.max(1, Math.round(evalScalar(args[1] || '14')));
        return calcRSI(src, p);
      }
      if (fn === 'ta.atr' || fn === 'atr') {
        const p = Math.max(1, Math.round(evalScalar(args[0] || '14')));
        return calcATR(candles, p);
      }
      if (fn === 'ta.highest' || fn === 'highest') {
        const hasSrc = args.length >= 2;
        const src = toNumberArray(evalExpr(hasSrc ? args[0] : 'high'));
        const p = Math.max(1, Math.round(evalScalar(hasSrc ? args[1] : args[0] || '14')));
        return calcHighest(src, p);
      }
      if (fn === 'ta.lowest' || fn === 'lowest') {
        const hasSrc = args.length >= 2;
        const src = toNumberArray(evalExpr(hasSrc ? args[0] : 'low'));
        const p = Math.max(1, Math.round(evalScalar(hasSrc ? args[1] : args[0] || '14')));
        return calcLowest(src, p);
      }
      if (fn === 'ta.crossover' || fn === 'crossover') {
        const a = evalExpr(args[0]);
        const b = evalExpr(args[1]);
        return a.map((_, i) => {
          if (i === 0) return false;
          const a0 = a[i - 1];
          const b0 = b[i - 1];
          const a1 = a[i];
          const b1 = b[i];
          if (typeof a0 !== 'number' || typeof b0 !== 'number' || typeof a1 !== 'number' || typeof b1 !== 'number') {
            return false;
          }
          return a0 <= b0 && a1 > b1;
        });
      }
      if (fn === 'ta.crossunder' || fn === 'crossunder') {
        const a = evalExpr(args[0]);
        const b = evalExpr(args[1]);
        return a.map((_, i) => {
          if (i === 0) return false;
          const a0 = a[i - 1];
          const b0 = b[i - 1];
          const a1 = a[i];
          const b1 = b[i];
          if (typeof a0 !== 'number' || typeof b0 !== 'number' || typeof a1 !== 'number' || typeof b1 !== 'number') {
            return false;
          }
          return a0 >= b0 && a1 < b1;
        });
      }
      if (fn === 'math.abs' || fn === 'abs') {
        const a = evalExpr(args[0]);
        return a.map((v) => (typeof v === 'number' ? Math.abs(v) : null));
      }
      if (fn === 'math.max' || fn === 'max') {
        const a = evalExpr(args[0]);
        const b = evalExpr(args[1]);
        return a.map((v, i) => (typeof v === 'number' && typeof b[i] === 'number' ? Math.max(v, b[i] as number) : null));
      }
      if (fn === 'math.min' || fn === 'min') {
        const a = evalExpr(args[0]);
        const b = evalExpr(args[1]);
        return a.map((v, i) => (typeof v === 'number' && typeof b[i] === 'number' ? Math.min(v, b[i] as number) : null));
      }
      if (fn === 'nz') {
        const a = evalExpr(args[0]);
        const rep = args[1] ? evalScalar(args[1]) : 0;
        return a.map((v) => (v == null ? rep : v));
      }
    }

    // Boolean logical operators (and / or)
    const orParts = splitLogical(expr, 'or');
    if (orParts.length > 1) {
      const evaluated = orParts.map(evalExpr);
      return new Array(len).fill(false).map((_, i) => evaluated.some((s) => Boolean(s[i])));
    }
    const andParts = splitLogical(expr, 'and');
    if (andParts.length > 1) {
      const evaluated = andParts.map(evalExpr);
      return new Array(len).fill(false).map((_, i) => evaluated.every((s) => Boolean(s[i])));
    }

    // Comparison operators
    const cmpMatch = expr.match(/^(.+?)\s*(>=|<=|==|!=|>|<)\s*(.+)$/);
    if (cmpMatch) {
      const left = evalExpr(cmpMatch[1]);
      const op = cmpMatch[2];
      const right = evalExpr(cmpMatch[3]);
      return left.map((lv, i) => {
        const rv = right[i];
        if (lv == null || rv == null) return false;
        const l = Number(lv);
        const r = Number(rv);
        if (op === '>') return l > r;
        if (op === '<') return l < r;
        if (op === '>=') return l >= r;
        if (op === '<=') return l <= r;
        if (op === '==') return l === r;
        if (op === '!=') return l !== r;
        return false;
      });
    }

    // Arithmetic (+, -, *, /)
    const arithMatch = splitArithmetic(expr);
    if (arithMatch) {
      const left = evalExpr(arithMatch.left);
      const right = evalExpr(arithMatch.right);
      const op = arithMatch.op;
      return left.map((lv, i) => {
        const rv = right[i];
        if (typeof lv !== 'number' || typeof rv !== 'number') return null;
        if (op === '+') return lv + rv;
        if (op === '-') return lv - rv;
        if (op === '*') return lv * rv;
        if (op === '/') return rv === 0 ? null : lv / rv;
        return null;
      });
    }

    return new Array(len).fill(null);
  };

  // Line-by-line execution
  const lines = script.code.split('\n');
  let activeCondition: SeriesValue | null = null;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const rawLine = lines[lineIdx];
    const trimmed = rawLine.replace(/\/\/.*$/, '').trim();
    if (!trimmed) continue;

    // Reset if-block condition when unindented
    const isIndented = /^\s+/.test(rawLine);
    if (!isIndented && !trimmed.startsWith('if ')) {
      activeCondition = null;
    }

    // indicator(...) / strategy(...)
    const headerMatch = trimmed.match(/^(?:indicator|strategy|study)\s*\((.+)\)$/);
    if (headerMatch) {
      if (/overlay\s*=\s*false/i.test(headerMatch[1])) isOverlay = false;
      else if (/overlay\s*=\s*true/i.test(headerMatch[1])) isOverlay = true;
      continue;
    }

    // Tuple assignment: [a, b, c] = ta.bb(...) | ta.macd(...) | ta.supertrend(...) | ta.stoch(...)
    const tupleMatch = trimmed.match(/^\[([^\]]+)\]\s*=\s*(.+)$/);
    if (tupleMatch) {
      const vars = tupleMatch[1].split(',').map((s) => s.trim());
      const rhs = tupleMatch[2].trim();
      const fnM = rhs.match(/^([a-zA-Z0-9_.]+)\s*\((.*)\)$/);
      if (fnM) {
        const fn = fnM[1];
        const args = splitTopLevelArgs(fnM[2]).map((a) => stripKeywordPrefix(a).value);
        if (fn === 'ta.bb' || fn === 'bb') {
          const src = toNumberArray(evalExpr(args[0] || 'close'));
          const p = Math.max(2, Math.round(evalScalar(args[1] || '20')));
          const mult = evalScalar(args[2] || '2');
          const bb = calcBollinger(src, p, mult);
          if (vars[0]) env.set(vars[0], bb.middle);
          if (vars[1]) env.set(vars[1], bb.upper);
          if (vars[2]) env.set(vars[2], bb.lower);
        } else if (fn === 'ta.macd' || fn === 'macd') {
          const src = toNumberArray(evalExpr(args[0] || 'close'));
          const fast = Math.round(evalScalar(args[1] || '12'));
          const slow = Math.round(evalScalar(args[2] || '26'));
          const sig = Math.round(evalScalar(args[3] || '9'));
          const m = calcMACD(src, fast, slow, sig);
          if (vars[0]) env.set(vars[0], m.macd);
          if (vars[1]) env.set(vars[1], m.signal);
          if (vars[2]) env.set(vars[2], m.hist);
        } else if (fn === 'ta.supertrend' || fn === 'supertrend') {
          const factor = evalScalar(args[0] || '3');
          const p = Math.round(evalScalar(args[1] || '10'));
          const st = calcSuperTrend(candles, p, factor);
          if (vars[0]) env.set(vars[0], st.value);
          if (vars[1]) env.set(vars[1], st.trend);
        } else if (fn === 'ta.stoch' || fn === 'stoch') {
          const p = Math.round(evalScalar(args[3] || args[0] || '14'));
          const st = calcStochastic(candles, p, 3);
          if (vars[0]) env.set(vars[0], st.k);
          if (vars[1]) env.set(vars[1], st.d);
        }
      }
      continue;
    }

    // if <cond>
    if (trimmed.startsWith('if ')) {
      const condExpr = trimmed.slice(3).trim();
      activeCondition = evalExpr(condExpr);
      continue;
    }

    // plot(...)
    const plotMatch = trimmed.match(/^plot\s*\((.+)\)$/);
    if (plotMatch) {
      const args = splitTopLevelArgs(plotMatch[1]);
      let seriesExpr = '';
      let title = `Plot ${plots.length + 1}`;
      let color = '#38BDF8';
      let lineWidth = 2;
      let style: 'line' | 'histogram' = 'line';

      args.forEach((arg, idx) => {
        const { key, value } = stripKeywordPrefix(arg);
        if (idx === 0 && !key) seriesExpr = value;
        else if (key === 'series') seriesExpr = value;
        else if (key === 'title' || (idx === 1 && !key)) title = value.replace(/^["']|["']$/g, '');
        else if (key === 'color' || (idx === 2 && !key)) color = resolveColor(value);
        else if (key === 'linewidth') lineWidth = Math.max(1, Math.min(4, Number(value) || 2));
        else if (key === 'style' && value.includes('histogram')) style = 'histogram';
      });

      const vals = evalExpr(seriesExpr);
      const data: { time: number; value: number }[] = [];
      for (let i = 0; i < len; i++) {
        const v = vals[i];
        if (typeof v === 'number' && Number.isFinite(v)) {
          data.push({ time: candles[i].time, value: v });
        }
      }
      if (data.length > 0) {
        plots.push({ title, color, lineWidth, style, data });
      }
      continue;
    }

    // hline(...)
    const hlineMatch = trimmed.match(/^hline\s*\((.+)\)$/);
    if (hlineMatch) {
      const args = splitTopLevelArgs(hlineMatch[1]);
      const priceVal = Number(stripKeywordPrefix(args[0]).value);
      let title = `Level ${priceVal}`;
      let color = '#64748B';
      for (const arg of args.slice(1)) {
        const { key, value } = stripKeywordPrefix(arg);
        if (key === 'title' || !key) title = value.replace(/^["']|["']$/g, '');
        if (key === 'color') color = resolveColor(value);
      }
      if (Number.isFinite(priceVal)) {
        hlines.push({ title, price: priceVal, color });
      }
      continue;
    }

    // strategy.entry("Buy", strategy.long, when=...)
    const entryMatch = trimmed.match(/^strategy\.entry\s*\((.+)\)$/);
    if (entryMatch) {
      const args = splitTopLevelArgs(entryMatch[1]);
      const label = stripKeywordPrefix(args[0]).value.replace(/^["']|["']$/g, '') || 'Signal';
      const dirArg = (args[1] || '').toLowerCase();
      const isLong = dirArg.includes('long') || (!dirArg.includes('short') && label.toLowerCase().includes('buy'));
      let condSeries = activeCondition;
      for (const a of args) {
        const { key, value } = stripKeywordPrefix(a);
        if (key === 'when') condSeries = evalExpr(value);
      }
      if (condSeries) {
        for (let i = 0; i < len; i++) {
          if (condSeries[i]) {
            markers.push({
              time: candles[i].time,
              position: isLong ? 'belowBar' : 'aboveBar',
              color: isLong ? '#10B981' : '#EF4444',
              shape: isLong ? 'arrowUp' : 'arrowDown',
              text: `${label}`,
              signal: isLong ? 'BUY' : 'SELL',
            });
          }
        }
      }
      continue;
    }

    // Variable assignment: varName = expr
    const assignMatch = trimmed.match(/^(?:(?:var|float|int|bool)\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\s*:?=\s*(.+)$/);
    if (assignMatch) {
      const varName = assignMatch[1];
      const rhs = assignMatch[2];
      try {
        env.set(varName, evalExpr(rhs));
      } catch (e) {
        errors.push(`Line ${lineIdx + 1}: Could not evaluate ${varName}`);
      }
    }
  }

  markers.sort((a, b) => a.time - b.time);
  const recentMarkers = markers.filter((m) => m.time >= candles[Math.max(0, len - 6)].time);
  const latestSignal =
    recentMarkers.length > 0 ? recentMarkers[recentMarkers.length - 1].signal : 'NEUTRAL';

  return {
    scriptId: script.id,
    name: script.name,
    isOverlay,
    plots,
    hlines,
    markers,
    latestSignal,
    errors,
  };
}

function splitLogical(expr: string, op: 'and' | 'or'): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = '';
  const tokens = expr.split(/\s+/);
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    for (const ch of t) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
    }
    if (t === op && depth === 0) {
      parts.push(cur.trim());
      cur = '';
    } else {
      cur += (cur ? ' ' : '') + t;
    }
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

function splitArithmetic(expr: string): { left: string; op: string; right: string } | null {
  let depth = 0;
  for (let i = expr.length - 1; i >= 1; i--) {
    const ch = expr[i];
    if (ch === ')') depth++;
    else if (ch === '(') depth--;
    else if (depth === 0 && (ch === '+' || ch === '-')) {
      return { left: expr.slice(0, i).trim(), op: ch, right: expr.slice(i + 1).trim() };
    }
  }
  depth = 0;
  for (let i = expr.length - 1; i >= 1; i--) {
    const ch = expr[i];
    if (ch === ')') depth++;
    else if (ch === '(') depth--;
    else if (depth === 0 && (ch === '*' || ch === '/')) {
      return { left: expr.slice(0, i).trim(), op: ch, right: expr.slice(i + 1).trim() };
    }
  }
  return null;
}
