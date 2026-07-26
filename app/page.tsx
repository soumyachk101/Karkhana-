'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSocket } from '@/hooks/useSocket';
import { applyTheme, readTheme, type Theme } from '@/lib/theme';
import type { Model, Project, ServerFrame, Task, TaskEvent, TaskStatus } from '@/lib/types';
import { CleanupPanel, type OrphanWorktree } from './components/CleanupPanel.tsx';
import { CommandPalette, type PaletteAction } from './components/CommandPalette.tsx';
import { KanbanBoard } from './components/KanbanBoard.tsx';
import { NewTaskDialog } from './components/NewTaskDialog.tsx';
import { ShortcutsOverlay } from './components/ShortcutsOverlay.tsx';
import { Sidebar } from './components/Sidebar.tsx';
import { TaskDetail } from './components/TaskDetail.tsx';
import { TopBar } from './components/TopBar.tsx';
import { Icon } from './components/ui/icons.tsx';
import { Button, Segmented, ToastProvider, useToast } from './components/ui/primitives.tsx';

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

type StatusGroup = 'all' | 'active' | 'review' | 'done' | 'issues';

const GROUP_MEMBERS: Record<StatusGroup, TaskStatus[] | null> = {
  all: null,
  active: ['queued', 'running'],
  review: ['needs_review'],
  done: ['merged'],
  issues: ['failed', 'cancelled'],
};

export default function Page() {
  return (
    <ToastProvider>
      <Dashboard />
    </ToastProvider>
  );
}

