import React, { useEffect, useRef, useState } from 'react';
import {
  BaselineSeries,
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  CrosshairMode,
  HistogramSeries,
  IChartApi,
  IPriceLine,
  ISeriesApi,
  ISeriesMarkersPluginApi,
  LineSeries,
  LineStyle,
  SeriesMarker,
  Time,
  UTCTimestamp,
} from 'lightweight-charts';
import {
  Asset,
  AutoCandleSignal,
  Candle,
  CompiledPineResult,
  PatternMatch,
  SignalResult,
  Timeframe,
} from '../types/trading';

interface BotChartProps {
  asset: Asset;
  timeframe: Timeframe;
  candles: Candle[];
  loading: boolean;
  error: string | null;
  activeSignal: SignalResult | null;
  autoSignals: AutoCandleSignal[];
  showAutoSignals: boolean;
  showPatternMarkers: boolean;
  patterns: PatternMatch[];
  pineResults: CompiledPineResult[];
}

export const BotChart: React.FC<BotChartProps> = ({
  asset,
  timeframe,
  candles,
  loading,
  error,
  activeSignal,
  autoSignals,
  showAutoSignals,
  showPatternMarkers,
  patterns,
  pineResults,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const markersPluginRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const extraSeriesRef = useRef<ISeriesApi<'Line' | 'Histogram' | 'Baseline'>[]>([]);
  const lastSignalIdRef = useRef<string | null>(null);
  const [hoverBar, setHoverBar] = useState<Candle | null>(null);

  // Initialize TradingView Lightweight Charts engine once
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: '#0A0D12' },
        textColor: '#94A3B8',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: '#141A23' },
        horzLines: { color: '#141A23' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: '#475569', width: 1, style: LineStyle.Dashed },
        horzLine: { color: '#475569', width: 1, style: LineStyle.Dashed },
      },
      rightPriceScale: {
        borderColor: '#1E2633',
        scaleMargins: { top: 0.12, bottom: 0.2 },
      },
      timeScale: {
        borderColor: '#1E2633',
        timeVisible: true,
        secondsVisible: timeframe.endsWith('s'),
        rightOffset: 18,
      },
      width: el.clientWidth,
      height: el.clientHeight,
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10B981',
      downColor: '#EF4444',
      borderUpColor: '#10B981',
      borderDownColor: '#EF4444',
      wickUpColor: '#10B981',
      wickDownColor: '#EF4444',
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: '#1E293B',
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });

    const markersPlugin = createSeriesMarkers(candleSeries, []);

    chart.subscribeCrosshairMove((param) => {
      if (!param.time) {
        setHoverBar(null);
        return;
      }
      const data = param.seriesData.get(candleSeries) as
        | { open: number; high: number; low: number; close: number; time: number }
        | undefined;
      if (data) {
        setHoverBar({
          time: Number(data.time),
          open: data.open,
          high: data.high,
          low: data.low,
          close: data.close,
          volume: 0,
        });
      }
    });

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          chart.applyOptions({ width, height });
        }
      }
    });
    ro.observe(el);

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;
    markersPluginRef.current = markersPlugin;

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      markersPluginRef.current = null;
    };
  }, []);

  // Update TimeScale seconds visibility when timeframe changes
  useEffect(() => {
    chartRef.current?.applyOptions({
      timeScale: {
        timeVisible: true,
        secondsVisible: timeframe.endsWith('s'),
        rightOffset: 18,
      },
    });
  }, [timeframe]);

  // Sync Candles, Volume, Pine Scripts, Markers, Shaded SL/TP Zones & Hold Trajectory
  useEffect(() => {
    const chart = chartRef.current;
    const candleSeries = candleSeriesRef.current;
    const volumeSeries = volumeSeriesRef.current;
    const markersPlugin = markersPluginRef.current;
    if (!chart || !candleSeries || !volumeSeries || !markersPlugin || candles.length === 0) {
      return;
    }

    candleSeries.applyOptions({
      priceFormat: {
        type: 'price',
        precision: asset.decimals,
        minMove: Math.pow(10, -asset.decimals),
      },
    });

    const candleData = candles.map((c) => ({
      time: c.time as UTCTimestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    const volumeData = candles.map((c) => ({
      time: c.time as UTCTimestamp,
      value: c.volume,
      color: c.close >= c.open ? 'rgba(16, 185, 129, 0.28)' : 'rgba(239, 68, 68, 0.28)',
    }));

    candleSeries.setData(candleData);
    volumeSeries.setData(volumeData);

    // Clear previous extra series (Pine plots + SL/TP shaded zones + Hold trajectory)
    for (const s of extraSeriesRef.current) {
      try {
        chart.removeSeries(s);
      } catch {
        // already removed
      }
    }
    extraSeriesRef.current = [];

    // Clear previous price lines
    for (const pl of priceLinesRef.current) {
      try {
        candleSeries.removePriceLine(pl);
      } catch {
        // ignore
      }
    }
    priceLinesRef.current = [];

    // 1. Render Compiled Pine Script Plots directly onto the TradingView chart
    let nonOverlayPaneIdx = 1;
    for (const pr of pineResults) {
      const targetPane = pr.isOverlay ? 0 : nonOverlayPaneIdx++;
      for (const plot of pr.plots) {
        if (plot.style === 'histogram') {
          const hs = chart.addSeries(
            HistogramSeries,
            {
              color: plot.color,
              title: plot.title,
            },
            targetPane
          );
          hs.setData(
            plot.data.map((d) => ({ time: d.time as UTCTimestamp, value: d.value }))
          );
          extraSeriesRef.current.push(hs);
        } else {
          const ls = chart.addSeries(
            LineSeries,
            {
              color: plot.color,
              lineWidth: plot.lineWidth as 1 | 2 | 3 | 4,
              title: plot.title,
              priceLineVisible: false,
            },
            targetPane
          );
          ls.setData(
            plot.data.map((d) => ({ time: d.time as UTCTimestamp, value: d.value }))
          );
          extraSeriesRef.current.push(ls);
        }
      }
    }

    // 2. Collect all Chart Markers (Candlestick Patterns, Every-5-Candle Auto Signals, Pine Script Entries)
    const markers: SeriesMarker<Time>[] = [];

    if (showPatternMarkers) {
      for (const p of patterns.slice(-18)) {
        const isDoji = p.name.toLowerCase().includes('doji');
        const isEngulf = p.name.toLowerCase().includes('engulfing');
        if (!isDoji && !isEngulf && p.strength < 3) continue;
        markers.push({
          time: p.time as UTCTimestamp,
          position: p.type === 'bearish' ? 'aboveBar' : 'belowBar',
          color:
            p.type === 'bullish'
              ? '#10B981'
              : p.type === 'bearish'
              ? '#EF4444'
              : '#F59E0B',
          shape: 'circle',
          text: isDoji ? 'Doji' : isEngulf ? 'Engulf' : p.name.split(' ')[0],
        });
      }
    }

    if (showAutoSignals) {
      for (const sig of autoSignals) {
        markers.push({
          time: sig.time as UTCTimestamp,
          position: sig.direction === 'BUY' ? 'belowBar' : 'aboveBar',
          color: sig.direction === 'BUY' ? '#10B981' : '#EF4444',
          shape: sig.direction === 'BUY' ? 'arrowUp' : 'arrowDown',
          text: `${sig.direction === 'BUY' ? 'UP' : 'DOWN'} · ${sig.holdLabel}`,
        });
      }
    }

    for (const pr of pineResults) {
      for (const m of pr.markers.slice(-20)) {
        markers.push({
          time: m.time as UTCTimestamp,
          position: m.position,
          color: m.color,
          shape: m.shape,
          text: m.text,
        });
      }
    }

    // 3. Render Active Signal Shaded TP Zone (Green) + Shaded SL Zone (Red) + TP1/TP2/TP3/SL Lines + Hold Target Path!
    const lastBar = candles[candles.length - 1];
    if (activeSignal && activeSignal.tvSymbol === asset.tvSymbol) {
      const isBuy = activeSignal.direction === 'BUY';

      // Find nearest candle timestamp matching the signal entry, or default to latest bar
      const signalTimeSec = Math.floor(activeSignal.timestamp / 1000);
      let entryIdx = candles.length - 1;
      for (let i = candles.length - 1; i >= Math.max(0, candles.length - 30); i--) {
        if (candles[i].time <= signalTimeSec) {
          entryIdx = i;
          break;
        }
      }
      const entryBarTime = candles[entryIdx].time;
      const barStep =
        candles.length >= 2
          ? Math.max(1, candles[candles.length - 1].time - candles[candles.length - 2].time)
          : 60;
      const spanBars = Math.max(3, activeSignal.holdCandlesAhead);

      const zoneTimes: UTCTimestamp[] = [];
      for (let step = 0; step <= spanBars; step++) {
        zoneTimes.push((entryBarTime + step * barStep) as UTCTimestamp);
      }
      const holdEndTime = zoneTimes[zoneTimes.length - 1];

      // TradingView-style Green Profit Shaded Box (Entry -> TP1)
      const tpZoneSeries = chart.addSeries(BaselineSeries, {
        baseValue: { type: 'price', price: activeSignal.entryPrice },
        topLineColor: isBuy ? 'rgba(16, 185, 129, 0.95)' : 'rgba(16, 185, 129, 0)',
        topFillColor1: isBuy ? 'rgba(16, 185, 129, 0.24)' : 'rgba(16, 185, 129, 0)',
        topFillColor2: isBuy ? 'rgba(16, 185, 129, 0.08)' : 'rgba(16, 185, 129, 0)',
        bottomLineColor: !isBuy ? 'rgba(16, 185, 129, 0.95)' : 'rgba(16, 185, 129, 0)',
        bottomFillColor1: !isBuy ? 'rgba(16, 185, 129, 0.08)' : 'rgba(16, 185, 129, 0)',
        bottomFillColor2: !isBuy ? 'rgba(16, 185, 129, 0.24)' : 'rgba(16, 185, 129, 0)',
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      tpZoneSeries.setData(
        zoneTimes.map((t) => ({ time: t, value: activeSignal.takeProfit1 }))
      );
      extraSeriesRef.current.push(tpZoneSeries);

      // TradingView-style Red Risk Shaded Box (Entry -> SL)
      const slZoneSeries = chart.addSeries(BaselineSeries, {
        baseValue: { type: 'price', price: activeSignal.entryPrice },
        topLineColor: !isBuy ? 'rgba(239, 68, 68, 0.95)' : 'rgba(239, 68, 68, 0)',
        topFillColor1: !isBuy ? 'rgba(239, 68, 68, 0.22)' : 'rgba(239, 68, 68, 0)',
        topFillColor2: !isBuy ? 'rgba(239, 68, 68, 0.08)' : 'rgba(239, 68, 68, 0)',
        bottomLineColor: isBuy ? 'rgba(239, 68, 68, 0.95)' : 'rgba(239, 68, 68, 0)',
        bottomFillColor1: isBuy ? 'rgba(239, 68, 68, 0.08)' : 'rgba(239, 68, 68, 0)',
        bottomFillColor2: isBuy ? 'rgba(239, 68, 68, 0.22)' : 'rgba(239, 68, 68, 0)',
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      slZoneSeries.setData(
        zoneTimes.map((t) => ({ time: t, value: activeSignal.stopLoss }))
      );
      extraSeriesRef.current.push(slZoneSeries);

      // Projected Holding Target Path (Entry -> Hold Expiry TP1)
      const projSeries = chart.addSeries(LineSeries, {
        color: '#F59E0B',
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        lastValueVisible: false,
        priceLineVisible: false,
        title: `Hold Target (${activeSignal.holdDuration})`,
      });
      projSeries.setData([
        { time: entryBarTime as UTCTimestamp, value: activeSignal.entryPrice },
        { time: holdEndTime, value: activeSignal.takeProfit1 },
      ]);
      extraSeriesRef.current.push(projSeries);

      markers.push({
        time: entryBarTime as UTCTimestamp,
        position: isBuy ? 'belowBar' : 'aboveBar',
        color: isBuy ? '#10B981' : '#DC2626',
        shape: isBuy ? 'arrowUp' : 'arrowDown',
        text: `${activeSignal.direction} @ ${activeSignal.entryPrice.toFixed(asset.decimals)} · HOLD ${activeSignal.holdDuration}`,
      });

      // Entry Price Line
      priceLinesRef.current.push(
        candleSeries.createPriceLine({
          price: activeSignal.entryPrice,
          color: '#38BDF8',
          lineWidth: 2,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: `ENTRY ${activeSignal.direction}`,
        })
      );

      // Stop Loss Line
      priceLinesRef.current.push(
        candleSeries.createPriceLine({
          price: activeSignal.stopLoss,
          color: '#EF4444',
          lineWidth: 2,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: `SL (-$${activeSignal.riskUsd.toFixed(2)})`,
        })
      );

      // TP1 (Primary Hold Target)
      priceLinesRef.current.push(
        candleSeries.createPriceLine({
          price: activeSignal.takeProfit1,
          color: '#10B981',
          lineWidth: 2,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: `TP1 (${activeSignal.holdDuration} +$${activeSignal.reward1Usd.toFixed(2)})`,
        })
      );

      // TP2 & TP3
      priceLinesRef.current.push(
        candleSeries.createPriceLine({
          price: activeSignal.takeProfit2,
          color: '#34D399',
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          title: `TP2 (+$${activeSignal.reward2Usd.toFixed(2)})`,
        })
      );
      priceLinesRef.current.push(
        candleSeries.createPriceLine({
          price: activeSignal.takeProfit3,
          color: '#6EE7B7',
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          title: `TP3 (+$${activeSignal.reward3Usd.toFixed(2)})`,
        })
      );

      // Scroll cleanly into view when a new signal is generated
      if (lastSignalIdRef.current !== activeSignal.id) {
        lastSignalIdRef.current = activeSignal.id;
        chart.timeScale().applyOptions({
          rightOffset: Math.max(16, spanBars + 6),
        });
        chart.timeScale().scrollToRealTime();
      }
    } else if (lastBar) {
      lastSignalIdRef.current = null;
    }

    markers.sort((a, b) => Number(a.time) - Number(b.time));
    markersPlugin.setMarkers(markers);
  }, [
    candles,
    asset,
    activeSignal,
    autoSignals,
    showAutoSignals,
    showPatternMarkers,
    patterns,
    pineResults,
  ]);

  const currentBar = candles[candles.length - 1];
  const latest = hoverBar ?? currentBar;
  const isUp = latest ? latest.close >= latest.open : true;

  // Compute live floating P/L for active signal
  let floatingPips = 0;
  let floatingUsd = 0;
  let tradeState: 'RUNNING' | 'TP1 HIT' | 'SL HIT' = 'RUNNING';
  if (activeSignal && activeSignal.tvSymbol === asset.tvSymbol && currentBar) {
    const diff =
      activeSignal.direction === 'BUY'
        ? currentBar.close - activeSignal.entryPrice
        : activeSignal.entryPrice - currentBar.close;
    floatingPips = Math.round((diff / asset.pipSize) * 10) / 10;
    floatingUsd = Math.round(diff * asset.contractSize * activeSignal.lotSize * 100) / 100;
    if (
      (activeSignal.direction === 'BUY' && currentBar.close >= activeSignal.takeProfit1) ||
      (activeSignal.direction === 'SELL' && currentBar.close <= activeSignal.takeProfit1)
    ) {
      tradeState = 'TP1 HIT';
    } else if (
      (activeSignal.direction === 'BUY' && currentBar.close <= activeSignal.stopLoss) ||
      (activeSignal.direction === 'SELL' && currentBar.close >= activeSignal.stopLoss)
    ) {
      tradeState = 'SL HIT';
    }
  }

  return (
    <div className="relative flex-1 min-h-[420px] bg-[#0A0D12] select-none">
      {/* Live OHLCV & Active Signal HUD */}
      <div className="absolute top-3 left-3 z-10 pointer-events-none flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-3 text-[12px] bg-[#0D1117]/90 backdrop-blur-sm px-2.5 py-1 rounded border border-[#1E2633]">
          <span className="font-semibold text-[#F8FAFC]">{asset.tvSymbol}</span>
          <span className="text-[#64748B]">·</span>
          <span className="text-[#94A3B8]">{timeframe}</span>
          {latest && (
            <div className="flex items-center gap-2.5 tabular-nums text-[11px]">
              <span className="text-[#94A3B8]">
                O <span className={isUp ? 'text-[#10B981]' : 'text-[#EF4444]'}>{latest.open.toFixed(asset.decimals)}</span>
              </span>
              <span className="text-[#94A3B8]">
                H <span className={isUp ? 'text-[#10B981]' : 'text-[#EF4444]'}>{latest.high.toFixed(asset.decimals)}</span>
              </span>
              <span className="text-[#94A3B8]">
                L <span className={isUp ? 'text-[#10B981]' : 'text-[#EF4444]'}>{latest.low.toFixed(asset.decimals)}</span>
              </span>
              <span className="text-[#94A3B8]">
                C <span className={isUp ? 'text-[#10B981]' : 'text-[#EF4444]'}>{latest.close.toFixed(asset.decimals)}</span>
              </span>
            </div>
          )}
        </div>

        {activeSignal && activeSignal.tvSymbol === asset.tvSymbol && (
          <div className="flex flex-wrap items-center gap-2.5 text-[11px] bg-[#0D1117]/95 px-2.5 py-1.5 rounded border border-[#1E2633] tabular-nums">
            <span
              className={`font-semibold ${
                activeSignal.direction === 'BUY' ? 'text-[#10B981]' : 'text-[#EF4444]'
              }`}
            >
              {activeSignal.direction} @ {activeSignal.entryPrice.toFixed(asset.decimals)}
            </span>
            <span className="text-[#475569]">·</span>
            <span className="text-[#F59E0B]">
              Hold {activeSignal.holdDuration} (~{activeSignal.holdCandlesAhead} bars)
            </span>
            <span className="text-[#475569]">·</span>
            <span className="text-[#10B981]">TP1 {activeSignal.takeProfit1.toFixed(asset.decimals)}</span>
            <span className="text-[#EF4444]">SL {activeSignal.stopLoss.toFixed(asset.decimals)}</span>
            <span className="text-[#475569]">·</span>
            <span className="text-[#94A3B8]">R:R 1:{activeSignal.riskRewardRatio}</span>
            <span className="text-[#475569]">·</span>
            <span
              className={`font-semibold ${
                tradeState === 'TP1 HIT' || floatingUsd > 0
                  ? 'text-[#10B981]'
                  : tradeState === 'SL HIT' || floatingUsd < 0
                  ? 'text-[#EF4444]'
                  : 'text-[#94A3B8]'
              }`}
            >
              {tradeState} ({floatingUsd >= 0 ? '+' : ''}${floatingUsd.toFixed(2)} / {floatingPips >= 0 ? '+' : ''}{floatingPips}p)
            </span>
          </div>
        )}
      </div>

      {/* Loading / Error State */}
      {loading && candles.length === 0 && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#0A0D12]/80 text-[13px] text-[#94A3B8]">
          Loading live {asset.tvSymbol} ({timeframe}) market feed...
        </div>
      )}
      {error && candles.length === 0 && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#0A0D12]/90 text-[13px] text-[#EF4444] px-6 text-center">
          Market feed error for {asset.tvSymbol}: {error}
        </div>
      )}

      <div ref={containerRef} className="w-full h-full min-h-[420px]" />
    </div>
  );
};
