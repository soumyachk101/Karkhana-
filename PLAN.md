# Karkhana — Build Plan

Local-first web dashboard for orchestrating multiple headless Claude Code agents
in parallel, including several agents on the same repo via isolated git worktrees.

Status: **plan for review — no code written yet.**

---

## 1. Stack decisions (and the one deviation I need to flag)

| Layer | Choice | Notes |
|---|---|---|
| UI | Next.js 15 App Router + Tailwind v4 | as specified |
| Server | **Custom Node server (`server/index.mjs`) wrapping Next** | see deviation below |
| Realtime | `ws`, mounted on the same HTTP server at `/ws` | as specified |
| DB | `better-sqlite3` | as specified, WAL mode |
| Process | `child_process.spawn` + line-delimited JSON parser | as specified |

### Deviation: custom server instead of plain `next dev`

`next dev` / `next start` own the HTTP server, so there is no supported hook to
attach a `ws` upgrade handler, and route handlers get torn down between requests —
which is fatal for a long-lived process supervisor holding `ChildProcess` handles.

So: `server/index.mjs` creates the `http.Server`, mounts the `ws` server on
`upgrade`, boots the orchestrator singleton, and hands everything else to Next's
request handler. One process, one port (`3000`), everything shares memory.

Consequences you should know about:
- `next dev --turbo` is off; we run Next in dev mode through the custom server.
  Fast Refresh for React still works.
- `better-sqlite3` is a native module → `serverExternalPackages: ['better-sqlite3']`
  in `next.config.mjs` so Next never tries to bundle it.
- Dev HMR re-evaluates modules, so DB + orchestrator singletons are cached on
  `globalThis` to avoid duplicate queues or duplicate SQLite handles.

The alternative — a separate backend process on `:3001` — means IPC between the
API routes and the supervisor, plus two things to start. Not worth it for
localhost-only v1. Say the word if you'd rather have the split.

Everything else is exactly as you specified.

---

## 2. File structure

```
karkhana/
├── PLAN.md
├── CLAUDE.md                       # architecture doc, written as we go (milestone 2+)
├── package.json
├── next.config.mjs                 # serverExternalPackages: ['better-sqlite3']
├── tailwind.config.ts
├── karkhana.config.json            # gitignored; created on first run
│
├── server/
│   └── index.mjs                   # http + Next handler + ws upgrade + boot()
│
├── lib/
│   ├── config.ts                   # claudeBinPath, concurrency, worktreeRoot, dbPath
│   ├── db.ts                       # better-sqlite3 singleton, PRAGMA, migrate()
│   ├── schema.sql                  # DDL (section 3)
│   ├── repo/
│   │   ├── projects.ts             # CRUD + validate path is a git repo
│   │   ├── tasks.ts                # CRUD + status transitions
│   │   └── events.ts               # append + paged read
│   ├── git.ts                      # thin promisified `git` exec helper
│   ├── worktree.ts                 # create / diff / commit / merge / remove / reconcile
│   ├── agent/
│   │   ├── runner.ts               # spawn claude, parse stream-json, persist, emit
│   │   ├── streamParser.ts         # NDJSON line splitter, tolerant of partial chunks
│   │   └── orchestrator.ts         # queue, concurrency gate, cancel, retry, resume
│   └── bus.ts                      # EventEmitter → WebSocket fanout
│
├── app/
│   ├── layout.tsx  globals.css
│   ├── page.tsx                    # shell: sidebar + kanban + topbar
│   ├── api/
│   │   ├── projects/route.ts                 # GET, POST
│   │   ├── projects/[id]/route.ts            # GET, DELETE
│   │   ├── tasks/route.ts                    # GET (?projectId), POST (enqueue)
│   │   ├── tasks/[id]/route.ts               # GET (task + events)
│   │   ├── tasks/[id]/cancel/route.ts        # POST
│   │   ├── tasks/[id]/retry/route.ts         # POST  (fresh worktree)
│   │   ├── tasks/[id]/resume/route.ts        # POST  (--resume session_id)
│   │   ├── tasks/[id]/diff/route.ts          # GET   (git diff of worktree)
│   │   ├── tasks/[id]/merge/route.ts         # POST
│   │   ├── tasks/[id]/discard/route.ts       # POST
│   │   └── config/route.ts                   # GET, PATCH (binary path, concurrency)
│   └── components/
│       ├── Sidebar.tsx  TopBar.tsx
│       ├── KanbanBoard.tsx  TaskCard.tsx  NewTaskDialog.tsx
│       ├── TaskDetail.tsx                    # split view container
│       ├── LogStream.tsx                     # renders parsed stream-json events
│       ├── DiffView.tsx
│       └── ReviewPanel.tsx
│
└── hooks/
    ├── useSocket.ts                # single ws connection, auto-reconnect
    └── useTasks.ts                 # task list state + live status patches
```