function Dashboard() {
  const toast = useToast();

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
  const [showPalette, setShowPalette] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);

  const [theme, setTheme] = useState<Theme>('dark');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [layout, setLayout] = useState<'board' | 'list'>('board');
  const [group, setGroup] = useState<StatusGroup>('all');
  const [search, setSearch] = useState('');
  const [detailView, setDetailView] = useState<'split' | 'chat' | 'terminal' | 'diff'>('split');

  const searchRef = useRef<HTMLInputElement>(null);

  // Every overlay closes itself on Escape, and they all listen on `window` —
  // where stopPropagation does nothing between sibling listeners. Without this
  // flag, closing a dialog would also drop you out of the task you were in.
  const overlayOpenRef = useRef(false);
  overlayOpenRef.current = showNewTask || showCleanup || showShortcuts || showPalette;

  useEffect(() => setTheme(readTheme()), []);

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
      boot: { orphanWorktrees: OrphanWorktree[] } | null;
    }>('/api/system');
    setStats({ running: system.running, queued: system.queued, limit: system.limit });
    setBinary(system.binary);
    setOrphans(system.boot?.orphanWorktrees ?? []);
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

  // --- actions -----------------------------------------------------------
  const toggleTheme = useCallback(() => {
    setTheme((current) => {
      const next: Theme = current === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      return next;
    });
  }, []);

  const addProject = async (input: { path: string; baseBranch?: string }) => {
    const { project } = await api<{ project: Project }>('/api/projects', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    setProjects((prev) => [...prev, project]);
    setSelectedProjectId(project.id);
    toast.ok(`Added ${project.name}`, `base branch ${project.base_branch}`);
  };

  const removeProject = async (id: string) => {
    const name = projects.find((p) => p.id === id)?.name ?? 'project';
    try {
      await api(`/api/projects/${id}`, { method: 'DELETE' });
      setProjects((prev) => prev.filter((p) => p.id !== id));
      setTasks((prev) => prev.filter((t) => t.project_id !== id));
      if (selectedProjectId === id) setSelectedProjectId(null);
      toast.info(`Removed ${name}`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const createTask = async (input: { projectId: string; title: string; prompt: string; model: Model }) => {
    const { task } = await api<{ task: Task }>('/api/tasks', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    setTasks((prev) => upsertTask(prev, task, false));
    setSelectedTaskId(task.id);
    toast.ok('Agent dispatched', `${task.model} · ${task.title}`);
  };

  const taskAction = async (
    taskId: string,
    action: 'cancel' | 'retry' | 'resume' | 'merge' | 'discard',
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
    toast.info('Worktree removed', orphan.path);
  };

  const changeLimit = async (limit: number) => {
    await api('/api/config', { method: 'PATCH', body: JSON.stringify({ concurrency: limit }) });
    setStats((prev) => ({ ...prev, limit }));
    toast.info(`Concurrency limit set to ${limit}`);
  };

  // --- derived -----------------------------------------------------------
  const visibleTasks = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const members = GROUP_MEMBERS[group];
    return tasks.filter((task) => {
      if (selectedProjectId && task.project_id !== selectedProjectId) return false;
      if (members && !members.includes(task.status)) return false;
      if (!needle) return true;
      return `${task.title} ${task.prompt} ${task.branch ?? ''}`.toLowerCase().includes(needle);
    });
  }, [tasks, selectedProjectId, group, search]);

  const selectedTask = tasks.find((t) => t.id === selectedTaskId) ?? null;
  const selectedProject = projects.find((p) => p.id === selectedTask?.project_id);
  const projectTasks = selectedProjectId
    ? tasks.filter((t) => t.project_id === selectedProjectId)
    : tasks;

  const paletteActions = useMemo<PaletteAction[]>(
    () => [
      {
        id: 'new-task',
        label: 'New task — dispatch an agent',
        icon: 'sparkles',
        hint: 'N',
        run: () => setShowNewTask(true),
      },
      { id: 'board', label: 'Switch to board layout', icon: 'board', hint: 'B', run: () => setLayout('board') },
      { id: 'list', label: 'Switch to list layout', icon: 'list', hint: 'L', run: () => setLayout('list') },
      { id: 'theme', label: 'Toggle light / dark theme', icon: 'moon', hint: 'T', run: toggleTheme },
      {
        id: 'sidebar',
        label: 'Toggle the sidebar',
        icon: 'sidebar',
        hint: '⌘B',
        run: () => setSidebarCollapsed((v) => !v),
      },
      {
        id: 'all-projects',
        label: 'Show tasks from every project',
        icon: 'layers',
        run: () => setSelectedProjectId(null),
      },
      {
        id: 'cleanup',
        label: `Orphaned worktrees (${orphans.length})`,
        icon: 'alert',
        run: () => setShowCleanup(true),
      },
      { id: 'shortcuts', label: 'Keyboard shortcuts', icon: 'keyboard', hint: '?', run: () => setShowShortcuts(true) },
    ],
    [orphans.length, toggleTheme],
  );

  // --- keyboard ----------------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT' ||
        target?.isContentEditable;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowPalette((v) => !v);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setSidebarCollapsed((v) => !v);
        return;
      }
      if (e.key === 'Escape') {
        if (overlayOpenRef.current) {
          setShowNewTask(false);
          setShowCleanup(false);
          setShowShortcuts(false);
          setShowPalette(false);
        } else if (!typing) {
          setSelectedTaskId(null);
        }
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key) {
        case 'n':
          if (projects.length > 0) {
            e.preventDefault();
            setShowNewTask(true);
          }
          break;
        case '/':
          e.preventDefault();
          searchRef.current?.focus();
          break;
        case '?':
          e.preventDefault();
          setShowShortcuts(true);
          break;
        case 't':
          toggleTheme();
          break;
        case 'b':
          if (!selectedTaskId) setLayout('board');
          break;
        case 'l':
          if (!selectedTaskId) setLayout('list');
          break;
        case '1':
          if (selectedTaskId) setDetailView('split');
          break;
        case '2':
          if (selectedTaskId) setDetailView('chat');
          break;
        case '3':
          if (selectedTaskId) setDetailView('terminal');
          break;
        case '4':
          if (selectedTaskId) setDetailView('diff');
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [projects.length, selectedTaskId, toggleTheme]);

  const activeCount = projectTasks.filter(
    (t) => t.status === 'running' || t.status === 'queued',
  ).length;

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
        theme={theme}
        onToggleTheme={toggleTheme}
        onChangeLimit={changeLimit}
        onShowCleanup={() => setShowCleanup(true)}
        onOpenPalette={() => setShowPalette(true)}
      />

      <div className="flex min-h-0 flex-1">
        <Sidebar
          projects={projects}
          tasks={tasks}
          selectedId={selectedProjectId}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={() => setSidebarCollapsed((v) => !v)}
          onSelect={(id) => {
            setSelectedProjectId(id);
            setSelectedTaskId(null);
          }}
          onAdd={addProject}
          onRemove={removeProject}
          onShowShortcuts={() => setShowShortcuts(true)}
        />

        <main className="flex min-w-0 flex-1 flex-col">
          {selectedTask ? (
            <div className="min-h-0 flex-1">
              <TaskDetail
                task={selectedTask}
                project={selectedProject}
                events={eventsByTask[selectedTask.id] ?? []}
                view={detailView}
                onViewChange={setDetailView}
                onClose={() => setSelectedTaskId(null)}
                onAction={(action, body) => taskAction(selectedTask.id, action, body)}
              />
            </div>
          ) : (
            <>
              <div className="flex h-11 shrink-0 items-center gap-2 border-b border-ink-700 bg-ink-850/60 px-3">
                <div className="flex min-w-0 items-baseline gap-2">
                  <span className="truncate text-[13px] font-medium text-ink-50">
                    {selectedProjectId
                      ? (projects.find((p) => p.id === selectedProjectId)?.name ?? 'Project')
                      : 'All projects'}
                  </span>
                  <span className="shrink-0 text-[11px] text-ink-400 tabular-nums">
                    {visibleTasks.length} of {projectTasks.length}
                  </span>
                  {activeCount > 0 && (
                    <span className="flex shrink-0 items-center gap-1 text-[11px] text-forge-500">
                      <span className="animate-live h-1.5 w-1.5 rounded-full bg-forge-500" />
                      {activeCount} active
                    </span>
                  )}
                </div>

                <div className="flex-1" />

                <div className="flex items-center gap-1.5 rounded-md border border-ink-700 bg-ink-850 px-2 py-1">
                  <Icon name="search" size={12} className="text-ink-500" />
                  <input
                    ref={searchRef}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => e.key === 'Escape' && (setSearch(''), e.currentTarget.blur())}
                    placeholder="Filter tasks  /"
                    className="w-40 bg-transparent text-[11.5px] text-ink-100 placeholder-ink-500 outline-none focus:w-56"
                  />
                  {search && (
                    <button
                      onClick={() => setSearch('')}
                      className="text-ink-500 hover:text-ink-100"
                      aria-label="Clear search"
                    >
                      <Icon name="close" size={11} />
                    </button>
                  )}
                </div>

                <Segmented
                  value={group}
                  onChange={setGroup}
                  options={[
                    { value: 'all', label: 'All' },
                    { value: 'active', label: 'Active' },
                    { value: 'review', label: 'Review' },
                    { value: 'done', label: 'Merged' },
                    { value: 'issues', label: 'Issues' },
                  ]}
                />

                <Segmented
                  value={layout}
                  onChange={setLayout}
                  options={[
                    { value: 'board', icon: 'board', title: 'Board layout (B)' },
                    { value: 'list', icon: 'list', title: 'List layout (L)' },
                  ]}
                />

                <Button
                  tone="primary"
                  icon="plus"
                  disabled={projects.length === 0}
                  title="New task (N)"
                  onClick={() => setShowNewTask(true)}
                >
                  New task
                </Button>
              </div>

              <div className="min-h-0 flex-1">
                <KanbanBoard
                  tasks={visibleTasks}
                  projects={projects}
                  showProject={selectedProjectId === null}
                  selectedTaskId={selectedTaskId}
                  onSelectTask={setSelectedTaskId}
                  layout={layout}
                  onNewTask={() => setShowNewTask(true)}
                  emptyReason={
                    projects.length === 0
                      ? 'no-projects'
                      : projectTasks.length === 0
                        ? 'no-tasks'
                        : 'no-matches'
                  }
                />
              </div>
            </>
          )}
        </main>
      </div>

      {showNewTask && (
        <NewTaskDialog
          projects={projects}
          defaultProjectId={selectedProjectId}
          onClose={() => setShowNewTask(false)}
          onCreate={createTask}
        />
      )}

      {showCleanup && (
        <CleanupPanel orphans={orphans} onClose={() => setShowCleanup(false)} onRemove={removeOrphan} />
      )}

      {showShortcuts && <ShortcutsOverlay onClose={() => setShowShortcuts(false)} />}

      {showPalette && (
        <CommandPalette
          tasks={tasks}
          projects={projects}
          actions={paletteActions}
          onSelectTask={setSelectedTaskId}
          onSelectProject={(id) => {
            setSelectedProjectId(id);
            setSelectedTaskId(null);
          }}
          onClose={() => setShowPalette(false)}
        />
      )}
    </div>
  );
}
