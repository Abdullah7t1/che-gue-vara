import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Code2, RefreshCw } from 'lucide-react';
import { ALL_TIMEFRAMES, ASSETS_CATALOG, isGoldAsset } from './data/assets';
import { detectCandlestickPatterns } from './engine/patterns';
import { compilePineScript } from './engine/pineScriptParser';
import { generateEvery5CandleSignals, generateMasterSignal } from './engine/strategyEngine';
import {
  Asset,
  Candle,
  HoldDuration,
  PineScriptItem,
  SignalResult,
  Timeframe,
  WatchlistQuote,
} from './types/trading';
import { AssetWatchlist } from './components/AssetWatchlist';
import { BotChart } from './components/BotChart';
import { ExecutionPanel } from './components/ExecutionPanel';
import { PineStudioPanel } from './components/PineStudioPanel';
import { StrategyMatrixPanel } from './components/StrategyMatrixPanel';
import { TopBar, WorkspaceTab } from './components/TopBar';
import { TradingViewWidget } from './components/TradingViewWidget';

export default function App() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('bot');
  const [assets, setAssets] = useState<Asset[]>(ASSETS_CATALOG);
  const [selectedAsset, setSelectedAsset] = useState<Asset>(ASSETS_CATALOG[0]); // Gold XAUUSD default
  const [timeframe, setTimeframe] = useState<Timeframe>('5m');
  const [holdDuration, setHoldDuration] = useState<HoldDuration>('5m');
  const [lotSize, setLotSize] = useState<number>(0.1);
  const [accountBalance, setAccountBalance] = useState<number>(1000);

  const [candles, setCandles] = useState<Candle[]>([]);
  const [feedSource, setFeedSource] = useState<string>('TradingView + Live Feed');
  const [loadingCandles, setLoadingCandles] = useState<boolean>(true);
  const [candleError, setCandleError] = useState<string | null>(null);

  const [quotes, setQuotes] = useState<Record<string, WatchlistQuote>>({});
  const [scripts, setScripts] = useState<PineScriptItem[]>([]);
  const [showAutoSignals, setShowAutoSignals] = useState<boolean>(true);
  const [showPatternMarkers, setShowPatternMarkers] = useState<boolean>(true);

  const [activeSignal, setActiveSignal] = useState<SignalResult | null>(null);
  const [isScanning, setIsScanning] = useState<boolean>(false);

  // Load saved Pine Script strategies from backend
  useEffect(() => {
    fetch('/api/strategies')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.strategies)) {
          setScripts(data.strategies);
        }
      })
      .catch(() => {
        // ignore
      });
  }, []);

  // Poll live TradingView Scanner API for all assets (prices + win-rate ratios)
  const fetchScannerQuotes = useCallback(async () => {
    const groups: Record<'cfd' | 'forex' | 'crypto' | 'america', string[]> = {
      cfd: [],
      forex: [],
      crypto: [],
      america: [],
    };
    for (const a of assets) {
      groups[a.tvScannerMarket].push(a.tvSymbol);
    }
    try {
      const resp = await fetch('/api/tv-scanner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groups }),
      });
      if (resp.ok) {
        const data = (await resp.json()) as { quotes?: Record<string, WatchlistQuote> };
        if (data.quotes) {
          setQuotes((prev) => ({ ...prev, ...data.quotes }));
        }
      }
    } catch {
      // ignore transient poll failures
    }
  }, [assets]);

  useEffect(() => {
    fetchScannerQuotes();
    const timer = setInterval(fetchScannerQuotes, 8000);
    return () => clearInterval(timer);
  }, [fetchScannerQuotes]);

  // Fetch live OHLCV candles for selected asset & timeframe
  const fetchCandles = useCallback(
    async (silent = false) => {
      if (!silent) {
        setLoadingCandles(true);
        setCandleError(null);
      }
      try {
        const params = new URLSearchParams({
          tvSymbol: selectedAsset.tvSymbol,
          timeframe,
          yahooSymbol: selectedAsset.yahooSymbol,
          limit: '260',
        });
        if (selectedAsset.binanceSymbol) {
          params.set('binanceSymbol', selectedAsset.binanceSymbol);
        }
        const resp = await fetch(`/api/candles?${params.toString()}`);
        const data = (await resp.json()) as {
          candles?: Candle[];
          source?: string;
          error?: string;
        };
        if (!resp.ok || !data.candles || data.candles.length === 0) {
          throw new Error(data.error || 'No market data returned');
        }
        setCandles(data.candles);
        if (data.source) setFeedSource(data.source);
        setCandleError(null);
      } catch (err) {
        if (!silent) {
          setCandleError(err instanceof Error ? err.message : 'Feed error');
        }
      } finally {
        if (!silent) setLoadingCandles(false);
      }
    },
    [selectedAsset, timeframe]
  );

  useEffect(() => {
    setCandles([]);
    fetchCandles(false);
    const pollMs = timeframe.endsWith('s') ? 2000 : 5000;
    const timer = setInterval(() => fetchCandles(true), pollMs);
    return () => clearInterval(timer);
  }, [fetchCandles, timeframe]);

  // Compile all enabled Pine Scripts against live candles
  const compiledPineResults = useMemo(() => {
    if (candles.length === 0) return [];
    return scripts
      .filter((s) => s.enabled)
      .map((s) => compilePineScript(s, candles));
  }, [scripts, candles]);

  // Candlestick pattern recognition (Doji, Engulfing, Pin Bar, Stars)
  const detectedPatterns = useMemo(() => {
    return detectCandlestickPatterns(candles);
  }, [candles]);

  // Every-5-candle Auto Signals & real historical 5-bar win rate
  const { signals: autoSignals, winRate: autoWinRate } = useMemo(() => {
    return generateEvery5CandleSignals(candles, holdDuration);
  }, [candles, holdDuration]);

  // Master Get Signal handler (fetches Silver XAGUSD live if trading Gold!)
  const handleGetSignal = useCallback(async () => {
    if (candles.length < 10) return;
    setIsScanning(true);
    try {
      let silverCandles: Candle[] | undefined;
      if (isGoldAsset(selectedAsset)) {
        try {
          const sp = new URLSearchParams({
            tvSymbol: 'OANDA:XAGUSD',
            timeframe,
            yahooSymbol: 'SI=F',
            limit: '220',
          });
          const sResp = await fetch(`/api/candles?${sp.toString()}`);
          if (sResp.ok) {
            const sData = (await sResp.json()) as { candles?: Candle[] };
            silverCandles = sData.candles;
          }
        } catch {
          // proceed with Gold alone if Silver endpoint briefly times out
        }
      }

      const result = generateMasterSignal({
        asset: selectedAsset,
        candles,
        silverCandles,
        timeframe,
        holdDuration,
        lotSize,
        accountBalance,
        pineResults: compiledPineResults,
      });

      setActiveSignal(result);
      if (activeTab === 'pine' || activeTab === 'matrix') {
        setActiveTab('bot');
      }
    } finally {
      setIsScanning(false);
    }
  }, [
    candles,
    selectedAsset,
    timeframe,
    holdDuration,
    lotSize,
    accountBalance,
    compiledPineResults,
    activeTab,
  ]);

  // Pine Script CRUD handlers
  const handleSaveScript = async (payload: {
    id?: string;
    name: string;
    code: string;
    enabled: boolean;
  }) => {
    const resp = await fetch('/api/strategies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (resp.ok) {
      const data = (await resp.json()) as { strategies: PineScriptItem[] };
      setScripts(data.strategies);
    }
  };

  const handleToggleScript = async (id: string) => {
    const target = scripts.find((s) => s.id === id);
    if (!target) return;
    await handleSaveScript({
      id: target.id,
      name: target.name,
      code: target.code,
      enabled: !target.enabled,
    });
  };

  const handleDeleteScript = async (id: string) => {
    const resp = await fetch(`/api/strategies/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (resp.ok) {
      const data = (await resp.json()) as { strategies: PineScriptItem[] };
      setScripts(data.strategies);
    }
  };

  const handleAddCustomAsset = (asset: Asset) => {
    setAssets((prev) => {
      if (prev.some((a) => a.tvSymbol === asset.tvSymbol)) return prev;
      return [asset, ...prev];
    });
  };

  const recentPatterns = detectedPatterns.slice(-4).reverse();

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-[#0A0D12] text-[#F1F5F9]">
      {/* Top 3-Zone Header */}
      <TopBar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onGetSignal={handleGetSignal}
        isScanning={isScanning}
      />

      {/* Mobile Navigation Strip */}
      <div className="md:hidden flex items-center gap-1 px-3 py-1.5 border-b border-[#1E2633] bg-[#0D1117] overflow-x-auto">
        {(['bot', 'tradingview', 'split', 'pine', 'matrix'] as WorkspaceTab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`px-2.5 py-1 rounded text-[11px] font-medium whitespace-nowrap shrink-0 ${
              activeTab === tab ? 'bg-[#DC2626] text-white' : 'text-[#94A3B8]'
            }`}
          >
            {tab === 'bot'
              ? 'Bot Terminal'
              : tab === 'tradingview'
              ? 'TradingView Live'
              : tab === 'split'
              ? 'Split Charts'
              : tab === 'pine'
              ? 'Pine Studio'
              : '500+ Matrix'}
          </button>
        ))}
      </div>

      {/* Main Terminal Body */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
        {/* Left TradingView Watchlist with Win Rate Ratio */}
        <AssetWatchlist
          assets={assets}
          selectedAsset={selectedAsset}
          onSelectAsset={(a) => {
            setSelectedAsset(a);
            setActiveSignal(null);
          }}
          quotes={quotes}
          onAddCustomAsset={handleAddCustomAsset}
        />

        {/* Center Workspace */}
        <main className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
          {activeTab === 'pine' ? (
            <PineStudioPanel
              scripts={scripts}
              compiledResults={compiledPineResults}
              onSaveScript={handleSaveScript}
              onToggleScript={handleToggleScript}
              onDeleteScript={handleDeleteScript}
              onBackToChart={() => setActiveTab('bot')}
            />
          ) : activeTab === 'matrix' ? (
            <StrategyMatrixPanel signal={activeSignal} onRunScan={handleGetSignal} />
          ) : (
            <>
              {/* Chart Control Strip: Timeframes (1s -> 1Y), Auto-Signal Toggle, Pine Indicator Controls */}
              <div className="shrink-0 border-b border-[#1E2633] bg-[#0D1117] px-3 py-2 flex flex-wrap items-center justify-between gap-2">
                {/* Full Timeframe Selector (1s through 1Y) */}
                <div className="flex items-center gap-0.5 overflow-x-auto max-w-full pb-0.5">
                  {ALL_TIMEFRAMES.map((tf) => (
                    <button
                      key={tf.value}
                      type="button"
                      onClick={() => setTimeframe(tf.value)}
                      className={`px-2 py-1 rounded text-[11px] font-mono font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                        timeframe === tf.value
                          ? 'bg-[#1E293B] text-[#F8FAFC]'
                          : 'text-[#94A3B8] hover:text-[#E2E8F0]'
                      }`}
                    >
                      {tf.label}
                    </button>
                  ))}
                </div>

                {/* Chart Overlays & Auto-Signal Controls */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowAutoSignals((v) => !v)}
                    className={`px-2.5 py-1 rounded text-[11px] font-medium border whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                      showAutoSignals
                        ? 'bg-[#10B981]/15 border-[#10B981]/40 text-[#10B981]'
                        : 'bg-[#131922] border-[#1E2633] text-[#94A3B8]'
                    }`}
                  >
                    Auto 5-Candle: {showAutoSignals ? 'ON' : 'OFF'}
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowPatternMarkers((v) => !v)}
                    className={`px-2.5 py-1 rounded text-[11px] font-medium border whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                      showPatternMarkers
                        ? 'bg-[#F59E0B]/15 border-[#F59E0B]/40 text-[#F59E0B]'
                        : 'bg-[#131922] border-[#1E2633] text-[#94A3B8]'
                    }`}
                  >
                    Doji & Engulfing: {showPatternMarkers ? 'ON' : 'OFF'}
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('pine')}
                    className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium border border-[#1E2633] bg-[#131922] hover:bg-[#1E293B] text-[#E2E8F0] whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Code2 className="w-3.5 h-3.5 text-[#DC2626]" />
                    <span>+ Pine Script ({scripts.filter((s) => s.enabled).length})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => fetchCandles(false)}
                    title="Refresh live feed"
                    className="p-1.5 rounded border border-[#1E2633] bg-[#131922] hover:bg-[#1E293B] text-[#94A3B8] hover:text-[#F8FAFC] cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Active Chart Surface */}
              <div className="flex-1 flex min-h-0 overflow-hidden">
                {(activeTab === 'bot' || activeTab === 'split') && (
                  <div className={`flex flex-col min-w-0 min-h-0 ${activeTab === 'split' ? 'w-1/2 border-r border-[#1E2633]' : 'flex-1'}`}>
                    <BotChart
                      asset={selectedAsset}
                      timeframe={timeframe}
                      candles={candles}
                      loading={loadingCandles}
                      error={candleError}
                      activeSignal={activeSignal}
                      autoSignals={autoSignals}
                      showAutoSignals={showAutoSignals}
                      showPatternMarkers={showPatternMarkers}
                      patterns={detectedPatterns}
                      pineResults={compiledPineResults}
                    />
                  </div>
                )}

                {(activeTab === 'tradingview' || activeTab === 'split') && (
                  <div className={`flex flex-col min-w-0 min-h-0 ${activeTab === 'split' ? 'w-1/2' : 'flex-1'}`}>
                    <TradingViewWidget
                      tvSymbol={selectedAsset.tvSymbol}
                      timeframe={timeframe}
                    />
                  </div>
                )}
              </div>

              {/* Compact Bottom Strip: Active Pine Overlays & Recent Candlestick Detections */}
              <div className="shrink-0 border-t border-[#1E2633] bg-[#0D1117] px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-[11px]">
                <div className="flex flex-wrap items-center gap-3 text-[#94A3B8]">
                  <span>Feed: <span className="text-[#E2E8F0]">{feedSource}</span></span>
                  <span className="text-[#475569]">·</span>
                  <span>
                    Active Pine:{' '}
                    {scripts.filter((s) => s.enabled).length > 0 ? (
                      scripts
                        .filter((s) => s.enabled)
                        .map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => handleToggleScript(s.id)}
                            className="mr-2 text-[#38BDF8] hover:underline cursor-pointer"
                          >
                            {s.name}
                          </button>
                        ))
                    ) : (
                      <span className="text-[#64748B]">None</span>
                    )}
                  </span>
                </div>

                <div className="flex items-center gap-3 tabular-nums">
                  <span className="text-[#64748B]">Recent Patterns:</span>
                  {recentPatterns.length > 0 ? (
                    recentPatterns.map((p, i) => (
                      <span
                        key={`${p.time}_${i}`}
                        className={
                          p.type === 'bullish'
                            ? 'text-[#10B981]'
                            : p.type === 'bearish'
                            ? 'text-[#EF4444]'
                            : 'text-[#F59E0B]'
                        }
                      >
                        {p.name}
                      </span>
                    ))
                  ) : (
                    <span className="text-[#64748B]">Scanning candles</span>
                  )}
                </div>
              </div>
            </>
          )}
        </main>

        {/* Right Exness Execution & Signal Panel */}
        <ExecutionPanel
          asset={selectedAsset}
          holdDuration={holdDuration}
          onChangeHoldDuration={setHoldDuration}
          lotSize={lotSize}
          onChangeLotSize={setLotSize}
          accountBalance={accountBalance}
          onChangeAccountBalance={setAccountBalance}
          signal={activeSignal}
          isScanning={isScanning}
          onGetSignal={handleGetSignal}
          autoWinRate={autoWinRate}
        />
      </div>
    </div>
  );
}
