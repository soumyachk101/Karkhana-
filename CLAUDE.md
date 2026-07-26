# Karkhana — architecture notes

Local-first dashboard for running many headless Claude Code agents in parallel
across local git repos, including several agents on the same repo at once.

Localhost only. No auth, no cloud, no Docker.

## Quick start

```bash
npm install
npm run dev            # http://localhost:3000, ws on the same port
```

First boot writes `karkhana.config.json` with an auto-detected `claudeBinPath`
(`which claude`, then a list of common install locations). Edit it there if the
top bar reports the binary as missing. `karkhana.db` is created alongside it.
Both are gitignored — this is local state, not project state.

## Why there is a custom server

`server/index.mjs` owns the `http.Server` and delegates to Next, rather than
running `next dev`/`next start`. Two reasons, both load-bearing:

1. `ws` needs an `upgrade` handler on the HTTP server. Next doesn't expose one.
2. The orchestrator holds live `ChildProcess` handles and an in-memory queue. It
   has to outlive individual requests, in a module that Next route handlers can
   import directly.

Consequences:
- Next runs in dev mode through the custom server; Turbopack is not used.
- `better-sqlite3` is a native addon, so `next.config.mjs` lists it in
  `serverExternalPackages` — Next must `require()` it, not bundle it.

### `lib/` is loaded twice — never use module-level mutable state

This is the single most important thing to know about this codebase.

The custom server imports `lib/*.ts` through **Node's ESM loader**. Next's route
handlers import the same files through the **webpack bundle**. Those are separate
module instances in one process: a `let` at module scope exists twice, and each
side sees only its own copy. Dev HMR gives a third way to get duplicates.

Anything shared must live in a `holder()` from `lib/singleton.ts`, which stores
it under a `Symbol.for()` key in the process-wide symbol registry:

```ts
const state = holder<{ db?: Database.Database }>('db');
```

Currently held that way: the DB handle, the event bus, the orchestrator, the
resolved config, and the boot report.

Two real bugs came from getting this wrong:
- `boot.ts` kept its orphan report in a plain `let`. `boot()` filled it in on the
  Node side; `GET /api/system` read it on the webpack side and always got `null`,
  so orphaned worktrees never reached the UI.
- `config.ts` cached the parsed config the same way, so `PATCH /api/config`
  updated the webpack-side copy while the orchestrator kept reading the Node-side
  one — a raised concurrency limit did nothing until restart.

If you add shared state and it "works in the API but not in the server" (or vice
versa), this is why.

### The custom server imports TypeScript directly

`server/index.mjs` does `await import('../lib/boot.ts')`. Node 22 strips types at
runtime, so this works with no build step — but only for *erasable* syntax. No
enums, no namespaces, no constructor parameter properties. `tsconfig.json` sets
`erasableSyntaxOnly: true` so `tsc` rejects those before Node does.

Relative imports inside `lib/` therefore carry explicit `.ts` extensions. Both
Node and webpack resolve those literally.

## Isolation model — the core invariant

**An agent never runs in a project's main working tree.** Every task gets its own
worktree and its own branch:

```
git -C <project> worktree add <worktreeRoot>/<taskId> -b karkhana/<taskId> <base>
```

- Default `worktreeRoot` is `<project>/../.karkhana` — a sibling of the repo, so
  nothing pollutes the repo itself. Override in `karkhana.config.json`.
- Task ids are globally unique, so several projects can share a worktree root.
- Two agents on one repo share only `.git/objects`, which git already makes safe
  for concurrent access.
- `runAgent()` asserts `cwd !== project.path` and refuses to spawn otherwise.
  This is checked at the last possible moment on purpose — it is the one mistake
  that would let two agents corrupt each other.

Always create worktrees through `provisionTaskWorktree()`, never `createWorktree()`
directly: it also writes `worktree_path` and `branch` onto the task row. A
worktree that exists on disk but not in the DB is invisible to the diff view, the
merge path, and orphan reconciliation.

## Merge strategy

git refuses to check out one branch in two worktrees, so merging a task branch
into the base branch has to happen in the **main** working tree. `mergeTask()`:

1. Refuses unless the main tree is clean *and* already on the base branch.
2. Auto-commits whatever the agent left uncommitted, as `karkhana: <title>`.
3. `git merge --no-ff <taskBranch>`.
4. On conflict, collects the conflicted paths and runs `git merge --abort`.

