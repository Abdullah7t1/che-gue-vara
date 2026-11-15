import React, { useEffect, useId, useRef } from 'react';
import { ALL_TIMEFRAMES } from '../data/assets';
import { Timeframe } from '../types/trading';

interface TradingViewWidgetProps {
  tvSymbol: string;
  timeframe: Timeframe;
}

declare global {
  interface Window {
    TradingView?: {
      widget: new (config: Record<string, unknown>) => unknown;
    };
  }
}

export const TradingViewWidget: React.FC<TradingViewWidgetProps> = ({
  tvSymbol,
  timeframe,
}) => {
  const containerId = useId().replace(/:/g, '_');
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const tvInterval =
      ALL_TIMEFRAMES.find((t) => t.value === timeframe)?.tvInterval ?? '5';

    const initWidget = () => {
      if (!window.TradingView || !hostRef.current) return;
      hostRef.current.innerHTML = '';
      const inner = document.createElement('div');
      inner.id = `tv_${containerId}`;
      inner.style.width = '100%';
      inner.style.height = '100%';
      hostRef.current.appendChild(inner);

      new window.TradingView.widget({
        autosize: true,
        symbol: tvSymbol,
        interval: tvInterval,
        timezone: 'Etc/UTC',
        theme: 'dark',
        style: '1',
        locale: 'en',
        enable_publishing: false,
        withdateranges: true,
        hide_side_toolbar: false,
        allow_symbol_change: true,
        details: true,
        hotlist: true,
        calendar: false,
        studies: ['STD;EMA', 'STD;RSI'],
        container_id: inner.id,
      });
    };

    if (window.TradingView) {
      initWidget();
      return;
    }

    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src="https://s3.tradingview.com/tv.js"]'
    );
    if (existingScript) {
      existingScript.addEventListener('load', initWidget);
      return () => existingScript.removeEventListener('load', initWidget);
    }

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/tv.js';
    script.async = true;
    script.onload = initWidget;
    document.head.appendChild(script);
  }, [tvSymbol, timeframe, containerId]);

  return (
    <div className="flex-1 w-full h-full min-h-[420px] bg-[#0A0D12] relative">
      <div ref={hostRef} className="w-full h-full min-h-[420px]" />
    </div>
  );
};
