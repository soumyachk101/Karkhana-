'use client';

import { useState } from 'react';
import { STATUS_LABEL, STATUS_STYLE, duration } from '@/lib/format';
import { MODELS, type Model, type Project, type Task, type TaskEvent } from '@/lib/types';
import { DiffView } from './DiffView.tsx';
import { LogStream } from './LogStream.tsx';

type Props = {
  task: Task;
  project: Project | undefined;
  events: TaskEvent[];
  onClose: () => void;
  onAction: (action: 'cancel' | 'retry' | 'resume' | 'merge' | 'discard', body?: unknown) => Promise<unknown>;
};

export function TaskDetail({ task, project, events, onClose, onAction }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'error' | 'ok'; text: string; hint?: string } | null>(null);
  const [resumePrompt, setResumePrompt] = useState('');
  const [showResume, setShowResume] = useState(false);
  const [diffKey, setDiffKey] = useState(0);

  const isRunning = task.status === 'running';
  const isQueued = task.status === 'queued';
  const canReview = task.status === 'needs_review' || task.status === 'failed';
  const hasWorktree = Boolean(task.worktree_path);
  const style = STATUS_STYLE[task.status];

  const run = async (action: Parameters<Props['onAction']>[0], body?: unknown) => {
    setBusy(action);
    setNotice(null);
    try {
      const result = (await onAction(action, body)) as
        | { ok?: boolean; reason?: string; conflicts?: string[]; manualCommand?: string }
        | undefined;

      if (action === 'merge' && result && result.ok === false) {
        setNotice({
          tone: 'error',
          text: result.reason ?? 'Merge failed.',
          hint: [result.conflicts?.length ? `Conflicts: ${result.conflicts.join(', ')}` : '', result.manualCommand ?? '']
            .filter(Boolean)
            .join('\n'),
        });
      } else if (action === 'merge') {
        setNotice({ tone: 'ok', text: `Merged into ${project?.base_branch ?? 'base'}.` });
      }
      setDiffKey((k) => k + 1);
    } catch (err) {
      setNotice({ tone: 'error', text: (err as Error).message });
    } finally {
      setBusy(null);
      setShowResume(false);
      setResumePrompt('');
    }
  };

  return (
    <div className="flex h-full flex-col bg-ink-900">
      {/* header */}
      <div className="shrink-0 border-b border-ink-700 bg-ink-850 px-3 py-2">
        <div className="flex items-start gap-2">
          <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${style.dot} ${isRunning ? 'animate-live' : ''}`} />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[13px] text-ink-50">{task.title}</h2>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 font-mono text-[10px] text-ink-400">
              <span className={style.text}>{STATUS_LABEL[task.status]}</span>
              {project && <span>{project.name}</span>}
              {task.branch && <span className="text-ink-300">{task.branch}</span>}
              <span>{task.model}</span>
              {task.started_at && <span>{duration(task.started_at, task.ended_at)}</span>}
              {task.exit_code !== null && <span>exit {task.exit_code}</span>}
              {task.session_id && <span className="opacity-60">session {task.session_id.slice(0, 8)}</span>}
            </div>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded px-1.5 py-0.5 text-ink-400 hover:bg-ink-700 hover:text-ink-100"
            title="Close (Esc)"
          >
            ×
          </button>
        </div>

        {/* actions */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {(isRunning || isQueued) && (
            <ActionButton onClick={() => run('cancel')} busy={busy === 'cancel'} tone="danger">
              Cancel
            </ActionButton>
          )}

          {!isRunning && !isQueued && (
            <>
              <ActionButton onClick={() => run('retry')} busy={busy === 'retry'}>
                Retry
              </ActionButton>
              {task.session_id && hasWorktree && (
                <ActionButton onClick={() => setShowResume((v) => !v)} busy={false}>
                  Resume
                </ActionButton>
              )}
            </>
          )}

          {canReview && hasWorktree && (
            <>
              <div className="mx-1 h-4 w-px bg-ink-600" />
              <ActionButton onClick={() => run('merge')} busy={busy === 'merge'} tone="primary">
                Merge to {project?.base_branch ?? 'base'}
              </ActionButton>
              <ActionButton
                onClick={() => {
                  if (confirm('Discard this worktree and branch? The agent’s work will be lost.')) void run('discard');
                }}
                busy={busy === 'discard'}
                tone="danger"
              >
                Discard
              </ActionButton>
            </>
          )}

          <div className="flex-1" />

          {!isRunning && !isQueued && (
            <div className="flex overflow-hidden rounded border border-ink-600">
              {MODELS.map((m) => (
                <button
                  key={m}
                  onClick={() => run('retry', { model: m })}
                  disabled={busy !== null}
                  title={`Retry with ${m}`}
                  className={`px-2 py-0.5 text-[10px] capitalize disabled:opacity-40 ${
                    task.model === m ? 'bg-forge-600 text-ink-900' : 'bg-ink-900 text-ink-300 hover:bg-ink-700'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          )}
        </div>

        {showResume && (
          <div className="mt-2 flex gap-1.5">
            <input
              autoFocus
              value={resumePrompt}
              onChange={(e) => setResumePrompt(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && run('resume', { prompt: resumePrompt })}
              placeholder="Follow-up instruction (leave blank to re-run the original prompt)"
              className="flex-1 rounded border border-ink-600 bg-ink-900 px-2 py-1 text-[11px] text-ink-100 placeholder-ink-400 outline-none focus:border-forge-600"
            />
            <ActionButton onClick={() => run('resume', { prompt: resumePrompt })} busy={busy === 'resume'} tone="primary">
              Send
            </ActionButton>
          </div>
        )}

        {(notice || task.error) && (
          <div
            className={`mt-2 rounded border px-2 py-1.5 text-[11px] ${
              notice?.tone === 'ok'
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                : 'border-red-500/40 bg-red-500/10 text-red-200'
            }`}
          >
            <p className="leading-snug">{notice?.text ?? task.error}</p>
            {notice?.hint && (
              <pre className="mt-1 overflow-x-auto whitespace-pre-wrap font-mono text-[10px] text-ink-300">
                {notice.hint}
              </pre>
            )}
          </div>
        )}
      </div>

      {/* split: log | diff */}
      <div className="grid min-h-0 flex-1 grid-cols-2">
        <LogStream events={events} live={isRunning} />
        {hasWorktree ? (
          <DiffView taskId={task.id} refreshKey={diffKey} />
        ) : (
          <div className="flex items-center justify-center border-l border-ink-700 text-[11px] text-ink-500">
            {task.status === 'merged' ? 'Worktree removed after merge.' : 'No worktree.'}
          </div>
        )}
      </div>
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  busy,
  tone = 'default',
}: {
  children: React.ReactNode;
  onClick: () => void;
  busy: boolean;
  tone?: 'default' | 'primary' | 'danger';
}) {
  const tones = {
    default: 'border-ink-600 bg-ink-800 text-ink-200 hover:bg-ink-700',
    primary: 'border-forge-600 bg-forge-600 text-ink-900 hover:bg-forge-500',
    danger: 'border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20',
  };
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={`rounded border px-2 py-0.5 text-[11px] disabled:opacity-50 ${tones[tone]}`}
    >
      {busy ? '…' : children}
    </button>
  );
}