Step 4 is deliberate: a half-merged main tree would block every subsequent merge,
and a user who doesn't notice it is in a much worse position than one who gets a
conflict list and the manual command. Karkhana never leaves the main tree dirty.

## Agent invocation

```
<claudeBinPath> -p "<prompt>"
  --output-format stream-json --verbose
  --allowedTools "Read,Write,Edit,Bash,Glob,Grep"
  --model <haiku|sonnet|opus>
  [--resume <session_id>]
```

`claudeBinPath` is stored in `karkhana.config.json` and auto-detected on first
run (`which claude`, then a list of common install paths). Never assumed to be
on PATH.

### The stream is noisier than it looks

`--output-format stream-json` emits far more than `assistant`/`user`/`result`.
Measured on a trivial 4-turn run:

| frame | size / frequency | kept? |
|---|---|---|
| `system/init` | ~4KB, once | compacted — the slash-command, skill, and agent inventories are dropped |
| `system/commands_changed` | **~20KB**, once | dropped |
| `system/thinking_tokens` | ~15 per turn | dropped |
| `active_goal`, `rate_limit_event` | a few | dropped |
| `assistant` thinking blocks | ~1KB base64 `signature` each | signature stripped |
| `assistant` / `user` / `result` | the actual content | kept |

`lib/agent/streamParser.ts` does this filtering in `normalizeEvent()`. Without it
a 12-second run writes ~60KB of mostly-garbage to SQLite and floods the log pane;
with it, ~13KB of signal. Payloads over 128KB (a `Read` of a huge file) are
truncated with a `_truncated` marker rather than stored whole.

`event.type` is stored as the raw string from the stream, not a closed union, so
a future CLI version emitting new frame types degrades to a generic renderer
instead of breaking.

### session_id

Nearly every frame carries `session_id`, including the very first — so the runner
captures it from the first frame that has one rather than waiting for
`system/init`. That matters because a run that dies mid-flight is only resumable
if the id was already persisted.

### The prompt is recorded on every run

The `spawned`/`resumed` lifecycle event carries `prompt`. A resume overwrites
`task.prompt` in the database, so without this the follow-up instruction that
produced a given run would be unrecoverable afterwards — and the chat view would
have no user turns to show. Tasks created before this existed fall back to
`task.prompt` for the opening bubble.

## Data flow

```
spawn → stdout (NDJSON)
      → StreamJsonParser.push()      buffers partial lines
      → normalizeEvent()             drops noise, strips signatures, caps size
      → events table (SQLite)
      → bus.publish()                in-process EventEmitter
      → WebSocket /ws                fanout to subscribed browser tabs
```

The bus is deliberately dumb: it broadcasts every frame and `lib/wsServer.ts`
filters per-connection by subscription. Task `event` frames go only to
subscribers; `status` and `stats` frames go to everyone so the kanban stays live.

## Status lifecycle

```
queued → running → needs_review → merged
           │           │  ▲
           │           │  └── resume → running
           ├→ failed ──┘  (retry → queued, fresh worktree)
           └→ cancelled
```

- `needs_review`: clean exit, `result.is_error` false.
- `failed`: non-zero exit, spawn error, or `result.is_error` true (e.g. max turns).
- `cancelled`: SIGTERM, then SIGKILL after 5s. The worktree is kept for inspection.

## Crash recovery

`lib/boot.ts` runs before the server accepts connections:

1. Tasks stuck in `running` whose pid is dead → `failed`, "orphaned by restart".
   A surviving child is *not* adopted: its stdout pipe died with the old process,
   so its output is unrecoverable. It gets killed.
2. `karkhana/*` worktrees with no live task → reported as orphans in the UI.
   Never auto-deleted; they may hold the only copy of an agent's work.
3. `git worktree prune` for directories that vanished from disk.
4. `queued` tasks are re-enqueued oldest-first.

## Layout

