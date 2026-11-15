export type AssetCategory = 'all' | 'metals' | 'forex' | 'crypto' | 'indices' | 'stocks' | 'commodities';

export type Timeframe =
  | '1s'
  | '5s'
  | '15s'
  | '30s'
  | '1m'
  | '2m'
  | '3m'
  | '4m'
  | '5m'
  | '10m'
  | '15m'
  | '30m'
  | '1h'
  | '2h'
  | '3h'
  | '4h'
  | '5h'
  | '1D'
  | '1W'
  | '1M'
  | '1Y';

export type HoldDuration =
  | '30s'
  | '40s'
  | '1m'
  | '2m'
  | '3m'
  | '5m'
  | '10m'
  | '15m'
  | '30m'
  | '1h'
  | '2h'
  | '4h'
  | '1D';

export interface Asset {
  id: string;
  symbol: string;
  tvSymbol: string;
  exnessSymbol: string;
  name: string;
  category: Exclude<AssetCategory, 'all'>;
  binanceSymbol?: string;
  yahooSymbol: string;
  tvScannerMarket: 'cfd' | 'forex' | 'crypto' | 'america';
  pipSize: number;
  contractSize: number; // units per 1.00 standard lot (e.g., 100 oz for XAUUSD, 100000 for FX, 1 for BTC)
  decimals: number;
}

export interface Candle {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface WatchlistQuote {
  tvSymbol: string;
  price: number;
  changePct: number;
  tvRecommend: number; // -1 to +1
  rsi: number | null;
  macd: number | null;
  macdSignal: number | null;
  winRateRatio: number; // 0 to 100 computed market quality / strategy win rate
  marketCondition: 'Optimal' | 'Strong' | 'Moderate' | 'Choppy';
  bias: 'BUY' | 'SELL' | 'NEUTRAL';
}

export interface PatternMatch {
  index: number;
  time: number;
  name: string;
  type: 'bullish' | 'bearish' | 'neutral';
  strength: number; // 1 to 3
  description: string;
}

export interface StrategyVote {
  id: string;
  name: string;
  category:
    | 'Trend & MA'
    | 'Momentum & Oscillators'
    | 'Volatility & Breakouts'
    | 'Candlestick & Price Action'
    | 'Volume & Flow'
    | 'Cross-Market & Pine';
  vote: 'BUY' | 'SELL' | 'NEUTRAL';
  weight: number;
  detail: string;
}

export interface SilverCorrelationReport {
  silverSymbol: string;
  silverPrice: number;
  silverChangePct: number;
  silverBias: 'BUY' | 'SELL' | 'NEUTRAL';
  silverScore: number; // -100 to +100
  silverBullishStrategies: number;
  silverBearishStrategies: number;
  correlationCoeff: number; // -1 to +1
  goldSilverRatio: number;
  summary: string;
}

export interface AutoCandleSignal {
  index: number;
  time: number;
  price: number;
  direction: 'BUY' | 'SELL';
  confidence: number;
  holdLabel: string;
  pattern?: string;
  winOutcome?: 'WIN' | 'LOSS' | 'PENDING';
}

export interface SignalResult {
  id: string;
  timestamp: number;
  tvSymbol: string;
  exnessSymbol: string;
  timeframe: Timeframe;
  holdDuration: HoldDuration;
  holdSeconds: number;
  holdUntilTime: number; // unix seconds
  holdCandlesAhead: number;
  direction: 'BUY' | 'SELL';
  confidence: number; // 0 to 99
  entryPrice: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  takeProfit3: number;
  riskRewardRatio: number;
  lotSize: number;
  accountBalance: number;
  slPips: number;
  tp1Pips: number;
  riskUsd: number;
  reward1Usd: number;
  reward2Usd: number;
  reward3Usd: number;
  riskPercentOfAccount: number;
  psychologyStatus: 'Disciplined' | 'Elevated Risk' | 'Overleveraged';
  psychologyAdvice: string;
  totalStrategiesEvaluated: number;
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  detectedPatterns: PatternMatch[];
  silverAnalysis: SilverCorrelationReport | null;
  categoryBreakdown: {
    category: StrategyVote['category'];
    total: number;
    bullish: number;
    bearish: number;
    neutral: number;
  }[];
  topReasons: string[];
  strategyVotes: StrategyVote[];
  pineMatches: { name: string; signal: 'BUY' | 'SELL' | 'NEUTRAL' }[];
}

export interface PineScriptItem {
  id: string;
  name: string;
  code: string;
  enabled: boolean;
  isOverlay: boolean;
  createdAt: number;
}

export interface CompiledPinePlot {
  title: string;
  color: string;
  lineWidth: number;
  style: 'line' | 'histogram';
  data: { time: number; value: number }[];
}

export interface CompiledPineHLine {
  title: string;
  price: number;
  color: string;
}

export interface CompiledPineMarker {
  time: number;
  position: 'aboveBar' | 'belowBar';
  color: string;
  shape: 'arrowUp' | 'arrowDown' | 'circle';
  text: string;
  signal: 'BUY' | 'SELL';
}

export interface CompiledPineResult {
  scriptId: string;
  name: string;
  isOverlay: boolean;
  plots: CompiledPinePlot[];
  hlines: CompiledPineHLine[];
  markers: CompiledPineMarker[];
  latestSignal: 'BUY' | 'SELL' | 'NEUTRAL';
  errors: string[];
}
