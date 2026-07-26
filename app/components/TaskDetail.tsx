'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { STATUS_LABEL, STATUS_STYLE, duration, relativeTime } from '@/lib/format';
import { MODELS, type Model, type Project, type Task, type TaskEvent } from '@/lib/types';
import { ChatTranscript } from './ChatTranscript.tsx';
import { DiffView } from './DiffView.tsx';
import { Terminal } from './Terminal.tsx';
import { Icon } from './ui/icons.tsx';
import {
  Badge,
  Button,
  ConfirmDialog,
  CopyButton,
  IconButton,
  Segmented,
  useToast,
} from './ui/primitives.tsx';

type Action = 'cancel' | 'retry' | 'resume' | 'merge' | 'discard';

export type View = 'split' | 'chat' | 'terminal' | 'diff';

type Props = {
  task: Task;
  project: Project | undefined;
  events: TaskEvent[];
  /** Held by the page so the 1–4 shortcuts can drive it from anywhere. */
  view: View;
  onViewChange: (view: View) => void;
  onClose: () => void;
  onAction: (action: Action, body?: unknown) => Promise<unknown>;
};

const SPLIT_KEY = 'karkhana:split-ratio';

export function TaskDetail({ task, project, events, view, onViewChange, onClose, onAction }: Props) {
  const toast = useToast();
  const [busy, setBusy] = useState<Action | null>(null);
  const [showResume, setShowResume] = useState(false);
  const [resumePrompt, setResumePrompt] = useState('');
  const [diffKey, setDiffKey] = useState(0);
  const [confirm, setConfirm] = useState<null | 'discard'>(null);
  const [ratio, setRatio] = useState(0.55);

  const splitRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const isRunning = task.status === 'running';
  const isQueued = task.status === 'queued';
  const canReview = task.status === 'needs_review' || task.status === 'failed';
  const hasWorktree = Boolean(task.worktree_path);
  const style = STATUS_STYLE[task.status];

  useEffect(() => {
    const saved = Number(localStorage.getItem(SPLIT_KEY));
    if (saved >= 0.25 && saved <= 0.8) setRatio(saved);
  }, []);

  // Dragging the divider is a pointer-move loop on the window, not on the
  // divider itself — otherwise a fast drag outruns the 6px handle and drops.
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current || !splitRef.current) return;
      const box = splitRef.current.getBoundingClientRect();
      const next = Math.min(0.8, Math.max(0.25, (e.clientX - box.left) / box.width));
      setRatio(next);
    };
    const onUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setRatio((current) => {
        localStorage.setItem(SPLIT_KEY, String(current));
        return current;
      });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  const run = useCallback(
    async (action: Action, body?: unknown) => {
      setBusy(action);
      try {
        const result = (await onAction(action, body)) as
          | { ok?: boolean; reason?: string; conflicts?: string[]; manualCommand?: string }
          | undefined;

        if (action === 'merge') {
          if (result && result.ok === false) {
            toast.error(
              result.reason ?? 'Merge failed.',
              [
                result.conflicts?.length ? `Conflicts: ${result.conflicts.join(', ')}` : '',
                result.manualCommand ?? '',
              ]
                .filter(Boolean)
                .join('\n'),
            );
          } else {
            toast.ok(`Merged into ${project?.base_branch ?? 'the base branch'}.`);
          }
        } else if (action === 'discard') {
          toast.info('Worktree and branch removed.');
        } else if (action === 'resume') {
          toast.info('Resuming the session…');
        } else if (action === 'retry') {
          toast.info('Queued a fresh run.');
        }
        setDiffKey((k) => k + 1);
      } catch (err) {
        toast.error((err as Error).message);
      } finally {
        setBusy(null);
        setShowResume(false);
        setResumePrompt('');
      }
    },
    [onAction, project?.base_branch, toast],
  );

  const chat = <ChatTranscript task={task} events={events} live={isRunning} />;
  const terminal = (
    <Terminal
      task={task}
      events={events}
      live={isRunning}
      fullscreen={view === 'terminal'}
      onToggleFullscreen={() => onViewChange(view === 'terminal' ? 'split' : 'terminal')}
    />
  );
  const diff = hasWorktree ? (
    <DiffView taskId={task.id} refreshKey={diffKey} onOpenTerminal={() => onViewChange('terminal')} />
  ) : (
    <div className="flex h-full items-center justify-center border-l border-ink-700 px-6 text-center text-[11.5px] text-ink-500">
      {task.status === 'merged'
        ? 'Worktree removed after the merge.'
        : 'No worktree yet — it is created the moment the agent starts.'}
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-ink-900">
      {/* --- header --- */}
      <div className="shrink-0 border-b border-ink-700 bg-ink-850/80 px-3 py-2.5">
        <div className="flex items-start gap-2.5">
          <IconButton icon="chevronLeft" title="Back to board (Esc)" onClick={onClose} />

          <span
            className={`mt-1 flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10.5px] font-medium ${style.border} ${style.tint} ${style.text}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${style.dot} ${isRunning ? 'animate-live' : ''}`} />
            {STATUS_LABEL[task.status]}
          </span>

          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[14px] font-medium text-ink-50">{task.title}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10.5px] text-ink-400">
              {project && (
                <span className="flex items-center gap-1">
                  <Icon name="folder" size={11} />
                  {project.name}
                </span>
              )}
              {task.branch && (
                <span className="flex items-center gap-1 rounded border border-ink-700 bg-ink-800 px-1 text-ink-300">
                  <Icon name="branch" size={10} />
                  {task.branch}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Icon name="cpu" size={11} />
                {task.model}
              </span>
              {task.started_at && (
                <span className="flex items-center gap-1">
                  <Icon name="clock" size={11} />
                  {duration(task.started_at, task.ended_at)}
                </span>
              )}
              {task.exit_code !== null && <span>exit {task.exit_code}</span>}
              {task.ended_at && <span>{relativeTime(task.ended_at)}</span>}
              {task.session_id && (
                <span className="opacity-70">session {task.session_id.slice(0, 8)}</span>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <Segmented
              value={view}
              onChange={onViewChange}
              options={[
                { value: 'split', icon: 'board', title: 'Split: conversation and diff' },
                { value: 'chat', icon: 'chat', title: 'Conversation only' },
                { value: 'terminal', icon: 'terminal', title: 'Terminal only' },
                { value: 'diff', icon: 'diff', title: 'Diff only' },
              ]}
            />
            {task.worktree_path && (
              <CopyButton text={task.worktree_path} title="Copy worktree path" />
            )}
          </div>
        </div>

        {/* --- actions --- */}
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {(isRunning || isQueued) && (
            <Button tone="danger" icon="stop" busy={busy === 'cancel'} onClick={() => void run('cancel')}>
              Cancel
            </Button>
          )}

          {!isRunning && !isQueued && (
            <>
              <Button icon="retry" busy={busy === 'retry'} onClick={() => void run('retry')}>
                Retry
              </Button>
              {task.session_id && hasWorktree && (
                <Button
                  icon="chat"
                  onClick={() => setShowResume((v) => !v)}
                  className={showResume ? 'border-forge-500/50 text-forge-500' : ''}
                >
                  Follow up
                </Button>
              )}
            </>
          )}

          {canReview && hasWorktree && (
            <>
              <span className="mx-0.5 h-5 w-px bg-ink-700" />
              <Button
                tone="primary"
                icon="merge"
                busy={busy === 'merge'}
                onClick={() => void run('merge')}
              >
                Merge into {project?.base_branch ?? 'base'}
              </Button>
              <Button tone="danger" icon="trash" busy={busy === 'discard'} onClick={() => setConfirm('discard')}>
                Discard
              </Button>
            </>
          )}

          <span className="flex-1" />

          {!isRunning && !isQueued && (
            <span className="flex items-center gap-1.5">
              <span className="text-[10.5px] text-ink-500">retry with</span>
              <Segmented
                value={task.model}
                onChange={(model: Model) => void run('retry', { model })}
                options={MODELS.map((m) => ({ value: m, label: m, title: `Retry with ${m}` }))}
                size="xs"
              />
            </span>
          )}
        </div>

        {showResume && (
          <div className="animate-rise mt-2 rounded-lg border border-ink-600 bg-ink-800 p-2">
            <textarea
              autoFocus
              rows={2}
              value={resumePrompt}
              onChange={(e) => setResumePrompt(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  void run('resume', { prompt: resumePrompt });
                }
              }}
              placeholder="Follow-up instruction — the agent resumes its session in the same worktree. Leave blank to re-run the original prompt."
              className="w-full resize-none bg-transparent px-1 py-0.5 text-[12px] leading-relaxed text-ink-100 placeholder-ink-500 outline-none"
            />
            <div className="mt-1 flex items-center gap-2">
              <Button
                tone="primary"
                icon="send"
                busy={busy === 'resume'}
                onClick={() => void run('resume', { prompt: resumePrompt })}
              >
                Send
              </Button>
              <span className="text-[10.5px] text-ink-500">⌘↵ to send</span>
              <span className="flex-1" />
              <Button tone="ghost" onClick={() => setShowResume(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {task.error && (
          <div className="mt-2 flex items-start gap-2 rounded-md border border-danger/35 bg-danger/8 px-2.5 py-1.5 text-[11.5px] text-danger">
            <Icon name="alert" size={13} className="mt-px" />
            <p className="min-w-0 flex-1 leading-snug">{task.error}</p>
            <Badge tone="danger">{task.status}</Badge>
          </div>
        )}
      </div>

      {/* --- panes --- */}
      {view === 'chat' && <div className="min-h-0 flex-1">{chat}</div>}
      {view === 'terminal' && <div className="min-h-0 flex-1">{terminal}</div>}
      {view === 'diff' && <div className="min-h-0 flex-1">{diff}</div>}

      {view === 'split' && (
        <div ref={splitRef} className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-col" style={{ width: `${ratio * 100}%` }}>
            <div className="min-h-0 flex-1">{chat}</div>
            <div className="h-[38%] min-h-[140px] border-t border-ink-700">{terminal}</div>
          </div>

          <div
            onMouseDown={() => {
              draggingRef.current = true;
              document.body.style.cursor = 'col-resize';
              document.body.style.userSelect = 'none';
            }}
            onDoubleClick={() => setRatio(0.55)}
            title="Drag to resize · double-click to reset"
            className="group relative w-1 shrink-0 cursor-col-resize bg-ink-800 transition-colors hover:bg-forge-500/40"
          >
            <span className="absolute inset-y-0 -left-1 -right-1" />
          </div>

          <div className="min-w-0 flex-1">{diff}</div>
        </div>
      )}

      {confirm === 'discard' && (
        <ConfirmDialog
          title="Discard this worktree?"
          confirmLabel="Discard"
          body={
            <>
              <p>
                The worktree at <span className="font-mono text-ink-100">{task.worktree_path}</span>{' '}
                and the branch <span className="font-mono text-ink-100">{task.branch}</span> will be
                deleted.
              </p>
              <p className="mt-2 text-ink-400">
                Everything the agent wrote here is lost. Merge first if any of it is worth keeping.
              </p>
            </>
          }
          onConfirm={() => void run('discard')}
          onClose={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
