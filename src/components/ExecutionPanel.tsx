import React, { useEffect, useState } from 'react';
import { Copy, Check, ShieldAlert, ShieldCheck, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { HOLD_DURATIONS, LOT_PRESETS } from '../data/assets';
import { Asset, HoldDuration, SignalResult } from '../types/trading';

interface ExecutionPanelProps {
  asset: Asset;
  holdDuration: HoldDuration;
  onChangeHoldDuration: (h: HoldDuration) => void;
  lotSize: number;
  onChangeLotSize: (lot: number) => void;
  accountBalance: number;
  onChangeAccountBalance: (bal: number) => void;
  signal: SignalResult | null;
  isScanning: boolean;
  onGetSignal: () => void;
  autoWinRate: number;
}

export const ExecutionPanel: React.FC<ExecutionPanelProps> = ({
  asset,
  holdDuration,
  onChangeHoldDuration,
  lotSize,
  onChangeLotSize,
  accountBalance,
  onChangeAccountBalance,
  signal,
  isScanning,
  onGetSignal,
  autoWinRate,
}) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number>(0);

  useEffect(() => {
    if (!signal) {
      setSecondsLeft(0);
      return;
    }
    const update = () => {
      const elapsed = Math.floor((Date.now() - signal.timestamp) / 1000);
      setSecondsLeft(Math.max(0, signal.holdSeconds - elapsed));
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [signal]);

  const copyValue = (key: string, val: string) => {
    navigator.clipboard?.writeText(val);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1400);
  };

  const formatCountdown = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return (
    <aside className="w-full lg:w-[340px] shrink-0 border-l border-[#1E2633] bg-[#0D1117] flex flex-col min-h-0 overflow-y-auto">
      {/* Trade Setup Controls */}
      <div className="p-4 border-b border-[#1E2633] space-y-3.5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[13px] font-semibold text-[#F1F5F9]">
              Exness Trade Setup
            </h2>
            <p className="text-[11px] text-[#64748B]">
              {asset.exnessSymbol} · 5-bar accuracy {autoWinRate.toFixed(1)}%
            </p>
          </div>
        </div>

        {/* Hold Duration Selector */}
        <div>
          <label className="block text-[11px] font-medium text-[#94A3B8] mb-1.5">
            Trade Hold Duration
          </label>
          <select
            value={holdDuration}
            onChange={(e) => onChangeHoldDuration(e.target.value as HoldDuration)}
            className="w-full bg-[#131922] border border-[#1E2633] focus:border-[#475569] rounded-md px-2.5 py-2 text-[12px] text-[#F1F5F9] outline-none cursor-pointer"
          >
            {HOLD_DURATIONS.map((h) => (
              <option key={h.value} value={h.value}>
                Hold {h.label}
              </option>
            ))}
          </select>
        </div>

        {/* Lot Size Selector + Account Balance for Psychology */}
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className="block text-[11px] font-medium text-[#94A3B8] mb-1.5">
              Lot Size (Exness)
            </label>
            <div className="flex items-center gap-1">
              <input
                type="number"
                step="0.01"
                min="0.01"
                max="100"
                value={lotSize}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (Number.isFinite(val) && val > 0) onChangeLotSize(val);
                }}
                className="w-full bg-[#131922] border border-[#1E2633] focus:border-[#475569] rounded-md px-2.5 py-1.5 text-[12px] font-mono tabular-nums text-[#F1F5F9] outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-[#94A3B8] mb-1.5">
              Capital (USD)
            </label>
            <input
              type="number"
              step="50"
              min="10"
              value={accountBalance}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                if (Number.isFinite(val) && val > 0) onChangeAccountBalance(val);
              }}
              className="w-full bg-[#131922] border border-[#1E2633] focus:border-[#475569] rounded-md px-2.5 py-1.5 text-[12px] font-mono tabular-nums text-[#F1F5F9] outline-none"
            />
          </div>
        </div>

        {/* Quick Lot Presets */}
        <div className="flex flex-wrap gap-1">
          {LOT_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => onChangeLotSize(preset)}
              className={`px-2 py-1 rounded text-[11px] font-mono tabular-nums transition-colors cursor-pointer ${
                Math.abs(lotSize - preset) < 0.001
                  ? 'bg-[#DC2626] text-white font-semibold'
                  : 'bg-[#131922] text-[#94A3B8] hover:text-[#F1F5F9] border border-[#1E2633]'
              }`}
            >
              {preset.toFixed(2)}
            </button>
          ))}
        </div>

        {/* Primary Signal Trigger */}
        <button
          type="button"
          onClick={onGetSignal}
          disabled={isScanning}
          className="w-full py-2.5 px-4 rounded-md bg-[#DC2626] hover:bg-[#B91C1C] disabled:opacity-60 text-white text-[13px] font-semibold transition-colors cursor-pointer"
        >
          {isScanning ? 'Scanning 500+ Strategies...' : 'Get Signal & Mark Chart'}
        </button>
      </div>

      {/* Active Signal Output */}
      {!signal ? (
        <div className="p-5 text-center space-y-2">
          <div className="text-[13px] font-medium text-[#CBD5E1]">
            Ready to Scan {asset.symbol}
          </div>
          <p className="text-[12px] text-[#64748B] leading-relaxed">
            Select your holding duration and lot size, then click <span className="text-[#F1F5F9]">Get Signal</span> to scan 500+ strategies, Doji/Engulfing patterns, and mark TP/SL levels directly on the chart.
          </p>
        </div>
      ) : (
        <div className="p-4 space-y-4">
          {/* Direction Verdict */}
          <div className="flex items-center justify-between pb-3 border-b border-[#1E2633]">
            <div className="flex items-center gap-2">
              {signal.direction === 'BUY' ? (
                <ArrowUpRight className="w-5 h-5 text-[#10B981]" />
              ) : (
                <ArrowDownRight className="w-5 h-5 text-[#EF4444]" />
              )}
              <div>
                <div
                  className={`text-lg font-display font-bold leading-none ${
                    signal.direction === 'BUY' ? 'text-[#10B981]' : 'text-[#EF4444]'
                  }`}
                >
                  {signal.direction} {signal.direction === 'BUY' ? '(UP)' : '(DOWN)'}
                </div>
                <div className="text-[11px] text-[#94A3B8] mt-1">
                  {signal.exnessSymbol} · {signal.timeframe} · {signal.lotSize.toFixed(2)} Lots
                </div>
              </div>
            </div>

            <div className="text-right tabular-nums">
              <div className="text-base font-mono font-bold text-[#F8FAFC]">
                {signal.confidence}%
              </div>
              <div className="text-[11px] text-[#64748B]">
                {signal.bullishCount}B / {signal.bearishCount}S
              </div>
            </div>
          </div>

          {/* Hold Duration & Countdown */}
          <div className="flex items-center justify-between text-[12px] py-2 px-3 rounded bg-[#131922] border border-[#1E2633] tabular-nums">
            <span className="text-[#94A3B8]">
              Hold Target ({signal.holdDuration})
            </span>
            <span className="font-mono font-semibold text-[#F59E0B]">
              {secondsLeft > 0 ? formatCountdown(secondsLeft) : 'Target Reached'}
            </span>
          </div>

          {/* Exness TP / SL / Entry Price Grid */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-medium text-[#94A3B8]">
              Exness Order Levels (Click to Copy)
            </div>
            {[
              {
                key: 'entry',
                label: 'Entry Price',
                price: signal.entryPrice.toFixed(asset.decimals),
                sub: 'Market',
                color: 'text-[#38BDF8]',
              },
              {
                key: 'sl',
                label: 'Stop Loss (SL)',
                price: signal.stopLoss.toFixed(asset.decimals),
                sub: `-$${signal.riskUsd.toFixed(2)} (${signal.slPips} pips)`,
                color: 'text-[#EF4444]',
              },
              {
                key: 'tp1',
                label: 'Take Profit 1 (Hold Target)',
                price: signal.takeProfit1.toFixed(asset.decimals),
                sub: `+$${signal.reward1Usd.toFixed(2)} (${signal.tp1Pips} pips)`,
                color: 'text-[#10B981]',
              },
              {
                key: 'tp2',
                label: 'Take Profit 2',
                price: signal.takeProfit2.toFixed(asset.decimals),
                sub: `+$${signal.reward2Usd.toFixed(2)}`,
                color: 'text-[#34D399]',
              },
              {
                key: 'tp3',
                label: 'Take Profit 3',
                price: signal.takeProfit3.toFixed(asset.decimals),
                sub: `+$${signal.reward3Usd.toFixed(2)}`,
                color: 'text-[#6EE7B7]',
              },
            ].map((row) => (
              <button
                key={row.key}
                type="button"
                onClick={() => copyValue(row.key, row.price)}
                className="w-full flex items-center justify-between px-3 py-2 rounded bg-[#131922] hover:bg-[#17202E] border border-[#1E2633] text-left transition-colors cursor-pointer"
              >
                <div>
                  <div className="text-[11px] text-[#94A3B8]">{row.label}</div>
                  <div className="text-[11px] text-[#64748B] tabular-nums">{row.sub}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[13px] font-mono font-semibold tabular-nums ${row.color}`}>
                    {row.price}
                  </span>
                  {copiedKey === row.key ? (
                    <Check className="w-3.5 h-3.5 text-[#10B981]" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-[#64748B]" />
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* Trading Psychology & Lot Risk Guard */}
          <div className="p-3 rounded bg-[#131922] border border-[#1E2633] space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                {signal.psychologyStatus === 'Disciplined' ? (
                  <ShieldCheck className="w-4 h-4 text-[#10B981]" />
                ) : (
                  <ShieldAlert
                    className={`w-4 h-4 ${
                      signal.psychologyStatus === 'Elevated Risk'
                        ? 'text-[#F59E0B]'
                        : 'text-[#EF4444]'
                    }`}
                  />
                )}
                <span className="text-[12px] font-semibold text-[#F1F5F9]">
                  Psychology: {signal.psychologyStatus}
                </span>
              </div>
              <span className="text-[11px] font-mono tabular-nums text-[#94A3B8]">
                {signal.riskPercentOfAccount}% Risk
              </span>
            </div>
            <p className="text-[11px] text-[#94A3B8] leading-relaxed">
              {signal.psychologyAdvice}
            </p>
          </div>

          {/* Gold-Silver Cross-Market Correlation (shown when trading Gold) */}
          {signal.silverAnalysis && (
            <div className="p-3 rounded bg-[#131922] border border-[#1E2633] space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-semibold text-[#F59E0B]">
                  Silver (XAGUSD) Cross-Analysis
                </span>
                <span
                  className={`text-[11px] font-mono font-semibold ${
                    signal.silverAnalysis.silverBias === 'BUY'
                      ? 'text-[#10B981]'
                      : signal.silverAnalysis.silverBias === 'SELL'
                      ? 'text-[#EF4444]'
                      : 'text-[#94A3B8]'
                  }`}
                >
                  {signal.silverAnalysis.silverBias}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-[11px] tabular-nums pt-0.5">
                <div>
                  <div className="text-[#64748B]">XAG Price</div>
                  <div className="text-[#F1F5F9] font-mono">
                    {signal.silverAnalysis.silverPrice.toFixed(3)}
                  </div>
                </div>
                <div>
                  <div className="text-[#64748B]">Correlation</div>
                  <div className="text-[#F1F5F9] font-mono">
                    r={signal.silverAnalysis.correlationCoeff.toFixed(2)}
                  </div>
                </div>
                <div>
                  <div className="text-[#64748B]">Gold/Silver</div>
                  <div className="text-[#F1F5F9] font-mono">
                    {signal.silverAnalysis.goldSilverRatio.toFixed(1)}x
                  </div>
                </div>
              </div>
              <p className="text-[11px] text-[#94A3B8] leading-relaxed">
                {signal.silverAnalysis.summary}
              </p>
            </div>
          )}

          {/* Detailed Rationale */}
          <div className="space-y-1.5 pt-1">
            <div className="text-[11px] font-medium text-[#94A3B8]">
              Signal Breakdown ({signal.totalStrategiesEvaluated} Strategies)
            </div>
            <ul className="space-y-1.5">
              {signal.topReasons.map((reason, idx) => (
                <li key={idx} className="text-[11px] text-[#CBD5E1] leading-relaxed">
                  • {reason}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </aside>
  );
};