---

## 3. Data model

Exactly your spec, plus the minimum extra columns the lifecycle needs
(marked ⁺ — tell me to drop any you don't want).

```sql
CREATE TABLE projects (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  path        TEXT NOT NULL UNIQUE,
  base_branch TEXT NOT NULL DEFAULT 'main',
  created_at  INTEGER NOT NULL              -- ⁺
);

CREATE TABLE tasks (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  prompt        TEXT NOT NULL,
  status        TEXT NOT NULL,              -- queued|running|needs_review|merged|failed|cancelled
  worktree_path TEXT,
  branch        TEXT,
  session_id    TEXT,
  model         TEXT NOT NULL DEFAULT 'sonnet',
  created_at    INTEGER NOT NULL,
  started_at    INTEGER,                    -- ⁺
  ended_at      INTEGER,                    -- ⁺
  pid           INTEGER,                    -- ⁺ crash reconciliation on restart
  exit_code     INTEGER,                    -- ⁺
  error         TEXT                        -- ⁺ surfaced on the failed card
);

CREATE TABLE events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id      TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  type         TEXT NOT NULL,               -- system|assistant|user|result|stderr|lifecycle
  payload_json TEXT NOT NULL,
  ts           INTEGER NOT NULL
);
CREATE INDEX idx_events_task ON events(task_id, id);
CREATE INDEX idx_tasks_project_status ON tasks(project_id, status);
```

**Status transitions**

```
queued ──▶ running ──▶ needs_review ──▶ merged
             │              │  ▲            
             │              │  └── resume ──┘ (back to running)
             ├──▶ failed ───┘ (retry → queued)
             └──▶ cancelled
```
`needs_review` is entered on clean exit (`result` event, exit 0). `failed` on
non-zero exit, spawn error, or `result.is_error`. `discard` from
`needs_review`/`failed` removes the worktree + branch and marks `cancelled`.

---

## 4. Agent invocation

```
<claudeBinPath> -p "<prompt>"
  --output-format stream-json
  --verbose
  --allowedTools "Read,Write,Edit,Bash,Glob,Grep"
  --model <haiku|sonnet|opus>
  [--resume <session_id>]          # resume only
cwd: <worktree_path>
```

- stdout is NDJSON. `streamParser.ts` buffers partial chunks and emits one object
  per complete line; unparseable lines are stored as `type:'stderr'` rather than
  crashing the runner.
- `session_id` is lifted from the first `system`/`init` event and written to
  `tasks.session_id` immediately (so a mid-run crash is still resumable).
- Every parsed event → `events` row → `bus.emit(taskId, event)` → WebSocket.
- stderr is captured line-wise into `events` as `type:'stderr'`.
- Non-interactive `-p` with `--allowedTools` will *deny* anything outside the
  list rather than prompting, so the agent can't hang waiting for input.

---

## 5. Isolation model

For task `t_abc` on project at `/home/you/proj` with base `main`:

```
git -C /home/you/proj worktree add /home/you/.karkhana/t_abc -b karkhana/t_abc main
```

- Worktree root defaults to `<project.path>/../.karkhana/` per your spec, and is
  overridable in `karkhana.config.json`. It lives outside the repo, so nothing
  pollutes the main tree or its `.gitignore`.
- Task IDs are unique across projects, so a shared parent dir is safe.
- The main working tree is **never** an agent cwd — `runner.ts` asserts
  `cwd !== project.path` before spawning and refuses otherwise.
- Two agents on the same repo get two worktrees, two branches, zero shared state.
  (They do share the repo's `.git/objects` — that's git's own concurrency-safe
  path, not a conflict.)

### Merge — the one thing I want your call on

`git merge` needs `base_branch` checked out somewhere, and git refuses to check
out the same branch in two worktrees. The options:

- **(A) Merge in the main tree** — require it to be clean and on `base_branch`,
  then `git -C <repo> merge --no-ff karkhana/<taskId>`. Simple and does what you'd
  do by hand. But it touches the main working tree, which brushes against your
  "never run agents against the main working tree" constraint (this isn't an
  agent, it's a merge, but it's still a write).
- **(B) Never touch the main tree** — only fast-forward, by moving the ref
  directly with `git update-ref` when `base_branch` is an ancestor of the task
  branch. Safe and invisible, but fails on any divergence, which will be common
  once two tasks land.

**My recommendation: A**, with a hard precondition check (clean tree + on base
branch), and a clear error in the review panel with the exact manual command when
the precondition fails. Conflicts leave the merge in progress and mark the task
`needs_review` with the conflict list. Tell me if you'd rather have B.

Before merging, uncommitted worktree changes are auto-committed as
`karkhana: <task title>` — agents usually leave work uncommitted.

---

## 6. Crash & restart handling

`boot()` in `server/index.mjs`, before serving:

1. **Zombie tasks** — every task in `running`: if `pid` is absent or
   `process.kill(pid, 0)` throws, mark `failed` with `error: 'orphaned by
   restart'`. (We do not adopt a surviving child — it lost its stdout pipe.)
2. **Orphaned worktrees** — `git worktree list --porcelain` per project; any
   `karkhana/*` worktree with no matching live task is listed in a "Cleanup"
   section in the top bar for one-click prune. Never auto-deleted — it may hold
   unmerged work.
3. **Stale worktree dirs** — `git worktree prune` for paths that vanished from disk.
4. Requeue: `queued` tasks are re-enqueued in `created_at` order.

Runtime: spawn `error` → `failed`; non-zero exit → `failed` with `exit_code`;
cancel → `SIGTERM`, then `SIGKILL` after 5s → `cancelled`, worktree kept for
inspection.

---

## 7. WebSocket protocol

Single connection, `ws://localhost:3000/ws`.

```jsonc
// client → server
{ "type": "subscribe",   "taskId": "t_abc" }   // stream this task's events
{ "type": "unsubscribe", "taskId": "t_abc" }

// server → client
{ "type": "event",  "taskId": "t_abc", "event": { /* raw stream-json */ }, "ts": 0 }
{ "type": "status", "taskId": "t_abc", "status": "running", "sessionId": "..." }
{ "type": "stats",  "running": 2, "queued": 4, "limit": 3 }   // broadcast, drives top bar
```

`stats` and `status` go to every client so the kanban stays live without polling;
`event` frames only to subscribers of that task. On subscribe, the server replays
persisted events from the DB first, then switches to live — so opening a task
mid-run shows the full log.

---

## 8. Build order & manual verification

Each milestone ends with something you can run and see.

**M0 — Scaffold.** `package.json`, Next + Tailwind, custom server, dark theme shell.
→ `npm run dev`, open `localhost:3000`, see an empty dark dashboard.

**M1 — Schema + config + project CRUD.** `db.ts`, `schema.sql`, `config.ts`,
projects API + sidebar.
→ Add a real local repo in the sidebar; `sqlite3 karkhana.db "select * from projects"`
shows it; restart the server, it's still there.

**M2 — Worktree manager.** `git.ts`, `worktree.ts` + a CLI harness
(`npm run wt:test <projectPath>`).
→ Creates a worktree, `git worktree list` shows it, diff/remove work, main tree
untouched (`git status` clean).

**M3 — Agent runner, end-to-end single task.** ⭐ *the real proof*
Spawn one task, parse stream-json, persist events, capture `session_id`.
No UI yet — a CLI harness prints parsed events live.
→ `npm run agent:test <projectId> "add a HELLO.md saying hi"`; you see streaming
events in the terminal, `select * from events` is populated, `session_id` is set,
and the file exists in the worktree but not in the main tree.
**I'll stop here and confirm streaming works before building anything on top.**

**M4 — Orchestrator + concurrency.** Queue, limit 3, cancel/retry/resume.
→ Enqueue 5 tasks; 3 run, 2 queued, cancel one and a queued one starts.

**M5 — WebSocket.** `bus.ts` + `/ws` + replay-then-live.
→ `npx wscat -c ws://localhost:3000/ws`, subscribe, watch frames arrive.

**M6 — UI.** Kanban, task detail split view (log | diff), model picker,
review panel, top bar counter.
→ Create tasks from the browser, watch two agents stream side by side on the
same repo, merge one, discard the other.

**M7 — Hardening.** Restart reconciliation, orphan cleanup UI, error surfaces.
→ `kill -9` the server mid-run, restart, task shows `failed: orphaned by restart`
and its worktree appears in Cleanup.

`CLAUDE.md` gets written at M3 and updated at each milestone after.

---

## 9. Open questions

1. **Merge strategy** — A or B from §5? (I recommend A.)
2. **Worktree root** — `<project>/../.karkhana/` as specified, or
   `~/.karkhana/<projectName>/`? The latter keeps sibling dirs clean if you
   register repos from several places.
3. **Auto-commit before merge** — OK for Karkhana to commit the agent's
   uncommitted work itself, or should the review panel show the diff and make you
   commit explicitly?
4. **Prompt prelude** — inject a short system preamble (branch name, "commit your
   work when done") ahead of your prompt, or send the prompt verbatim?

Defaults if you don't answer: A, your spec (`../.karkhana/`), auto-commit, verbatim.
