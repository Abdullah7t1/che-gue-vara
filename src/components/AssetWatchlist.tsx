import React, { useEffect, useState } from 'react';
import { Search, ArrowUpDown } from 'lucide-react';
import { Asset, AssetCategory, WatchlistQuote } from '../types/trading';

interface AssetWatchlistProps {
  assets: Asset[];
  selectedAsset: Asset;
  onSelectAsset: (asset: Asset) => void;
  quotes: Record<string, WatchlistQuote>;
  onAddCustomAsset: (asset: Asset) => void;
}

const CATEGORIES: { id: AssetCategory; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'metals', label: 'Metals' },
  { id: 'forex', label: 'Forex' },
  { id: 'crypto', label: 'Crypto' },
  { id: 'indices', label: 'Indices' },
  { id: 'stocks', label: 'Stocks' },
];

export const AssetWatchlist: React.FC<AssetWatchlistProps> = ({
  assets,
  selectedAsset,
  onSelectAsset,
  quotes,
  onAddCustomAsset,
}) => {
  const [category, setCategory] = useState<AssetCategory>('all');
  const [query, setQuery] = useState('');
  const [sortByWinRate, setSortByWinRate] = useState(true);
  const [remoteResults, setRemoteResults] = useState<Asset[]>([]);
  const [searchingRemote, setSearchingRemote] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setRemoteResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchingRemote(true);
      try {
        const resp = await fetch(`/api/tv-search?q=${encodeURIComponent(trimmed)}`);
        if (resp.ok) {
          const data = (await resp.json()) as { symbols?: Asset[] };
          const existingTv = new Set(assets.map((a) => a.tvSymbol.toUpperCase()));
          setRemoteResults(
            (data.symbols ?? []).filter((s) => !existingTv.has(s.tvSymbol.toUpperCase()))
          );
        }
      } catch {
        setRemoteResults([]);
      } finally {
        setSearchingRemote(false);
      }
    }, 320);
    return () => clearTimeout(timer);
  }, [query, assets]);

  const filtered = assets
    .filter((a) => category === 'all' || a.category === category)
    .filter((a) => {
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      return (
        a.symbol.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q) ||
        a.tvSymbol.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      if (!sortByWinRate) return 0;
      const wa = quotes[a.tvSymbol]?.winRateRatio ?? 0;
      const wb = quotes[b.tvSymbol]?.winRateRatio ?? 0;
      return wb - wa;
    });

  return (
    <aside className="w-full lg:w-[272px] shrink-0 border-r border-[#1E2633] bg-[#0D1117] flex flex-col min-h-0">
      <div className="p-3 border-b border-[#1E2633] space-y-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-semibold text-[#F1F5F9]">
            TradingView Assets
          </h2>
          <button
            type="button"
            onClick={() => setSortByWinRate((v) => !v)}
            title="Sort by Win Rate Ratio"
            className="flex items-center gap-1 text-[11px] text-[#94A3B8] hover:text-[#F1F5F9] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ArrowUpDown className="w-3 h-3" />
            <span>{sortByWinRate ? 'Win Rate ↓' : 'Default'}</span>
          </button>
        </div>

        {/* Search any TradingView Symbol */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-[#64748B] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search any TV symbol (XAU, BTC...)"
            className="w-full bg-[#131922] border border-[#1E2633] focus:border-[#475569] rounded-md pl-8 pr-3 py-1.5 text-[12px] text-[#F1F5F9] placeholder-[#64748B] outline-none"
          />
        </div>

        {/* Category Filter Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategory(cat.id)}
              className={`px-2 py-1 rounded text-[11px] font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                category === cat.id
                  ? 'bg-[#1E293B] text-[#F8FAFC]'
                  : 'text-[#94A3B8] hover:text-[#E2E8F0]'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Asset List Header */}
      <div className="px-3 py-1.5 border-b border-[#1E2633] flex items-center justify-between text-[11px] text-[#64748B]">
        <span>Symbol</span>
        <div className="flex items-center gap-4">
          <span>Price / 24h</span>
          <span className="w-12 text-right">Win Ratio</span>
        </div>
      </div>

      {/* Scrollable Asset Rows */}
      <div className="flex-1 overflow-y-auto divide-y divide-[#151C26]">
        {filtered.map((asset) => {
          const q = quotes[asset.tvSymbol];
          const isSelected = selectedAsset.tvSymbol === asset.tvSymbol;
          const winRate = q?.winRateRatio;
          const isPos = (q?.changePct ?? 0) >= 0;

          const winColor =
            winRate == null
              ? 'text-[#64748B]'
              : winRate >= 76
              ? 'text-[#10B981]'
              : winRate >= 64
              ? 'text-[#F59E0B]'
              : 'text-[#94A3B8]';

          return (
            <button
              key={asset.tvSymbol}
              type="button"
              onClick={() => onSelectAsset(asset)}
              className={`w-full px-3 py-2.5 flex items-center justify-between gap-2 text-left transition-colors cursor-pointer ${
                isSelected
                  ? 'bg-[#17202E]'
                  : 'hover:bg-[#121822]'
              }`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[12px] font-semibold text-[#F1F5F9] truncate">
                    {asset.symbol}
                  </span>
                  {q && (
                    <span
                      className={`text-[10px] font-medium ${
                        q.bias === 'BUY'
                          ? 'text-[#10B981]'
                          : q.bias === 'SELL'
                          ? 'text-[#EF4444]'
                          : 'text-[#64748B]'
                      }`}
                    >
                      {q.bias === 'NEUTRAL' ? '·' : q.bias}
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-[#64748B] truncate max-w-[105px]">
                  {asset.name}
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <div className="text-right tabular-nums">
                  <div className="text-[12px] font-medium text-[#E2E8F0]">
                    {q ? q.price.toFixed(asset.decimals) : '—'}
                  </div>
                  <div
                    className={`text-[10px] ${
                      q == null
                        ? 'text-[#64748B]'
                        : isPos
                        ? 'text-[#10B981]'
                        : 'text-[#EF4444]'
                    }`}
                  >
                    {q ? `${isPos ? '+' : ''}${q.changePct.toFixed(2)}%` : 'Live'}
                  </div>
                </div>

                <div className="w-12 text-right tabular-nums">
                  <div className={`text-[12px] font-semibold ${winColor}`}>
                    {winRate != null ? `${winRate.toFixed(1)}%` : '—'}
                  </div>
                  <div className="text-[10px] text-[#64748B]">
                    {q?.marketCondition ?? 'Scan'}
                  </div>
                </div>
              </div>
            </button>
          );
        })}

        {/* Remote TradingView Search Matches */}
        {query.trim().length >= 2 && (
          <div className="p-2.5 bg-[#0A0D12]">
            <div className="text-[11px] text-[#94A3B8] mb-1.5">
              {searchingRemote
                ? 'Searching TradingView global symbols...'
                : remoteResults.length > 0
                ? 'TradingView Global Results (Click to Load)'
                : 'No additional TradingView symbols found'}
            </div>
            {remoteResults.map((item) => (
              <button
                key={item.tvSymbol}
                type="button"
                onClick={() => {
                  onAddCustomAsset(item);
                  onSelectAsset(item);
                  setQuery('');
                }}
                className="w-full px-2.5 py-2 rounded hover:bg-[#17202E] flex items-center justify-between text-left transition-colors cursor-pointer"
              >
                <div className="min-w-0">
                  <div className="text-[12px] font-semibold text-[#F1F5F9]">
                    {item.tvSymbol}
                  </div>
                  <div className="text-[11px] text-[#64748B] truncate max-w-[180px]">
                    {item.name}
                  </div>
                </div>
                <span className="text-[11px] text-[#DC2626] font-medium shrink-0">
                  + Add
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
};
