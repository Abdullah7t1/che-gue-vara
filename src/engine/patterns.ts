import { Candle, PatternMatch } from '../types/trading';

export function detectCandlestickPatterns(candles: Candle[]): PatternMatch[] {
  const matches: PatternMatch[] = [];
  if (candles.length < 5) return matches;

  for (let i = 2; i < candles.length; i++) {
    const c = candles[i];
    const p1 = candles[i - 1];
    const p2 = candles[i - 2];

    const range = Math.max(c.high - c.low, 1e-9);
    const body = Math.abs(c.close - c.open);
    const upperWick = c.high - Math.max(c.open, c.close);
    const lowerWick = Math.min(c.open, c.close) - c.low;
    const isBull = c.close >= c.open;
    const isBear = c.close < c.open;

    const p1Range = Math.max(p1.high - p1.low, 1e-9);
    const p1Body = Math.abs(p1.close - p1.open);
    const p1Bull = p1.close > p1.open;
    const p1Bear = p1.close < p1.open;

    // 1. Doji Family (explicitly requested by user)
    if (body <= range * 0.11) {
      if (lowerWick >= range * 0.6 && upperWick <= range * 0.18) {
        matches.push({
          index: i,
          time: c.time,
          name: 'Dragonfly Doji',
          type: 'bullish',
          strength: 3,
          description: 'Long lower rejection wick with flat close near high — strong bullish reversal Doji.',
        });
      } else if (upperWick >= range * 0.6 && lowerWick <= range * 0.18) {
        matches.push({
          index: i,
          time: c.time,
          name: 'Gravestone Doji',
          type: 'bearish',
          strength: 3,
          description: 'Long upper rejection wick with flat close near low — strong bearish reversal Doji.',
        });
      } else if (upperWick >= range * 0.35 && lowerWick >= range * 0.35) {
        matches.push({
          index: i,
          time: c.time,
          name: 'Long-Legged Doji',
          type: 'neutral',
          strength: 2,
          description: 'High volatility indecision candle signaling impending directional breakout.',
        });
      } else {
        matches.push({
          index: i,
          time: c.time,
          name: 'Classic Doji',
          type: 'neutral',
          strength: 2,
          description: 'Equilibrium between buyers and sellers; watch next candle confirmation.',
        });
      }
    }

    // 2. Engulfing Patterns (explicitly requested by user)
    if (
      p1Bear &&
      isBull &&
      c.open <= p1.close &&
      c.close >= p1.open &&
      body > p1Body * 1.05
    ) {
      matches.push({
        index: i,
        time: c.time,
        name: 'Bullish Engulfing',
        type: 'bullish',
        strength: 3,
        description: 'Buyer candle completely engulfs prior bearish body — high-probability upside reversal.',
      });
    } else if (
      p1Bull &&
      isBear &&
      c.open >= p1.close &&
      c.close <= p1.open &&
      body > p1Body * 1.05
    ) {
      matches.push({
        index: i,
        time: c.time,
        name: 'Bearish Engulfing',
        type: 'bearish',
        strength: 3,
        description: 'Seller candle completely engulfs prior bullish body — high-probability downside reversal.',
      });
    }

    // 3. Hammer / Shooting Star / Pin Bar
    if (body > range * 0.1 && body <= range * 0.35) {
      if (lowerWick >= body * 2.1 && upperWick <= body * 0.5) {
        matches.push({
          index: i,
          time: c.time,
          name: 'Bullish Pin / Hammer',
          type: 'bullish',
          strength: 2,
          description: 'Deep liquidity sweep below support followed by strong rejection close.',
        });
      } else if (upperWick >= body * 2.1 && lowerWick <= body * 0.5) {
        matches.push({
          index: i,
          time: c.time,
          name: 'Shooting Star / Bear Pin',
          type: 'bearish',
          strength: 2,
          description: 'Upper liquidity sweep rejected by aggressive selling pressure.',
        });
      }
    }

    // 4. Morning Star & Evening Star (3-candle patterns)
    const p2Body = Math.abs(p2.close - p2.open);
    const p2Range = Math.max(p2.high - p2.low, 1e-9);
    const p2Mid = (p2.open + p2.close) / 2;
    if (
      p2.close < p2.open &&
      p2Body > p2Range * 0.45 &&
      p1Body < p1Range * 0.32 &&
      isBull &&
      c.close > p2Mid
    ) {
      matches.push({
        index: i,
        time: c.time,
        name: 'Morning Star',
        type: 'bullish',
        strength: 3,
        description: 'Three-bar bullish reversal with exhaustion star and strong buyer reclaim.',
      });
    } else if (
      p2.close > p2.open &&
      p2Body > p2Range * 0.45 &&
      p1Body < p1Range * 0.32 &&
      isBear &&
      c.close < p2Mid
    ) {
      matches.push({
        index: i,
        time: c.time,
        name: 'Evening Star',
        type: 'bearish',
        strength: 3,
        description: 'Three-bar bearish reversal with exhaustion star and decisive breakdown.',
      });
    }

    // 5. Three White Soldiers / Three Black Crows
    if (
      p2.close > p2.open &&
      p1.close > p1.open &&
      isBull &&
      p1.close > p2.close &&
      c.close > p1.close &&
      body > range * 0.55
    ) {
      matches.push({
        index: i,
        time: c.time,
        name: 'Three White Soldiers',
        type: 'bullish',
        strength: 3,
        description: 'Three consecutive expanding bullish closes showing institutional accumulation.',
      });
    } else if (
      p2.close < p2.open &&
      p1.close < p1.open &&
      isBear &&
      p1.close < p2.close &&
      c.close < p1.close &&
      body > range * 0.55
    ) {
      matches.push({
        index: i,
        time: c.time,
        name: 'Three Black Crows',
        type: 'bearish',
        strength: 3,
        description: 'Three consecutive expanding bearish closes showing institutional distribution.',
      });
    }
  }

  return matches;
}
