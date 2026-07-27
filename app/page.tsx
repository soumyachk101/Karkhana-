'use client';

import { Plus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSocket } from '@/hooks/useSocket';
import type { Model, Project, ServerFrame, Task, TaskEvent } from '@/lib/types';
import { ApiKeyDialog } from './components/ApiKeyDialog.tsx';
import { CleanupPanel, type OrphanWorktree } from './components/CleanupPanel.tsx';
import { KanbanBoard } from './components/KanbanBoard.tsx';
import { NewTaskDialog } from './components/NewTaskDialog.tsx';
import { Sidebar } from './components/Sidebar.tsx';
import { TaskDetail } from './components/TaskDetail.tsx';
import { TopBar } from './components/TopBar.tsx';

async function api<T>(route: string, init?: RequestInit): Promise<T> {
  const res = await fetch(route, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  const body = await res.json();
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `${route} failed`);
  return body as T;
}

/**
 * Inserts or replaces a task by id.
 *
 * Both the WebSocket and the POST response deliver the same new task, and the
 * socket usually wins the race — so a blind prepend would show every freshly
 * dispatched task twice, once queued and once running. `replace` is true for
 * socket frames (they carry the authoritative post-write row) and false for the
 * POST response, which may already be stale by the time it lands.
 */
function upsertTask(list: Task[], task: Task, replace: boolean): Task[] {
  const index = list.findIndex((t) => t.id === task.id);
  if (index === -1) return [task, ...list];
  if (!replace) return list;
  const next = [...list];
  next[index] = task;
  return next;
}

