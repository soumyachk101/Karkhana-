# Karkhana — architecture notes

Local-first dashboard for running many headless Claude Code agents in parallel
across local git repos, including several agents on the same repo at once.

Localhost only. No auth, no cloud, no Docker.

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
- Next's dev HMR re-evaluates modules. The DB handle (`lib/db.ts`), the event bus
  (`lib/bus.ts`), and the orchestrator (`lib/agent/orchestrator.ts`) are cached on
  `globalThis` via `Symbol.for(...)` so we never end up with two of any of them.

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
lib/config.ts             karkhana.config.json, binary detection
lib/db.ts  schema.sql     SQLite singleton (WAL), idempotent schema
lib/git.ts                promisified git exec
lib/worktree.ts           create/diff/commit/merge/remove/orphan-scan
lib/bus.ts                in-process pub/sub
lib/boot.ts               restart reconciliation
lib/wsServer.ts           /ws, per-connection subscriptions, replay-then-live
lib/repo/{projects,tasks,events}.ts
lib/agent/streamParser.ts NDJSON split + noise filter
lib/agent/runner.ts       spawn, stream, persist, cancel
lib/agent/orchestrator.ts queue, concurrency gate, retry/resume/merge/discard
app/                      App Router UI + /api routes
scripts/wt-test.mts       M2 harness — worktree isolation + merge
scripts/agent-test.mts    M3 harness — one agent end to end
```

## Harnesses

Both run without the web server, which makes them the fastest way to debug the
backend:

```
npm run wt:test    -- <repoPath> [baseBranch] [--merge]
npm run agent:test -- <repoPath> "<prompt>" [model] [--keep]
```

`--merge` creates a real merge commit (and rolls it back). `--keep` leaves the
worktree on disk to inspect.
