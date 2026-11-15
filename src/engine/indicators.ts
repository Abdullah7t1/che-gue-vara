import { Candle } from '../types/trading';

export function calcSMA(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (period <= 0) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function calcEMA(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (period <= 0 || values.length < period) return out;
  const k = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  let prev = sum / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function calcWMA(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (period <= 0) return out;
  const denom = (period * (period + 1)) / 2;
  for (let i = period - 1; i < values.length; i++) {
    let acc = 0;
    for (let j = 0; j < period; j++) {
      acc += values[i - period + 1 + j] * (j + 1);
    }
    out[i] = acc / denom;
  }
  return out;
}

export function calcRMA(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (period <= 0 || values.length < period) return out;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  let prev = sum / period;
  out[period - 1] = prev;
  const alpha = 1 / period;
  for (let i = period; i < values.length; i++) {
    prev = alpha * values[i] + (1 - alpha) * prev;
    out[i] = prev;
  }
  return out;
}

export function calcHMA(values: number[], period: number): (number | null)[] {
  const half = Math.max(1, Math.floor(period / 2));
  const sqrtP = Math.max(1, Math.round(Math.sqrt(period)));
  const wmaHalf = calcWMA(values, half);
  const wmaFull = calcWMA(values, period);
  const diff: number[] = [];
  const startIdx = period - 1;
  for (let i = startIdx; i < values.length; i++) {
    const a = wmaHalf[i] ?? values[i];
    const b = wmaFull[i] ?? values[i];
    diff.push(2 * a - b);
  }
  const hmaSub = calcWMA(diff, sqrtP);
  const out: (number | null)[] = new Array(values.length).fill(null);
  for (let i = 0; i < hmaSub.length; i++) {
    out[startIdx + i] = hmaSub[i];
  }
  return out;
}

export function calcRSI(values: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length <= period) return out;
  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const ch = values[i] - values[i - 1];
    if (ch >= 0) gainSum += ch;
    else lossSum -= ch;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < values.length; i++) {
    const ch = values[i] - values[i - 1];
    const gain = ch > 0 ? ch : 0;
    const loss = ch < 0 ? -ch : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

export function calcMACD(
  values: number[],
  fast = 12,
  slow = 26,
  signalPeriod = 9
): { macd: (number | null)[]; signal: (number | null)[]; hist: (number | null)[] } {
  const emaFast = calcEMA(values, fast);
  const emaSlow = calcEMA(values, slow);
  const macdRaw: number[] = [];
  const macd: (number | null)[] = new Array(values.length).fill(null);
  let firstValid = -1;

  for (let i = 0; i < values.length; i++) {
    if (emaFast[i] != null && emaSlow[i] != null) {
      const m = emaFast[i]! - emaSlow[i]!;
      macd[i] = m;
      if (firstValid === -1) firstValid = i;
      macdRaw.push(m);
    }
  }

  const sigSub = calcEMA(macdRaw, signalPeriod);
  const signal: (number | null)[] = new Array(values.length).fill(null);
  const hist: (number | null)[] = new Array(values.length).fill(null);

  if (firstValid !== -1) {
    for (let j = 0; j < sigSub.length; j++) {
      const idx = firstValid + j;
      signal[idx] = sigSub[j];
      if (macd[idx] != null && sigSub[j] != null) {
        hist[idx] = macd[idx]! - sigSub[j]!;
      }
    }
  }
  return { macd, signal, hist };
}

export function calcBollinger(
  values: number[],
  period = 20,
  mult = 2.0
): { middle: (number | null)[]; upper: (number | null)[]; lower: (number | null)[] } {
  const middle = calcSMA(values, period);
  const upper: (number | null)[] = new Array(values.length).fill(null);
  const lower: (number | null)[] = new Array(values.length).fill(null);

  for (let i = period - 1; i < values.length; i++) {
    const mean = middle[i]!;
    let sq = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const d = values[j] - mean;
      sq += d * d;
    }
    const sd = Math.sqrt(sq / period);
    upper[i] = mean + mult * sd;
    lower[i] = mean - mult * sd;
  }
  return { middle, upper, lower };
}

export function calcATR(candles: Candle[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(candles.length).fill(null);
  if (candles.length < period + 1) return out;
  const tr: number[] = new Array(candles.length).fill(0);
  tr[0] = candles[0].high - candles[0].low;
  for (let i = 1; i < candles.length; i++) {
    const h = candles[i].high;
    const l = candles[i].low;
    const pc = candles[i - 1].close;
    tr[i] = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
  }
  return calcRMA(tr, period);
}

export function calcStochastic(
  candles: Candle[],
  kPeriod = 14,
  dPeriod = 3
): { k: (number | null)[]; d: (number | null)[] } {
  const k: (number | null)[] = new Array(candles.length).fill(null);
  const rawK: number[] = [];
  let firstValid = -1;

  for (let i = kPeriod - 1; i < candles.length; i++) {
    let hi = -Infinity;
    let lo = Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) {
      if (candles[j].high > hi) hi = candles[j].high;
      if (candles[j].low < lo) lo = candles[j].low;
    }
    const val = hi === lo ? 50 : ((candles[i].close - lo) / (hi - lo)) * 100;
    k[i] = val;
    if (firstValid === -1) firstValid = i;
    rawK.push(val);
  }

  const dSub = calcSMA(rawK, dPeriod);
  const d: (number | null)[] = new Array(candles.length).fill(null);
  if (firstValid !== -1) {
    for (let j = 0; j < dSub.length; j++) {
      d[firstValid + j] = dSub[j];
    }
  }
  return { k, d };
}

export function calcSuperTrend(
  candles: Candle[],
  period = 10,
  multiplier = 3.0
): { trend: (1 | -1 | null)[]; value: (number | null)[] } {
  const atr = calcATR(candles, period);
  const trend: (1 | -1 | null)[] = new Array(candles.length).fill(null);
  const value: (number | null)[] = new Array(candles.length).fill(null);
  const upperBand: number[] = new Array(candles.length).fill(0);
  const lowerBand: number[] = new Array(candles.length).fill(0);

  for (let i = 0; i < candles.length; i++) {
    if (atr[i] == null) continue;
    const hl2 = (candles[i].high + candles[i].low) / 2;
    const basicUpper = hl2 + multiplier * atr[i]!;
    const basicLower = hl2 - multiplier * atr[i]!;

    if (i === 0 || atr[i - 1] == null) {
      upperBand[i] = basicUpper;
      lowerBand[i] = basicLower;
      trend[i] = 1;
      value[i] = lowerBand[i];
      continue;
    }

    upperBand[i] =
      basicUpper < upperBand[i - 1] || candles[i - 1].close > upperBand[i - 1]
        ? basicUpper
        : upperBand[i - 1];
    lowerBand[i] =
      basicLower > lowerBand[i - 1] || candles[i - 1].close < lowerBand[i - 1]
        ? basicLower
        : lowerBand[i - 1];

    const prevTrend = trend[i - 1] ?? 1;
    let curTrend: 1 | -1 = prevTrend;
    if (prevTrend === -1 && candles[i].close > upperBand[i - 1]) curTrend = 1;
    else if (prevTrend === 1 && candles[i].close < lowerBand[i - 1]) curTrend = -1;

    trend[i] = curTrend;
    value[i] = curTrend === 1 ? lowerBand[i] : upperBand[i];
  }
  return { trend, value };
}

export function calcADX(
  candles: Candle[],
  period = 14
): { adx: (number | null)[]; plusDI: (number | null)[]; minusDI: (number | null)[] } {
  const len = candles.length;
  const plusDM = new Array(len).fill(0);
  const minusDM = new Array(len).fill(0);
  const tr = new Array(len).fill(0);

  for (let i = 1; i < len; i++) {
    const up = candles[i].high - candles[i - 1].high;
    const down = candles[i - 1].low - candles[i].low;
    plusDM[i] = up > down && up > 0 ? up : 0;
    minusDM[i] = down > up && down > 0 ? down : 0;
    tr[i] = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    );
  }

  const smTR = calcRMA(tr, period);
  const smPlus = calcRMA(plusDM, period);
  const smMinus = calcRMA(minusDM, period);
  const plusDI: (number | null)[] = new Array(len).fill(null);
  const minusDI: (number | null)[] = new Array(len).fill(null);
  const dxArr: number[] = [];
  let firstDx = -1;

  for (let i = 0; i < len; i++) {
    if (smTR[i] && smTR[i]! > 0 && smPlus[i] != null && smMinus[i] != null) {
      const pdi = (100 * smPlus[i]!) / smTR[i]!;
      const mdi = (100 * smMinus[i]!) / smTR[i]!;
      plusDI[i] = pdi;
      minusDI[i] = mdi;
      const denom = pdi + mdi;
      const dx = denom === 0 ? 0 : (100 * Math.abs(pdi - mdi)) / denom;
      if (firstDx === -1) firstDx = i;
      dxArr.push(dx);
    }
  }

  const adxSub = calcRMA(dxArr, period);
  const adx: (number | null)[] = new Array(len).fill(null);
  if (firstDx !== -1) {
    for (let j = 0; j < adxSub.length; j++) {
      adx[firstDx + j] = adxSub[j];
    }
  }
  return { adx, plusDI, minusDI };
}

