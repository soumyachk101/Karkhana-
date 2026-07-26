'use client';

import { useEffect, useState } from 'react';
import { MODELS, type Model, type Project } from '@/lib/types';

type Props = {
  projects: Project[];
  defaultProjectId: string | null;
  onClose: () => void;
  onCreate: (input: { projectId: string; title: string; prompt: string; model: Model }) => Promise<void>;
};

export function NewTaskDialog({ projects, defaultProjectId, onClose, onCreate }: Props) {
  const [projectId, setProjectId] = useState(defaultProjectId ?? projects[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState<Model>('sonnet');
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
  });

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
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-24" onClick={onClose}>
      <div
        className="w-[600px] rounded-lg border border-ink-600 bg-ink-850 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-ink-700 px-3 py-2">
          <span className="text-[12px] font-medium text-ink-100">New task</span>
          <button onClick={onClose} className="rounded px-1.5 text-ink-400 hover:bg-ink-700 hover:text-ink-100">
            ×
          </button>
        </div>

        <div className="space-y-2.5 p-3">
          <div className="flex gap-2">
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="flex-1 rounded border border-ink-600 bg-ink-900 px-2 py-1.5 text-[12px] text-ink-100 outline-none focus:border-forge-600"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.base_branch})
                </option>
              ))}
            </select>

            <div className="flex overflow-hidden rounded border border-ink-600">
              {MODELS.map((m) => (
                <button
                  key={m}
                  onClick={() => setModel(m)}
                  className={`px-2.5 py-1.5 text-[11px] capitalize ${
                    model === m ? 'bg-forge-600 text-ink-900' : 'bg-ink-900 text-ink-300 hover:bg-ink-700'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (optional — defaults to the first line of the prompt)"
            className="w-full rounded border border-ink-600 bg-ink-900 px-2 py-1.5 text-[12px] text-ink-100 placeholder-ink-400 outline-none focus:border-forge-600"
          />

          <textarea
            autoFocus
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={7}
            placeholder="What should the agent do? It runs headless in an isolated worktree off the base branch."
            className="w-full resize-none rounded border border-ink-600 bg-ink-900 px-2 py-1.5 font-mono text-[12px] leading-relaxed text-ink-100 placeholder-ink-400 outline-none focus:border-forge-600"
          />

          {error && <p className="text-[11px] text-red-300">{error}</p>}

          <div className="flex items-center gap-2">
            <button
              onClick={submit}
              disabled={busy || !prompt.trim() || !projectId}
              className="rounded bg-forge-600 px-3 py-1.5 text-[12px] font-medium text-ink-900 hover:bg-forge-500 disabled:opacity-40"
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
