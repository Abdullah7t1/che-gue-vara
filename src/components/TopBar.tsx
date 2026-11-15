import React from 'react';

export type WorkspaceTab = 'bot' | 'tradingview' | 'split' | 'pine' | 'matrix';

interface TopBarProps {
  activeTab: WorkspaceTab;
  onSelectTab: (tab: WorkspaceTab) => void;
  onGetSignal: () => void;
  isScanning: boolean;
}

export const TopBar: React.FC<TopBarProps> = ({
  activeTab,
  onSelectTab,
  onGetSignal,
  isScanning,
}) => {
  const navItems: { id: WorkspaceTab; label: string }[] = [
    { id: 'bot', label: 'Bot Terminal' },
    { id: 'tradingview', label: 'TradingView Live' },
    { id: 'split', label: 'Split Charts' },
    { id: 'pine', label: 'Pine Studio' },
    { id: 'matrix', label: '500+ Matrix' },
  ];

  return (
    <header className="h-14 shrink-0 border-b border-[#1E2633] bg-[#0D1117] px-5 flex items-center justify-between gap-8">
      {/* Zone 1: Single-line Brand Wordmark */}
      <div className="flex items-center gap-2.5 whitespace-nowrap shrink-0">
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          className="shrink-0"
        >
          <rect width="24" height="24" rx="5" fill="#DC2626" />
          <path
            d="M12 4.5L13.9 9.6L19.3 9.8L15.1 13.1L16.5 18.4L12 15.3L7.5 18.4L8.9 13.1L4.7 9.8L10.1 9.6L12 4.5Z"
            fill="#F8FAFC"
          />
        </svg>
        <span className="font-display text-base font-bold tracking-tight text-[#F8FAFC] whitespace-nowrap shrink-0">
          Che Guevara Trading
        </span>
      </div>

      {/* Zone 2: Clean single-line navigation links */}
      <nav className="hidden md:flex items-center gap-6">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              className={`relative py-4 text-[13px] font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                isActive
                  ? 'text-[#F8FAFC]'
                  : 'text-[#94A3B8] hover:text-[#E2E8F0]'
              }`}
            >
              {item.label}
              {isActive && (
                <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#DC2626]" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Zone 3: Single Primary Action */}
      <div className="flex items-center shrink-0">
        <button
          type="button"
          onClick={onGetSignal}
          disabled={isScanning}
          className="px-4 py-2 rounded-md bg-[#DC2626] hover:bg-[#B91C1C] disabled:opacity-60 text-white text-[13px] font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer"
        >
          {isScanning ? 'Scanning Market...' : 'Get Signal'}
        </button>
      </div>
    </header>
  );
};