```
server/index.mjs          http + ws + Next, boot, graceful shutdown
lib/singleton.ts          holder() — cross-module-instance shared state
lib/config.ts             karkhana.config.json, binary detection
lib/db.ts  schema.sql     SQLite singleton (WAL), idempotent schema
lib/git.ts                promisified git exec
lib/worktree.ts           create/diff/commit/merge/remove/orphan-scan
lib/bus.ts                in-process pub/sub
lib/boot.ts               restart reconciliation
lib/wsServer.ts           /ws, per-connection subscriptions, replay-then-live
lib/format.ts             client-safe event → log lines + chat transcript
lib/markdown.ts           client-safe Markdown → data (never HTML)
lib/highlight.ts          client-safe tokenizer behind the `tok-*` classes
lib/ansi.ts               client-safe SGR parser for the terminal pane
lib/theme.ts              client-safe theme read/apply + pre-paint boot script
lib/exec.ts               one-shot `bash -lc` in a worktree, for the terminal
lib/api.ts                JSON response + error wrapper for route handlers
lib/repo/{projects,tasks,events}.ts
lib/agent/streamParser.ts NDJSON split + noise filter
lib/agent/runner.ts       spawn, stream, persist, cancel
lib/agent/orchestrator.ts queue, concurrency gate, retry/resume/merge/discard
app/                      App Router UI + /api routes
app/components/ui/        icons, primitives, toasts, code block
hooks/useSocket.ts        one reconnecting WebSocket for the app
scripts/wt-test.mts       worktree isolation + merge
scripts/agent-test.mts    one agent end to end
scripts/e2e-test.mts      HTTP + WebSocket, two agents on one repo
```

`lib/format.ts`, `markdown.ts`, `highlight.ts`, `ansi.ts`, and `theme.ts` are
imported by client components, so they must stay free of node builtins.
Everything else in `lib/` is server-only.

## UI

### Theming

`app/globals.css` defines two palettes as raw `--k-*` variables — a warm paper
light theme and a warm charcoal dark theme — and aliases them into the Tailwind
scale inside `@theme` (`--color-ink-900: var(--k-900)`). The scale is *inverted*
between themes: `ink-900` is always the furthest surface from the reader and
`ink-50` is always the strongest text. That is what lets a single `data-theme`
flip on `<html>` re-skin everything with no conditional classes in components.

The theme is applied by `THEME_BOOT_SCRIPT` in the document head, before first
paint. Without it a reload flashes the dark palette at light-theme users.

### The two views of a run

The same event stream is rendered twice, deliberately:

- **Conversation** (`ChatTranscript.tsx`) — the run as a conversation. Assistant
  text goes through the Markdown renderer, thinking collapses behind a summary,
  and each `tool_use` becomes a card. `buildTranscript()` in `lib/format.ts`
  does the one thing the flat log cannot: a `tool_use` block and the
  `tool_result` that answers it arrive in *different* events, so they are
  stitched back together by `tool_use_id`.
- **Terminal** (`Terminal.tsx`) — the stream as it arrived, one row per physical
  line, with ANSI colour, search, kind filters, wrapping and timestamp toggles,
  and download.

Markdown and highlighting produce React nodes, never HTML strings — there is no
path from agent output to `dangerouslySetInnerHTML`.

### The terminal prompt

`POST /api/tasks/:id/exec` runs a command through `bash -lc` **in the task's
worktree** and returns its captured output. It is not a pty: stdin is closed,
no state carries between commands, the process group is killed after 30s, and
output is capped at 256KB. Karkhana is localhost-only and the agents it spawns
already have Bash in the same directory, so this adds no reach the dashboard did
not already have — but it is the one route that runs arbitrary user input, so
keep the worktree check in the handler.

## Harnesses

The first two run without the web server, which makes them the fastest way to
debug the backend:

```
npm run wt:test    -- <repoPath> [baseBranch] [--merge]
npm run agent:test -- <repoPath> "<prompt>" [model] [--keep]
npm run e2e        -- <repoPath> [baseUrl]        # needs `npm run dev` running
```

`--merge` creates a real merge commit (and rolls it back). `--keep` leaves the
worktree on disk to inspect. The e2e harness dispatches two agents at the same
repo and asserts their worktrees, branches, and diffs stay disjoint.

## Gotchas worth knowing

- The UI receives every new task twice — once from the `POST /api/tasks`
  response, once from the WebSocket `status` frame, and the socket usually wins.
  Client state upserts by id (`upsertTask` in `app/page.tsx`); a blind prepend
  shows every task twice.
- `orchestrator.drain()` is guarded against re-entry. Worktree creation is async,
  so two overlapping calls could each see a free slot and start the same task.
- `pkill -f server/index.mjs` matches its own command line. Use
  `pgrep -f 'node server/index[.]mjs'`.
