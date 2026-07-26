'use client';

import { useEffect, useState } from 'react';
import { MODELS, type Model, type Project } from '@/lib/types';
import { Icon } from './ui/icons.tsx';
import { Button, Kbd, Modal } from './ui/primitives.tsx';

const MODEL_COPY: Record<Model, { blurb: string; icon: string }> = {
  haiku: { blurb: 'Fastest. Mechanical edits, renames, small fixes.', icon: 'zap' },
  sonnet: { blurb: 'Balanced default. Most feature work lands here.', icon: 'sparkles' },
  opus: { blurb: 'Deepest reasoning. Gnarly refactors and debugging.', icon: 'brain' },
};

const STARTERS = [
  { label: 'Fix failing tests', prompt: 'Run the test suite, find why it fails, and fix it. Keep the change minimal and explain what was broken.' },
  { label: 'Add tests', prompt: 'Add tests for the code in <path>. Match the existing test style and cover the edge cases that are currently untested.' },
  { label: 'Refactor', prompt: 'Refactor <path> for clarity without changing behaviour. Keep the public API stable and note anything you deliberately left alone.' },
  { label: 'Review & fix', prompt: 'Review the recent changes on this branch for bugs, then fix what you find. Report anything you chose not to change and why.' },
];

export function NewTaskDialog({
  projects,
  defaultProjectId,
  onClose,
  onCreate,
}: {
  projects: Project[];
  defaultProjectId: string | null;
  onClose: () => void;
  onCreate: (input: { projectId: string; title: string; prompt: string; model: Model }) => Promise<void>;
}) {
  const [projectId, setProjectId] = useState(defaultProjectId ?? projects[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState<Model>('sonnet');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const project = projects.find((p) => p.id === projectId);

  const submit = async () => {
    if (!projectId || !prompt.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onCreate({
        projectId,
        title: title.trim() || prompt.trim().split('\n')[0]?.slice(0, 60) || 'Untitled task',
        prompt: prompt.trim(),
        model,
      });
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Cmd/Ctrl+Enter submits from anywhere in the form.
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void submit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <Modal
      title="Dispatch an agent"
      subtitle={
        project
          ? `Runs headless in a fresh worktree off ${project.base_branch} — the main tree is never touched.`
          : 'Register a project first.'
      }
      icon="sparkles"
      onClose={onClose}
      width="w-[660px]"
      footer={
        <>
          <Button
            tone="primary"
            size="md"
            icon="play"
            busy={busy}
            disabled={!prompt.trim() || !projectId}
            onClick={() => void submit()}
          >
            Dispatch agent
          </Button>
          <span className="flex items-center gap-1 text-[11px] text-ink-500">
            <Kbd>⌘</Kbd>
            <Kbd>↵</Kbd>
            to dispatch
          </span>
          <span className="flex-1" />
          {error && <span className="truncate text-[11px] text-danger">{error}</span>}
        </>
      }
    >
      <div className="space-y-3 p-3.5">
        <div className="space-y-1.5">
          <label className="text-[10px] uppercase tracking-wider text-ink-400">Project</label>
          <div className="relative">
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full appearance-none rounded-md border border-ink-600 bg-ink-900 px-2.5 py-2 pr-8 text-[12.5px] text-ink-100 outline-none focus:border-forge-500/60"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.base_branch}
                </option>
              ))}
            </select>
            <Icon
              name="chevronDown"
              size={13}
              className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-400"
            />
          </div>
          {project && (
            <p className="truncate font-mono text-[10.5px] text-ink-500">{project.path}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] uppercase tracking-wider text-ink-400">Model</label>
          <div className="grid grid-cols-3 gap-1.5">
            {MODELS.map((m) => {
              const active = model === m;
              return (
                <button
                  key={m}
                  onClick={() => setModel(m)}
                  className={`rounded-lg border p-2 text-left transition-colors ${
                    active
                      ? 'border-forge-500/60 bg-forge-500/10'
                      : 'border-ink-700 bg-ink-800 hover:border-ink-500'
                  }`}
                >
                  <span
                    className={`flex items-center gap-1.5 text-[12px] font-medium capitalize ${
                      active ? 'text-forge-500' : 'text-ink-100'
                    }`}
                  >
                    <Icon name={MODEL_COPY[m].icon} size={13} />
                    {m}
                  </span>
                  <span className="mt-0.5 block text-[10.5px] leading-snug text-ink-400">
                    {MODEL_COPY[m].blurb}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] uppercase tracking-wider text-ink-400">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Optional — defaults to the first line of the prompt"
            className="w-full rounded-md border border-ink-600 bg-ink-900 px-2.5 py-2 text-[12.5px] text-ink-100 placeholder-ink-500 outline-none focus:border-forge-500/60"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <label className="text-[10px] uppercase tracking-wider text-ink-400">Prompt</label>
            <span className="flex-1" />
            {STARTERS.map((starter) => (
              <button
                key={starter.label}
                onClick={() => setPrompt(starter.prompt)}
                className="rounded border border-ink-700 bg-ink-800 px-1.5 py-0.5 text-[10px] text-ink-400 transition-colors hover:border-forge-500/40 hover:text-ink-100"
              >
                {starter.label}
              </button>
            ))}
          </div>
          <textarea
            autoFocus
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={8}
            placeholder="What should the agent do? Be specific about the files, the acceptance criteria, and anything it must not touch."
            className="w-full resize-none rounded-md border border-ink-600 bg-ink-900 px-2.5 py-2 font-mono text-[12px] leading-relaxed text-ink-100 placeholder-ink-500 outline-none focus:border-forge-500/60"
          />
          <div className="flex items-center gap-2 text-[10.5px] text-ink-500">
            <Icon name="info" size={11} />
            <span>
              The agent gets Read, Write, Edit, Bash, Glob, and Grep inside its own worktree.
            </span>
            <span className="flex-1" />
            <span className="tabular-nums">{prompt.length} chars</span>
          </div>
        </div>
      </div>
    </Modal>
  );
}
