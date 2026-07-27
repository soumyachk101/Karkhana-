'use client';

import { Sparkles, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { MODELS, type Model, type Project } from '@/lib/types';

type Props = {
  projects: Project[];
  defaultProjectId: string | null;
  claudeEnabled?: boolean;
  onClose: () => void;
  onCreate: (input: { projectId: string; title: string; prompt: string; model: Model }) => Promise<void>;
};

export function NewTaskDialog({ projects, defaultProjectId, claudeEnabled, onClose, onCreate }: Props) {
  const [projectId, setProjectId] = useState(defaultProjectId ?? projects[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState<Model>('antigravity-flash');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      // Cmd/Ctrl+Enter submits from anywhere in the form.
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void submit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, prompt, projectId, title, model, busy]);

  const submit = async () => {
    if (!projectId || !prompt.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onCreate({ projectId, title: title.trim() || prompt.trim().slice(0, 60), prompt: prompt.trim(), model });
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div
      className="animate-fade fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-24 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="animate-pop w-[620px] rounded-2xl border border-slate-700/60 bg-[#0E1118]/95 p-1 shadow-[0_16px_40px_rgba(0,0,0,0.6)] backdrop-blur-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-800/80 px-4 py-3">
          <span className="font-display flex items-center gap-2 text-[14px] font-bold text-amber-300">
            <Sparkles className="h-4 w-4 text-amber-300" strokeWidth={2} />
            Dispatch New AI Agent Task
          </span>
          <button
            onClick={onClose}
            className="rounded p-1 text-ink-400 outline-none transition-colors hover:bg-ink-700 hover:text-ink-100 focus-visible:ring-2 focus-visible:ring-forge-500/60"
          >
            <X className="h-3.5 w-3.5" strokeWidth={2.25} />
          </button>
        </div>

        <div className="space-y-2.5 p-3">
          <div className="flex gap-2">
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="flex-1 rounded border border-ink-600 bg-ink-900 px-2 py-1.5 text-[12px] text-ink-100 outline-none focus:border-forge-600 focus-visible:ring-2 focus-visible:ring-forge-500/50"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.base_branch})
                </option>
              ))}
            </select>

            <select
              value={model}
              onChange={(e) => setModel(e.target.value as Model)}
              className="rounded-xl border border-amber-500/50 bg-[#101420] px-3 py-1.5 text-[12px] font-bold text-amber-300 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-500/40 shadow-inner"
            >
              <optgroup label="✨ Antigravity Engine Models">
                <option value="antigravity-flash">⚡ Antigravity Flash</option>
                <option value="antigravity-pro">🚀 Antigravity Pro</option>
              </optgroup>
              <optgroup label="🤖 OpenAI / Codex Models">
                <option value="codex-gpt5.5">🔥 Codex GPT-5.5 (Recommended)</option>
                <option value="codex-gpt4o">🧠 Codex GPT-4o</option>
                <option value="codex-o3-mini">🔬 Codex o3-mini</option>
              </optgroup>
              {claudeEnabled && (
                <optgroup label="🟣 Anthropic Claude Models">
                  <option value="sonnet">Claude Sonnet 3.7</option>
                  <option value="opus">Claude Opus 3.5</option>
                  <option value="haiku">Claude Haiku 3.5</option>
                </optgroup>
              )}
            </select>
          </div>

          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (optional — defaults to the first line of the prompt)"
            className="w-full rounded border border-ink-600 bg-ink-900 px-2 py-1.5 text-[12px] text-ink-100 placeholder-ink-400 outline-none focus:border-forge-600 focus-visible:ring-2 focus-visible:ring-forge-500/50"
          />

          <textarea
            autoFocus
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={7}
            placeholder="What should the agent do? It runs headless in an isolated worktree off the base branch."
            className="w-full resize-none rounded border border-ink-600 bg-ink-900 px-2 py-1.5 font-mono text-[12px] leading-relaxed text-ink-100 placeholder-ink-400 outline-none focus:border-forge-600 focus-visible:ring-2 focus-visible:ring-forge-500/50"
          />

          {error && <p className="animate-rise text-[11px] text-red-300">{error}</p>}

          <div className="flex items-center gap-2">
            <button
              onClick={submit}
              disabled={busy || !prompt.trim() || !projectId}
              className="rounded-md border border-forge-600 bg-gradient-to-b from-forge-500 to-forge-600 px-3 py-1.5 text-[12px] font-medium text-ink-900 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.25),0_2px_8px_-2px_rgba(217,119,6,0.5)] outline-none transition hover:from-forge-400 hover:to-forge-500 focus-visible:ring-2 focus-visible:ring-forge-400/70 active:scale-[0.97] disabled:opacity-40 disabled:active:scale-100"
            >
              {busy ? 'Dispatching…' : 'Dispatch agent'}
            </button>
            <span className="text-[11px] text-ink-400">⌘↵ to submit · Esc to close</span>
          </div>
        </div>
      </div>
    </div>
  );
}
