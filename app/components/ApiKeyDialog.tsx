'use client';

import { Key, Save, ToggleLeft, ToggleRight, X } from 'lucide-react';
import { useState } from 'react';

type Props = {
  claudeEnabled?: boolean;
  onClose: () => void;
  onSave: (keys: { anthropicApiKey?: string; openaiApiKey?: string; geminiApiKey?: string; claudeEnabled?: boolean }) => Promise<void>;
};

export function ApiKeyDialog({ claudeEnabled: initialClaudeEnabled, onClose, onSave }: Props) {
  const [anthropicKey, setAnthropicKey] = useState('');
  const [openaiKey, setOpenaiKey] = useState('');
  const [claudeOn, setClaudeOn] = useState(initialClaudeEnabled ?? false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await onSave({
        anthropicApiKey: anthropicKey.trim() || undefined,
        openaiApiKey: openaiKey.trim() || undefined,
        claudeEnabled: claudeOn,
      });
      setSaved(true);
      setTimeout(() => onClose(), 600);
    } catch (err) {
      console.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="animate-fade fixed inset-0 z-50 flex items-start justify-center bg-black/70 pt-20 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="animate-pop w-[500px] rounded-xl border border-ink-600 bg-gradient-to-b from-ink-800 to-ink-850 p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-ink-700/80 pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-forge-500/20 text-forge-400">
              <Key className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-display text-[14px] font-semibold text-ink-100">Agent Configuration</h3>
              <p className="text-[11px] text-ink-400">Configure agent runners, API keys & Claude toggle</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-ink-400 hover:bg-ink-700 hover:text-ink-100 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          {/* Claude Enable/Disable Toggle */}
          <div className="rounded border border-ink-700/80 bg-ink-900/60 p-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[12px] font-semibold text-ink-100">Claude Code Agents</span>
                <p className="text-[10px] text-ink-400 mt-0.5">
                  {claudeOn
                    ? 'Claude Sonnet / Opus / Haiku are visible in model selector'
                    : 'Claude models are hidden — using Antigravity & Codex only'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setClaudeOn((v) => !v)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold transition ${
                  claudeOn
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                    : 'bg-red-500/15 text-red-400 border border-red-500/30'
                }`}
              >
                {claudeOn ? (
                  <>
                    <ToggleRight className="h-3.5 w-3.5" />
                    Enabled
                  </>
                ) : (
                  <>
                    <ToggleLeft className="h-3.5 w-3.5" />
                    Disabled
                  </>
                )}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-forge-400 mb-1">
              Anthropic API Key (Claude Code)
            </label>
            <input
              type="password"
              value={anthropicKey}
              onChange={(e) => setAnthropicKey(e.target.value)}
              placeholder="sk-ant-api03-..."
              className="w-full rounded border border-ink-600 bg-ink-900 px-2.5 py-1.5 font-mono text-[12px] text-ink-100 placeholder-ink-500 outline-none focus:border-forge-500 focus:ring-1 focus:ring-forge-500/50"
            />
            <p className="mt-1 text-[10px] text-ink-400">
              Required only for Claude models. Obtain key from console.anthropic.com
            </p>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-sky-400 mb-1">
              OpenAI API Key (Codex / GPT-4o)
            </label>
            <input
              type="password"
              value={openaiKey}
              onChange={(e) => setOpenaiKey(e.target.value)}
              placeholder="sk-proj-..."
              className="w-full rounded border border-ink-600 bg-ink-900 px-2.5 py-1.5 font-mono text-[12px] text-ink-100 placeholder-ink-500 outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500/50"
            />
          </div>

          <div className="pt-2 flex items-center justify-between">
            <span className="text-[10px] text-emerald-400 font-mono">
              {saved ? '✓ Settings Saved!' : ''}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded px-3 py-1.5 text-[11px] text-ink-300 hover:bg-ink-700 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="flex items-center gap-1 rounded bg-forge-500 px-3 py-1.5 text-[11px] font-semibold text-ink-900 hover:bg-forge-400 disabled:opacity-50 transition"
              >
                <Save className="h-3.5 w-3.5" />
                {busy ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