export default function Page() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [eventsByTask, setEventsByTask] = useState<Record<string, TaskEvent[]>>({});
  const [stats, setStats] = useState({ running: 0, queued: 0, limit: 3 });
  const [binary, setBinary] = useState<{ ok: boolean; reason?: string }>({ ok: true });
  const [orphans, setOrphans] = useState<OrphanWorktree[]>([]);
  const [showCleanup, setShowCleanup] = useState(false);
  const [showNewTask, setShowNewTask] = useState(false);
  const [showApiKeys, setShowApiKeys] = useState(false);
  const [claudeEnabled, setClaudeEnabled] = useState(false);

  // Ticks once a second so running-task durations count up without needing a
  // frame from the server.
  const [, setClock] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setClock((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const onFrame = useCallback((frame: ServerFrame) => {
    if (frame.type === 'stats') {
      setStats({ running: frame.running, queued: frame.queued, limit: frame.limit });
    } else if (frame.type === 'status') {
      setTasks((prev) => upsertTask(prev, frame.task, true));
    } else if (frame.type === 'event') {
      setEventsByTask((prev) => {
        const existing = prev[frame.taskId] ?? [];
        // A reconnect replays history, so drop anything we already hold.
        if (existing.some((e) => e.id === frame.event.id)) return prev;
        return { ...prev, [frame.taskId]: [...existing, frame.event] };
      });
    }
  }, []);

  const { connected, subscribe, unsubscribe } = useSocket(onFrame);

  // --- initial load ------------------------------------------------------
  const refreshSystem = useCallback(async () => {
    const system = await api<{
      running: number;
      queued: number;
      limit: number;
      binary: { ok: boolean; reason?: string };
      config: { claudeEnabled?: boolean };
      boot: { orphanWorktrees: OrphanWorktree[] } | null;
    }>('/api/system');
    setStats({ running: system.running, queued: system.queued, limit: system.limit });
    setBinary(system.binary);
    setOrphans(system.boot?.orphanWorktrees ?? []);
    setClaudeEnabled(system.config?.claudeEnabled ?? false);
  }, []);

  useEffect(() => {
    void (async () => {
      const [{ projects }, { tasks }] = await Promise.all([
        api<{ projects: Project[] }>('/api/projects'),
        api<{ tasks: Task[] }>('/api/tasks'),
      ]);
      setProjects(projects);
      // The socket may already have delivered tasks while this fetch was in
      // flight; keep them rather than letting the slower response win.
      setTasks((prev) => prev.reduce((acc, known) => upsertTask(acc, known, false), tasks));
      await refreshSystem();
    })().catch((err) => console.error('[karkhana] initial load failed', err));
  }, [refreshSystem]);

  // --- task subscription -------------------------------------------------
  const previousTaskRef = useRef<string | null>(null);
  useEffect(() => {
    const previous = previousTaskRef.current;
    if (previous && previous !== selectedTaskId) unsubscribe(previous);
    if (selectedTaskId && previous !== selectedTaskId) {
      // Clear first: the server replays this task's full history on subscribe.
      setEventsByTask((prev) => ({ ...prev, [selectedTaskId]: [] }));
      subscribe(selectedTaskId);
    }
    previousTaskRef.current = selectedTaskId;
  }, [selectedTaskId, subscribe, unsubscribe]);

  // --- keyboard ----------------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;
      if (e.key === 'Escape') {
        setSelectedTaskId(null);
        setShowNewTask(false);
        setShowCleanup(false);
      }
      if (e.key === 'n' && !e.metaKey && !e.ctrlKey && projects.length > 0) {
        e.preventDefault();
        setShowNewTask(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [projects.length]);

  // --- actions -----------------------------------------------------------
  const addProject = async (input: { path: string; baseBranch?: string }) => {
    const { project } = await api<{ project: Project }>('/api/projects', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    setProjects((prev) => [...prev, project]);
    setSelectedProjectId(project.id);
  };

  const removeProject = async (id: string) => {
    await api(`/api/projects/${id}`, { method: 'DELETE' });
    setProjects((prev) => prev.filter((p) => p.id !== id));
    setTasks((prev) => prev.filter((t) => t.project_id !== id));
    if (selectedProjectId === id) setSelectedProjectId(null);
  };

  const createTask = async (input: { projectId: string; title: string; prompt: string; model: Model }) => {
    const { task } = await api<{ task: Task }>('/api/tasks', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    setTasks((prev) => upsertTask(prev, task, false));
    setSelectedTaskId(task.id);
  };

  const taskAction = async (
    taskId: string,
    action: 'cancel' | 'retry' | 'resume' | 'merge' | 'discard' | 'push',
    body?: unknown,
  ) => {
    const result = await api(`/api/tasks/${taskId}/${action}`, {
      method: 'POST',
      body: JSON.stringify(body ?? {}),
    });
    // Retry and resume both restart the stream; drop stale lines so the pane
    // shows the new run rather than appending to the old one.
    if (action === 'retry' || action === 'resume') {
      setEventsByTask((prev) => ({ ...prev, [taskId]: [] }));
      subscribe(taskId);
    }
    await refreshSystem();
    return result;
  };

  const removeOrphan = async (orphan: OrphanWorktree) => {
    const { orphanWorktrees } = await api<{ orphanWorktrees: OrphanWorktree[] }>('/api/system', {
      method: 'POST',
      body: JSON.stringify({
        action: 'removeOrphan',
        projectId: orphan.projectId,
        path: orphan.path,
        branch: orphan.branch,
      }),
    });
    setOrphans(orphanWorktrees);
  };

  const changeLimit = async (limit: number) => {
    await api('/api/config', { method: 'PATCH', body: JSON.stringify({ concurrency: limit }) });
    setStats((prev) => ({ ...prev, limit }));
  };

  // --- derived -----------------------------------------------------------
  const visibleTasks = useMemo(
    () => (selectedProjectId ? tasks.filter((t) => t.project_id === selectedProjectId) : tasks),
    [tasks, selectedProjectId],
  );
  const selectedTask = useMemo(() => {
    const found = tasks.find((t) => t.id === selectedTaskId) ?? null;
    if (found && selectedProjectId && found.project_id !== selectedProjectId) {
      return null;
    }
    return found;
  }, [tasks, selectedTaskId, selectedProjectId]);
  const selectedProject = projects.find((p) => p.id === (selectedProjectId ?? selectedTask?.project_id));

  return (
    <div className="flex h-full flex-col">
      <TopBar
        running={stats.running}
        queued={stats.queued}
        limit={stats.limit}
        connected={connected}
        binaryOk={binary.ok}
        binaryReason={binary.reason}
        orphanCount={orphans.length}
        onChangeLimit={changeLimit}
        onShowCleanup={() => setShowCleanup(true)}
        onShowApiKeys={() => setShowApiKeys(true)}
      />

      <div className="flex min-h-0 flex-1">
        <Sidebar
          projects={projects}
          tasks={tasks}
          selectedId={selectedProjectId}
          onSelect={(id) => {
            setSelectedProjectId(id);
            setSelectedTaskId(null);
          }}
          onAdd={addProject}
          onRemove={removeProject}
        />

        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-10 shrink-0 items-center gap-2 border-b border-ink-700/80 bg-ink-850 px-3">
            <span className="text-[12px] text-ink-200">
              {selectedProjectId ? projects.find((p) => p.id === selectedProjectId)?.name : 'All projects'}
            </span>
            <span className="tabular-nums text-[11px] text-ink-400">{visibleTasks.length} tasks</span>
            <div className="flex-1" />
            <button
              onClick={() => setShowNewTask(true)}
              disabled={projects.length === 0}
              className="flex items-center gap-1 rounded-md border border-forge-600 bg-gradient-to-b from-forge-500 to-forge-600 px-2.5 py-1.5 text-[11px] font-medium text-ink-900 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.25),0_2px_8px_-2px_rgba(217,119,6,0.5)] outline-none transition hover:from-forge-400 hover:to-forge-500 focus-visible:ring-2 focus-visible:ring-forge-400/70 active:scale-[0.97] disabled:opacity-40 disabled:active:scale-100"
              title="New task (n)"
            >
              <Plus className="h-3 w-3" strokeWidth={2.5} />
              New task
            </button>
          </div>

          {selectedTask ? (
            <div className="min-h-0 flex-1">
              <TaskDetail
                task={selectedTask}
                project={selectedProject}
                events={eventsByTask[selectedTask.id] ?? []}
                onClose={() => setSelectedTaskId(null)}
                onAction={(action, body) => taskAction(selectedTask.id, action, body)}
              />
            </div>
          ) : (
            <div className="min-h-0 flex-1">
              <KanbanBoard
                tasks={visibleTasks}
                projects={projects}
                showProject={selectedProjectId === null}
                selectedTaskId={selectedTaskId}
                onSelectTask={setSelectedTaskId}
              />
            </div>
          )}
        </main>
      </div>

      {showNewTask && (
        <NewTaskDialog
          projects={projects}
          defaultProjectId={selectedProjectId}
          claudeEnabled={claudeEnabled}
          onClose={() => setShowNewTask(false)}
          onCreate={createTask}
        />
      )}

      {showCleanup && (
        <CleanupPanel orphans={orphans} onClose={() => setShowCleanup(false)} onRemove={removeOrphan} />
      )}

      {showApiKeys && (
        <ApiKeyDialog
          onClose={() => setShowApiKeys(false)}
          onSave={async (keys) => {
            await api('/api/config', { method: 'PATCH', body: JSON.stringify(keys) });
            await refreshSystem();
          }}
        />
      )}
    </div>
  );
}
