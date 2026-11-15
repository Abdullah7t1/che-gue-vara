import React, { useState } from 'react';
import { SignalResult, StrategyVote } from '../types/trading';

interface StrategyMatrixPanelProps {
  signal: SignalResult | null;
  onRunScan: () => void;
}

export const StrategyMatrixPanel: React.FC<StrategyMatrixPanelProps> = ({
  signal,
  onRunScan,
}) => {
  const [catFilter, setCatFilter] = useState<'ALL' | StrategyVote['category']>('ALL');
  const [voteFilter, setVoteFilter] = useState<'ALL' | 'BUY' | 'SELL' | 'NEUTRAL'>('ALL');
  const [search, setSearch] = useState('');

  if (!signal) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-[#0A0D12] text-center space-y-3">
        <h2 className="font-display text-lg font-semibold text-[#F1F5F9]">
          500+ Strategy Quantitative Matrix
        </h2>
        <p className="text-[13px] text-[#94A3B8] max-w-md">
          Run a live market scan to inspect individual votes across 520+ trend, momentum, volatility, Doji/Engulfing candlestick, volume, and Gold-Silver cross-market strategies.
        </p>
        <button
          type="button"
          onClick={onRunScan}
          className="px-4 py-2 rounded-md bg-[#DC2626] hover:bg-[#B91C1C] text-white text-[13px] font-semibold cursor-pointer"
        >
          Run 500+ Strategy Scan
        </button>
      </div>
    );
  }

  const filteredVotes = signal.strategyVotes
    .filter((v) => catFilter === 'ALL' || v.category === catFilter)
    .filter((v) => voteFilter === 'ALL' || v.vote === voteFilter)
    .filter((v) => !search.trim() || v.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#0A0D12] p-5 space-y-4 overflow-y-auto">
      {/* Category Summary Grid */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#1E2633] pb-4">
        <div>
          <h1 className="font-display text-lg font-semibold text-[#F8FAFC]">
            {signal.tvSymbol} — {signal.totalStrategiesEvaluated} Strategies Evaluated
          </h1>
          <p className="text-[12px] text-[#94A3B8]">
            Consensus: <span className={signal.direction === 'BUY' ? 'text-[#10B981] font-semibold' : 'text-[#EF4444] font-semibold'}>{signal.direction} ({signal.confidence}%)</span> · {signal.bullishCount} Bullish · {signal.bearishCount} Bearish · {signal.neutralCount} Neutral
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter strategies (Doji, RSI, EMA...)"
            className="bg-[#131922] border border-[#1E2633] rounded-md px-3 py-1.5 text-[12px] text-[#F1F5F9] placeholder-[#64748B] outline-none w-56"
          />
          <select
            value={voteFilter}
            onChange={(e) => setVoteFilter(e.target.value as 'ALL' | 'BUY' | 'SELL' | 'NEUTRAL')}
            className="bg-[#131922] border border-[#1E2633] rounded-md px-2.5 py-1.5 text-[12px] text-[#F1F5F9] outline-none"
          >
            <option value="ALL">All Votes</option>
            <option value="BUY">BUY Only</option>
            <option value="SELL">SELL Only</option>
            <option value="NEUTRAL">NEUTRAL Only</option>
          </select>
        </div>
      </div>

      {/* Category Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
        <button
          type="button"
          onClick={() => setCatFilter('ALL')}
          className={`p-3 rounded-md border text-left transition-colors cursor-pointer ${
            catFilter === 'ALL'
              ? 'bg-[#17202E] border-[#475569]'
              : 'bg-[#0D1117] border-[#1E2633] hover:border-[#334155]'
          }`}
        >
          <div className="text-[11px] text-[#94A3B8]">All Categories</div>
          <div className="text-base font-mono font-bold text-[#F8FAFC] tabular-nums mt-0.5">
            {signal.totalStrategiesEvaluated}
          </div>
          <div className="text-[11px] text-[#64748B] tabular-nums">
            {signal.bullishCount}B / {signal.bearishCount}S
          </div>
        </button>

        {signal.categoryBreakdown.map((cat) => (
          <button
            key={cat.category}
            type="button"
            onClick={() => setCatFilter(cat.category)}
            className={`p-3 rounded-md border text-left transition-colors cursor-pointer ${
              catFilter === cat.category
                ? 'bg-[#17202E] border-[#475569]'
                : 'bg-[#0D1117] border-[#1E2633] hover:border-[#334155]'
            }`}
          >
            <div className="text-[11px] text-[#94A3B8] truncate">{cat.category}</div>
            <div className="text-base font-mono font-bold text-[#F8FAFC] tabular-nums mt-0.5">
              {cat.total}
            </div>
            <div className="text-[11px] tabular-nums">
              <span className="text-[#10B981]">{cat.bullish}B</span>
              <span className="text-[#64748B]"> / </span>
              <span className="text-[#EF4444]">{cat.bearish}S</span>
            </div>
          </button>
        ))}
      </div>

      {/* Strategy Table */}
      <div className="border border-[#1E2633] rounded-md overflow-hidden bg-[#0D1117]">
        <div className="max-h-[460px] overflow-y-auto">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-[#131922] border-b border-[#1E2633] text-[11px] text-[#94A3B8]">
              <tr>
                <th className="py-2.5 px-3 font-medium">Strategy Name</th>
                <th className="py-2.5 px-3 font-medium">Category</th>
                <th className="py-2.5 px-3 font-medium">Signal</th>
                <th className="py-2.5 px-3 font-medium text-right">Weight</th>
                <th className="py-2.5 px-3 font-medium text-right">Telemetry</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#151C26] text-[12px]">
              {filteredVotes.slice(0, 200).map((v) => (
                <tr key={v.id} className="hover:bg-[#121822]">
                  <td className="py-2 px-3 font-medium text-[#E2E8F0]">{v.name}</td>
                  <td className="py-2 px-3 text-[#94A3B8]">{v.category}</td>
                  <td className="py-2 px-3 font-mono font-semibold">
                    <span
                      className={
                        v.vote === 'BUY'
                          ? 'text-[#10B981]'
                          : v.vote === 'SELL'
                          ? 'text-[#EF4444]'
                          : 'text-[#64748B]'
                      }
                    >
                      {v.vote}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-right font-mono tabular-nums text-[#94A3B8]">
                    {v.weight.toFixed(2)}x
                  </td>
                  <td className="py-2 px-3 text-right font-mono tabular-nums text-[#64748B]">
                    {v.detail}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredVotes.length > 200 && (
          <div className="px-3 py-2 border-t border-[#1E2633] text-[11px] text-[#64748B]">
            Showing first 200 of {filteredVotes.length} matching strategies. Use filter above to narrow down.
          </div>
        )}
      </div>
    </div>
  );
};
