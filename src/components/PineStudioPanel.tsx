import React, { useState } from 'react';
import { Code2, Play, Trash2, Copy, Check } from 'lucide-react';
import { PINE_TEMPLATES } from '../engine/pineScriptParser';
import { CompiledPineResult, PineScriptItem } from '../types/trading';

interface PineStudioPanelProps {
  scripts: PineScriptItem[];
  compiledResults: CompiledPineResult[];
  onSaveScript: (script: { id?: string; name: string; code: string; enabled: boolean }) => Promise<void>;
  onToggleScript: (id: string) => Promise<void>;
  onDeleteScript: (id: string) => Promise<void>;
  onBackToChart: () => void;
}

export const PineStudioPanel: React.FC<PineStudioPanelProps> = ({
  scripts,
  compiledResults,
  onSaveScript,
  onToggleScript,
  onDeleteScript,
  onBackToChart,
}) => {
  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [name, setName] = useState(PINE_TEMPLATES[0].name);
  const [code, setCode] = useState(PINE_TEMPLATES[0].code);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleApplyAndShowOnChart = async () => {
    if (!name.trim() || !code.trim()) return;
    setSaving(true);
    try {
      await onSaveScript({ id: editingId, name: name.trim(), code, enabled: true });
      onBackToChart();
    } finally {
      setSaving(false);
    }
  };

  const handleCopyCode = () => {
    navigator.clipboard?.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex-1 flex flex-col lg:flex-row min-h-0 bg-[#0A0D12]">
      {/* Left Saved Pine Scripts Library */}
      <div className="w-full lg:w-[310px] border-r border-[#1E2633] bg-[#0D1117] flex flex-col min-h-0">
        <div className="p-4 border-b border-[#1E2633] flex items-center justify-between">
          <div>
            <h2 className="text-[13px] font-semibold text-[#F1F5F9]">
              My Pine Scripts
            </h2>
            <p className="text-[11px] text-[#64748B]">
              Injected live onto TradingView Terminal
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setEditingId(undefined);
              setName('Custom Pine Strategy');
              setCode(`//@version=5\nstrategy("Custom Pine Strategy", overlay=true)\nemaFast = ta.ema(close, 12)\nemaSlow = ta.ema(close, 26)\nplot(emaFast, title="EMA 12", color=color.green, linewidth=2)\nplot(emaSlow, title="EMA 26", color=color.red, linewidth=2)\nif ta.crossover(emaFast, emaSlow)\n    strategy.entry("Buy", strategy.long)\nif ta.crossunder(emaFast, emaSlow)\n    strategy.entry("Sell", strategy.short)`);
            }}
            className="px-2.5 py-1 rounded bg-[#1E293B] hover:bg-[#334155] text-[11px] font-medium text-[#F8FAFC] cursor-pointer"
          >
            + New
          </button>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-[#151C26]">
          {scripts.map((s) => {
            const compiled = compiledResults.find((c) => c.scriptId === s.id);
            return (
              <div key={s.id} className="p-3 space-y-2 hover:bg-[#121822]">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(s.id);
                      setName(s.name);
                      setCode(s.code);
                    }}
                    className="text-left text-[12px] font-semibold text-[#F1F5F9] hover:text-white truncate cursor-pointer"
                  >
                    {s.name}
                  </button>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => onToggleScript(s.id)}
                      className={`px-2 py-0.5 rounded text-[11px] font-medium cursor-pointer ${
                        s.enabled
                          ? 'bg-[#10B981]/20 text-[#10B981]'
                          : 'bg-[#1E293B] text-[#94A3B8]'
                      }`}
                    >
                      {s.enabled ? 'On Chart' : 'Hidden'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteScript(s.id)}
                      title="Delete script"
                      className="p-1 text-[#64748B] hover:text-[#EF4444] cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between text-[11px] text-[#64748B]">
                  <span>{s.isOverlay ? 'Chart Overlay' : 'Lower Oscillator Pane'}</span>
                  {compiled && (
                    <span
                      className={
                        compiled.latestSignal === 'BUY'
                          ? 'text-[#10B981]'
                          : compiled.latestSignal === 'SELL'
                          ? 'text-[#EF4444]'
                          : 'text-[#64748B]'
                      }
                    >
                      Signal: {compiled.latestSignal}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Built-in Templates */}
        <div className="p-3 border-t border-[#1E2633] space-y-1.5">
          <div className="text-[11px] font-medium text-[#94A3B8]">
            Quick Pine Script Templates
          </div>
          <div className="flex flex-wrap gap-1.5">
            {PINE_TEMPLATES.map((tpl) => (
              <button
                key={tpl.name}
                type="button"
                onClick={() => {
                  setEditingId(undefined);
                  setName(tpl.name);
                  setCode(tpl.code);
                }}
                className="px-2 py-1 rounded bg-[#131922] hover:bg-[#1E293B] border border-[#1E2633] text-[11px] text-[#CBD5E1] cursor-pointer"
              >
                {tpl.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Right Pine Script Editor */}
      <div className="flex-1 flex flex-col min-h-0 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Code2 className="w-5 h-5 text-[#DC2626]" />
            <div>
              <h1 className="font-display text-base font-semibold text-[#F8FAFC]">
                Pine Script v5 Strategy Builder & Compiler
              </h1>
              <p className="text-[12px] text-[#94A3B8]">
                Paste any TradingView Pine Script (<code className="text-[#E2E8F0]">ta.ema</code>, <code className="text-[#E2E8F0]">ta.sma</code>, <code className="text-[#E2E8F0]">ta.rsi</code>, <code className="text-[#E2E8F0]">ta.bb</code>, <code className="text-[#E2E8F0]">ta.supertrend</code>, <code className="text-[#E2E8F0]">plot</code>, <code className="text-[#E2E8F0]">strategy.entry</code>) to render live on the terminal chart.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyCode}
              className="flex items-center gap-1.5 px-3 py-2 rounded-md border border-[#1E2633] bg-[#131922] hover:bg-[#1E293B] text-[12px] text-[#E2E8F0] cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-[#10B981]" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy Pine'}</span>
            </button>

            <button
              type="button"
              onClick={handleApplyAndShowOnChart}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-[#DC2626] hover:bg-[#B91C1C] text-white text-[12px] font-semibold cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              <span>{saving ? 'Compiling...' : 'Compile & Add to Chart'}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 flex-1 min-h-0">
          <div>
            <label className="block text-[11px] font-medium text-[#94A3B8] mb-1">
              Strategy / Indicator Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full max-w-md bg-[#131922] border border-[#1E2633] focus:border-[#475569] rounded-md px-3 py-2 text-[13px] text-[#F1F5F9] outline-none"
            />
          </div>

          <div className="flex-1 flex flex-col min-h-[280px]">
            <label className="block text-[11px] font-medium text-[#94A3B8] mb-1">
              Pine Script Source Code
            </label>
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              spellCheck={false}
              className="flex-1 w-full bg-[#0D1117] border border-[#1E2633] focus:border-[#475569] rounded-md p-4 font-mono text-[13px] leading-relaxed text-[#E2E8F0] outline-none resize-none"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