export function calcCCI(candles: Candle[], period = 20): (number | null)[] {
  const tp = candles.map((c) => (c.high + c.low + c.close) / 3);
  const smaTp = calcSMA(tp, period);
  const out: (number | null)[] = new Array(candles.length).fill(null);
  for (let i = period - 1; i < candles.length; i++) {
    const mean = smaTp[i]!;
    let md = 0;
    for (let j = i - period + 1; j <= i; j++) {
      md += Math.abs(tp[j] - mean);
    }
    md /= period;
    out[i] = md === 0 ? 0 : (tp[i] - mean) / (0.015 * md);
  }
  return out;
}

export function calcWilliamsR(candles: Candle[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(candles.length).fill(null);
  for (let i = period - 1; i < candles.length; i++) {
    let hi = -Infinity;
    let lo = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      if (candles[j].high > hi) hi = candles[j].high;
      if (candles[j].low < lo) lo = candles[j].low;
    }
    out[i] = hi === lo ? -50 : ((hi - candles[i].close) / (hi - lo)) * -100;
  }
  return out;
}

export function calcOBV(candles: Candle[]): number[] {
  const out: number[] = new Array(candles.length).fill(0);
  for (let i = 1; i < candles.length; i++) {
    if (candles[i].close > candles[i - 1].close) out[i] = out[i - 1] + candles[i].volume;
    else if (candles[i].close < candles[i - 1].close) out[i] = out[i - 1] - candles[i].volume;
    else out[i] = out[i - 1];
  }
  return out;
}

export function calcVWAP(candles: Candle[]): number[] {
  const out: number[] = [];
  let cumPV = 0;
  let cumV = 0;
  for (const c of candles) {
    const tp = (c.high + c.low + c.close) / 3;
    const v = Math.max(c.volume, 1);
    cumPV += tp * v;
    cumV += v;
    out.push(cumPV / cumV);
  }
  return out;
}

export function calcHighest(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    let hi = -Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      if (values[j] > hi) hi = values[j];
    }
    out[i] = hi;
  }
  return out;
}

export function calcLowest(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    let lo = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      if (values[j] < lo) lo = values[j];
    }
    out[i] = lo;
  }
  return out;
}
