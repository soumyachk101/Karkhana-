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

### Connecting a remote repo, and pushing back to it

`createProject`'s `path` field accepts either a local path or a remote URL
(`https://`, `git@`, `ssh://`, `git://`, `file://`). A URL is cloned to
`~/karkhana-repos/<name>` first (`KARKHANA_CLONE_ROOT` overrides this — mainly
so tests never clone into a real home directory), then registered exactly
like a local repo. A destination that's already a valid clone is reused rather
than cloned over, so re-adding the same URL after a deleted project or a
half-finished clone is safe.

There is no GitHub API integration and no OAuth — clone and push both just
shell out to `git`, so they work only with whatever credential helper or SSH
key already authenticates a manual `git push` on this machine. A private repo
with no cached credentials fails fast (`GIT_TERMINAL_PROMPT=0`, set in
`git()`) instead of hanging on a password prompt nobody can answer.

For a local path, `GET /api/fs/browse?path=` (`app/components/FolderBrowser.tsx`)
gives the sidebar's "Browse…" button a click-through directory picker. This
exists because a web page can never read an absolute filesystem path off a
native `<input type="file">` — browsers deliberately don't expose one — but
since Karkhana's server and browser are always the same machine, the server
just reads the disk itself and hands back names to click through instead.

Pushing is `pushToRemote()` in `lib/worktree.ts`, deliberately **separate**
from merge: merging is local and automatic, but a push touches a remote
outside Karkhana's control, so it only happens from an explicit "Push to
origin" button on a merged task (`POST /api/tasks/[id]/push`), behind a
confirm dialog. It refuses off the base branch or with no `origin` remote,
the same shape of precondition check as `mergeTask`.

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
lib/format.ts             client-safe event → log line rendering
lib/api.ts                JSON response + error wrapper for route handlers
lib/repo/{projects,tasks,events}.ts
lib/agent/streamParser.ts NDJSON split + noise filter
lib/agent/runner.ts       spawn, stream, persist, cancel
lib/agent/orchestrator.ts queue, concurrency gate, retry/resume/merge/discard
lib/testHelpers/          temp git repo, fake `claude` binary, waitUntil, env.ts
app/                      App Router UI + /api routes
hooks/useSocket.ts        one reconnecting WebSocket for the app
scripts/wt-test.mts       worktree isolation + merge
scripts/agent-test.mts    one agent end to end
scripts/e2e-test.mts      HTTP + WebSocket, two agents on one repo
scripts/smoke.mts         post-deploy check — no repo, no API key
```

`lib/format.ts` is imported by client components, so it must stay free of node
builtins. Everything else in `lib/` is server-only.

## Harnesses

The first two run without the web server, which makes them the fastest way to
debug the backend:

```
npm run wt:test    -- <repoPath> [baseBranch] [--merge]
npm run agent:test -- <repoPath> "<prompt>" [model] [--keep]
npm run e2e        -- <repoPath> [baseUrl]        # needs `npm run dev` running
npm run smoke      -- [baseUrl]                   # needs a running server, no repo/API key
```

`--merge` creates a real merge commit (and rolls it back). `--keep` leaves the
worktree on disk to inspect. The e2e harness dispatches two agents at the same
repo and asserts their worktrees, branches, and diffs stay disjoint. `smoke` is
the one safe to wire into a service unit or CI deploy step — it asserts the
server answers, resolved a binary, and pushes WebSocket frames, without ever
touching a real repo or spending an API call.

All four are manual — they need a real repo argument (agent-test/e2e also a
real API key) — and stay that way on purpose. They exercise the one thing the
unit suite below can't: that a real `claude` binary actually produces the
stream shape `streamParser.ts` parses.

## Testing

```bash
npm run typecheck   # tsc --noEmit
npm test            # node:test over lib/**/*.test.ts
```

Hermetic: real temp git repos, a real SQLite file, and a fake `claude` binary
(`lib/testHelpers/fakeClaude.mjs`) standing in for the real one. No network, no
API key, no cost. `.github/workflows/ci.yml` runs both plus `npm run build` on
every push and PR.

The fake binary reads a JSON directive out of the `-p` prompt (`fakePrompt({
delayMs, exitCode, isError })` in `lib/testHelpers/harness.ts`) and emits the
same stream-json shapes the real CLI does. Point `claudeBinPath` at it via
`updateConfig({ claudeBinPath: FAKE_CLAUDE_BIN })` — the orchestrator can't
tell the difference.

Three things worth knowing before adding more tests here:

- **Import `testHelpers/env.ts` first, always.** Any test file that touches
  `lib/config.ts` — directly or transitively (`db.ts`, `worktree.ts`,
  `orchestrator.ts`, `wsServer.ts` all do) — must `import '../testHelpers/env.ts'`
  as its *first* import. `config.ts` reads `KARKHANA_HOME` into a top-level
  `const` at import time; setting the env var after that module has already
  been evaluated is a silent no-op that points the test at this repo's real
  `karkhana.db` and `karkhana.config.json` instead of a throwaway temp dir.
- **`node --test` isolates by file, not by `test()` block.** Each test file
  gets its own process, so the config/db/bus/orchestrator singletons (see
  `lib/singleton.ts`) never bleed across files. They *do* persist across
  multiple `test()` calls within one file — reset the config cache with
  `holder('config').config = undefined` when a test needs fresh defaults, and
  construct a bare `new Orchestrator()` per test (the class is exported
  specifically so tests don't fight over the process-wide singleton instance).
  A task deliberately left in a non-terminal DB status by one test (e.g. to
  probe a precondition check) will otherwise leak into a later test's
  `requeuePersisted()`, which scans `queued` rows globally — delete it when
  you're done with it.
- **Don't poll `runningCount`/`queuedCount` to mean "fully settled."** A task
  is shifted out of `pending` before it lands in `active` — worktree
  provisioning in between is async — so both counters can read zero for an
  instant while the last task is still mid-handoff, not actually finished.
  Wait on the task's real DB status instead:
  `waitUntil(() => getTask(id)?.status === 'needs_review')`.

## Gotchas worth knowing

- The UI receives every new task twice — once from the `POST /api/tasks`
  response, once from the WebSocket `status` frame, and the socket usually wins.
  Client state upserts by id (`upsertTask` in `app/page.tsx`); a blind prepend
  shows every task twice.
- `orchestrator.drain()` is guarded against re-entry. Worktree creation is async,
  so two overlapping calls could each see a free slot and start the same task.
- `pkill -f server/index.mjs` matches its own command line. Use
  `pgrep -f 'node server/index[.]mjs'`.
