'use client';

import { Code2, GitMerge, LayoutGrid, MessageSquare, Play, RotateCcw, Terminal, Trash2, Upload, X, XCircle } from 'lucide-react';
import { useState } from 'react';
import { STATUS_LABEL, STATUS_STYLE, duration } from '@/lib/format';
import { MODELS, type Model, type Project, type Task, type TaskEvent } from '@/lib/types';
import { ClaudeChatView } from './ClaudeChatView.tsx';
import { DiffView } from './DiffView.tsx';
import { LogStream } from './LogStream.tsx';

type Props = {
  task: Task;
  project: Project | undefined;
  events: TaskEvent[];
  onClose: () => void;
  onAction: (action: 'cancel' | 'retry' | 'resume' | 'merge' | 'discard' | 'push', body?: unknown) => Promise<unknown>;
};

export function TaskDetail({ task, project, events, onClose, onAction }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'error' | 'ok'; text: string; hint?: string } | null>(null);
  const [resumePrompt, setResumePrompt] = useState('');
  const [showResume, setShowResume] = useState(false);
  const [diffKey, setDiffKey] = useState(0);
  const [viewMode, setViewMode] = useState<'chat' | 'split' | 'logs' | 'diff'>('chat');

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
        | { ok?: boolean; reason?: string; conflicts?: string[]; manualCommand?: string; remote?: string; branch?: string }
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
      } else if (action === 'push' && result && result.ok === false) {
        setNotice({ tone: 'error', text: result.reason ?? 'Push failed.' });
      } else if (action === 'push') {
        setNotice({ tone: 'ok', text: `Pushed ${result?.branch ?? 'base'} to ${result?.remote ?? 'origin'}.` });
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
          <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${style.dot} ${isRunning ? 'animate-live animate-ember' : ''}`} />
          <div className="min-w-0 flex-1">
            <h2 className="font-display truncate text-[14px] font-medium tracking-tight text-ink-50">{task.title}</h2>
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
            className="shrink-0 rounded p-1 text-ink-400 outline-none transition-colors hover:bg-ink-700 hover:text-ink-100 focus-visible:ring-2 focus-visible:ring-forge-500/60"
            title="Close (Esc)"
          >
            <X className="h-3.5 w-3.5" strokeWidth={2.25} />
          </button>
        </div>

        {/* actions & view toggle toolbar */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {/* View Mode Toggle */}
          <div className="flex overflow-hidden rounded border border-ink-600 bg-ink-900 p-0.5 text-[11px]">
            <button
              onClick={() => setViewMode('chat')}
              className={`flex items-center gap-1 rounded px-2 py-0.5 transition ${
                viewMode === 'chat' ? 'bg-forge-500 text-ink-900 font-semibold shadow' : 'text-ink-300 hover:text-ink-100'
              }`}
              title="Claude Code Chat Interface"
            >
              <MessageSquare className="h-3 w-3" />
              Claude Chat
            </button>
            <button
              onClick={() => setViewMode('split')}
              className={`flex items-center gap-1 rounded px-2 py-0.5 transition ${
                viewMode === 'split' ? 'bg-forge-500 text-ink-900 font-semibold shadow' : 'text-ink-300 hover:text-ink-100'
              }`}
              title="Split Chat & Diff View"
            >
              <LayoutGrid className="h-3 w-3" />
              Split
            </button>
            <button
              onClick={() => setViewMode('diff')}
              className={`flex items-center gap-1 rounded px-2 py-0.5 transition ${
                viewMode === 'diff' ? 'bg-forge-500 text-ink-900 font-semibold shadow' : 'text-ink-300 hover:text-ink-100'
              }`}
              title="Code Diff Inspector"
            >
              <Code2 className="h-3 w-3" />
              Diff Only
            </button>
            <button
              onClick={() => setViewMode('logs')}
              className={`flex items-center gap-1 rounded px-2 py-0.5 transition ${
                viewMode === 'logs' ? 'bg-forge-500 text-ink-900 font-semibold shadow' : 'text-ink-300 hover:text-ink-100'
              }`}
              title="Raw Stream Terminal Logs"
            >
              <Terminal className="h-3 w-3" />
              Logs
            </button>
          </div>

          <div className="mx-1 h-4 w-px bg-ink-700" />

          {(isRunning || isQueued) && (
            <ActionButton onClick={() => run('cancel')} busy={busy === 'cancel'} tone="danger" icon={XCircle}>
              Cancel
            </ActionButton>
          )}

          {!isRunning && !isQueued && (
            <>
              <ActionButton onClick={() => run('retry')} busy={busy === 'retry'} icon={RotateCcw}>
                Retry
              </ActionButton>
              {task.session_id && hasWorktree && (
                <ActionButton onClick={() => setShowResume((v) => !v)} busy={false} icon={Play}>
                  Resume
                </ActionButton>
              )}
            </>
          )}

          {canReview && hasWorktree && (
            <>
              <div className="mx-1 h-4 w-px bg-ink-600" />
              <ActionButton onClick={() => run('merge')} busy={busy === 'merge'} tone="primary" icon={GitMerge}>
                Merge to {project?.base_branch ?? 'base'}
              </ActionButton>
              <ActionButton
                onClick={() => {
                  if (confirm('Discard this worktree and branch? The agent’s work will be lost.')) void run('discard');
                }}
                busy={busy === 'discard'}
                tone="danger"
                icon={Trash2}
              >
                Discard
              </ActionButton>
            </>
          )}

          {task.status === 'merged' && (
            <>
              <div className="mx-1 h-4 w-px bg-ink-600" />
              <ActionButton
                onClick={() => {
                  if (confirm(`Push ${project?.base_branch ?? 'base'} to origin? This touches the remote repo.`)) {
                    void run('push');
                  }
                }}
                busy={busy === 'push'}
                tone="primary"
                icon={Upload}
              >
                Push to origin
              </ActionButton>
            </>
          )}

          <div className="flex-1" />

          {!isRunning && !isQueued && (
            <select
              value={task.model}
              onChange={(e) => run('retry', { model: e.target.value })}
              disabled={busy !== null}
              className="rounded border border-ink-600 bg-ink-900 px-2 py-0.5 text-[11px] font-medium text-forge-400 outline-none focus:border-forge-600 focus-visible:ring-2 focus-visible:ring-forge-500/50 disabled:opacity-40"
              title="Retry task with selected model"
            >
              <optgroup label="Claude Code Agents">
                <option value="sonnet">Claude Sonnet</option>
                <option value="opus">Claude Opus</option>
                <option value="haiku">Claude Haiku</option>
              </optgroup>
              <optgroup label="Antigravity Agents">
                <option value="antigravity-flash">Antigravity Flash</option>
                <option value="antigravity-pro">Antigravity Pro</option>
              </optgroup>
              <optgroup label="Codex / OpenAI Agents">
                <option value="codex-gpt4o">Codex GPT-4o</option>
                <option value="codex-o3-mini">Codex o3-mini</option>
              </optgroup>
            </select>
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
              className="flex-1 rounded border border-ink-600 bg-ink-900 px-2 py-1 text-[11px] text-ink-100 placeholder-ink-400 outline-none focus:border-forge-600 focus-visible:ring-2 focus-visible:ring-forge-500/50"
            />
            <ActionButton onClick={() => run('resume', { prompt: resumePrompt })} busy={busy === 'resume'} tone="primary">
              Send
            </ActionButton>
          </div>
        )}

        {(notice || task.error) && (
          <div
            className={`animate-rise mt-2 rounded border px-2.5 py-2 text-[11px] ${
              notice?.tone === 'ok'
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                : 'border-red-500/40 bg-red-500/10 text-red-200'
            }`}
          >
            <p className="leading-snug font-medium">{notice?.text ?? task.error}</p>

            {/* Quick 1-click agent fallback buttons */}
            {!isRunning && !isQueued && (
              <div className="mt-2 rounded bg-ink-950/80 p-2 border border-ink-700/80">
                <div className="text-[10px] text-ink-300 font-mono mb-1.5 flex items-center justify-between">
                  <span>⚡ Quick Switch Agent Runner (Fallback to Antigravity / Codex):</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => run('retry', { model: 'antigravity-flash' })}
                    disabled={busy !== null}
                    className="flex items-center gap-1 rounded bg-amber-500/20 px-2 py-1 font-mono text-[10px] font-semibold text-amber-300 hover:bg-amber-500/30 border border-amber-500/30 transition"
                  >
                    🚀 Retry with Antigravity (Flash)
                  </button>
                  <button
                    onClick={() => run('retry', { model: 'antigravity-pro' })}
                    disabled={busy !== null}
                    className="flex items-center gap-1 rounded bg-purple-500/20 px-2 py-1 font-mono text-[10px] font-semibold text-purple-300 hover:bg-purple-500/30 border border-purple-500/30 transition"
                  >
                    ✨ Retry with Antigravity (Pro)
                  </button>
                  <button
                    onClick={() => run('retry', { model: 'codex-gpt4o' })}
                    disabled={busy !== null}
                    className="flex items-center gap-1 rounded bg-sky-500/20 px-2 py-1 font-mono text-[10px] font-semibold text-sky-300 hover:bg-sky-500/30 border border-sky-500/30 transition"
                  >
                    🤖 Retry with Codex (GPT-4o)
                  </button>
                </div>
              </div>
            )}

            {notice?.hint && (
              <pre className="mt-1 overflow-x-auto whitespace-pre-wrap font-mono text-[10px] text-ink-300">
                {notice.hint}
              </pre>
            )}
          </div>
        )}
      </div>

      {/* Main View Area */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {viewMode === 'chat' && (
          <ClaudeChatView
            task={task}
            events={events}
            live={isRunning}
            onSendFollowUp={task.session_id && hasWorktree ? (prompt) => run('resume', { prompt }) : undefined}
          />
        )}

        {viewMode === 'split' && (
          <div className="grid h-full grid-cols-2 overflow-hidden">
            <ClaudeChatView
              task={task}
              events={events}
              live={isRunning}
              onSendFollowUp={task.session_id && hasWorktree ? (prompt) => run('resume', { prompt }) : undefined}
            />
            {hasWorktree ? (
              <DiffView taskId={task.id} refreshKey={diffKey} />
            ) : (
              <div className="flex items-center justify-center border-l border-ink-700 text-[11px] text-ink-500">
                {task.status === 'merged' ? 'Worktree removed after merge.' : 'No worktree.'}
              </div>
            )}
          </div>
        )}

        {viewMode === 'logs' && <LogStream events={events} live={isRunning} />}

        {viewMode === 'diff' && (
          <div className="h-full overflow-hidden">
            {hasWorktree ? (
              <DiffView taskId={task.id} refreshKey={diffKey} />
            ) : (
              <div className="flex h-full items-center justify-center text-[11px] text-ink-500">
                {task.status === 'merged' ? 'Worktree removed after merge.' : 'No worktree.'}
              </div>
            )}
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
  icon: Icon,
}: {
  children: React.ReactNode;
  onClick: () => void;
  busy: boolean;
  tone?: 'default' | 'primary' | 'danger';
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}) {
  const tones = {
    default:
      'border-ink-600 bg-gradient-to-b from-ink-700 to-ink-800 text-ink-200 hover:from-ink-600 hover:to-ink-700 focus-visible:ring-forge-500/60',
    primary:
      'border-forge-600 bg-gradient-to-b from-forge-500 to-forge-600 text-ink-900 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.25),0_2px_8px_-2px_rgba(217,119,6,0.5)] hover:from-forge-400 hover:to-forge-500 focus-visible:ring-forge-400/70',
    danger:
      'border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20 focus-visible:ring-red-400/60',
  };
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium outline-none transition focus-visible:ring-2 active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100 ${tones[tone]}`}
    >
      {busy ? '…' : (
        <>
          {Icon && <Icon className="h-3 w-3" strokeWidth={2.25} />}
          {children}
        </>
      )}
    </button>
  );
}
