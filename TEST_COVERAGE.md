# Test coverage analysis

State of testing in Karkhana as of the current tip, and where the gaps are worth
closing first.

## Where we are

There is no test framework, no test runner, no CI, and no automated assertions
that run without a human typing a repo path. What exists is three integration
harnesses under `scripts/`:

| Harness | Covers | Requires |
| --- | --- | --- |
| `wt:test` | worktree create/diff/remove, merge behind `--merge` | a real git repo argument |
| `agent:test` | one task end to end, DB + bus + runner | a real repo **and a real paid API call** |
| `e2e` | HTTP + WebSocket, two agents on one repo | a repo, a paid API call, `npm run dev` already running |

They are good harnesses — the checks they make are the right checks — but every
one of them is manual, non-hermetic, and unrunnable in CI. `e2e` waits up to 240
seconds on live agents. None of them can run on a pull request.

### What no harness touches at all

Roughly 1,700 of the ~4,200 source lines are never executed by any harness:

- `lib/format.ts` (174 lines) — every log line the user sees
- `lib/boot.ts` (140 lines) — crash recovery, orphan reconciliation
- `hooks/useSocket.ts` (88 lines) — reconnect and re-subscribe
- all nine components plus `app/page.tsx` (~1,390 lines)
- `orchestrator.retry` / `resume` / `cancel` / `shutdown` / `requeuePersisted`
- API routes: `cancel`, `retry`, `resume`, `PATCH /api/config`,
  `PATCH`/`DELETE /api/projects/[id]`, `POST /api/system`
- `lib/api.ts` — the error wrapper every route depends on

And even inside the covered modules, only the happy path is asserted. Nothing
tests what happens when git fails, when a merge conflicts, or when a request
body is malformed.

---

## Priority 1 — pure logic that is trivially testable and currently untested

These need no git repo, no database, and no API key. They are the cheapest
possible tests and they cover code that is on every user-visible path.

### `lib/agent/streamParser.ts`

The single most test-worthy file in the repo: pure, deterministic, and it
decides what reaches SQLite. Today it is only exercised indirectly, via an
`agent:test` run that costs money.

Cases to write:

- a JSON object split across three `push()` calls reassembles correctly
- `flush()` returns a trailing line that arrived with no newline
- a malformed line surfaces as `{ok: false}` rather than being swallowed
- `commands_changed` and `thinking_tokens` frames return `null` from
  `normalizeEvent`
- `system/init` is reduced to the `INIT_KEEP` allowlist and drops the rest
- `stripSignatures` removes nested `signature` keys inside `message.content[]`
- a payload over 128 KB is replaced by the `_truncated` envelope, and
  `_original_bytes` reflects the pre-truncation size
- `extractSessionId` returns `null` for a missing, empty, or non-string id
- `parseResult` coerces non-numeric `duration_ms` / `num_turns` to `null`

### `lib/format.ts`

Client-facing and completely untested. `toLogLines` has nine branches.

- unparseable `payload_json` yields a single `error` line instead of throwing
- each event type (`stderr`, `lifecycle`, `system/init`, `result`, assistant
  message) produces the expected `kind` and `label`
- a `lifecycle` payload whose `kind` contains `fail` or `orphan` is rendered as
  an error, not as meta
- `describeToolInput` for Read/Write/Edit/Bash/Glob/Grep, and the default branch
- `relativeTime` and `duration` boundaries (59s/60s, 59m/60m, 23h/24h)

`duration()` and `relativeTime()` read `Date.now()` directly, which makes them
awkward to test. Either accept an injected clock or use a fake-timer helper —
worth deciding before writing the tests.

### `lib/git.ts` — `listWorktrees`

A hand-rolled parser for `git worktree list --porcelain` with no tests. Feed it
fixture strings:

- a detached-HEAD worktree (no `branch` line) yields `branch: null`
- the final entry is captured when the output has no trailing blank line
- `refs/heads/` is stripped from branch names
- bare / prunable entries do not corrupt the entry that follows

---

## Priority 2 — the destructive paths, tested only on the happy path

### `mergeTask` conflict handling

This is the highest-risk untested code in the repo. `mergeTask` writes to the
user's *main working tree*, and only the success path is covered (behind an
opt-in `--merge` flag that also requires a human to pass a repo path).

Untested and load-bearing:

- **conflict → abort:** the promise that "the main working tree was left
  untouched" is exactly what nobody has verified. A test should build two
  branches that touch the same line, merge, and assert `ok: false`, a populated
  `conflicts[]`, and that `git status` in the main tree is byte-identical to
  before.
- refusal when the main tree is on a branch other than `base_branch`
- refusal when the main tree is dirty
- the "no conflicts but git still failed" branch that greps stderr for
  `error|fatal`
- `commitAll` returning `false` on an already-clean worktree

All of this runs against a temp repo built by a fixture helper in a few
milliseconds. No API key needed.

### `getTaskDiff` output shapes

Confirmed unhandled today: a rename produces a numstat line whose path field is
`old name.txt => new name.txt`, and that string is passed through as `path` and
rendered as a filename. Worth a test and a fix.

Also untested: the 2 MB patch truncation flag, and paths that git quotes
(non-ASCII filenames come back as `"caf\303\251.txt"`). Binary files *are*
handled correctly — `-\t-\tfile` → `binary: true` — but nothing asserts it.

### `boot.ts` crash recovery

Runs on every startup, tested never. With a temp DB:

- a `running` task with a dead pid is marked `failed` with the orphan message
- a `running` task with a live pid gets SIGTERM before being failed
- `isAlive` treats `EPERM` as alive
- `findOrphanWorktrees` ignores the project root and any branch outside the
  `karkhana/` prefix, and skips ids still present in the DB
- a project directory that has been deleted logs and continues rather than
  aborting boot

---

## Priority 3 — the orchestrator's concurrency invariants

`lib/agent/orchestrator.ts` is 303 lines of queue management with zero direct
tests. `e2e` asserts two tasks ran concurrently under a limit of 3 — which never
tests that the limit is *enforced*.

With `runAgent` stubbed (inject it, or point `claudeBinPath` at a fake script
that emits canned stream-json), these become fast and deterministic:

- with `concurrency: 1`, enqueueing three tasks starts exactly one; the second
  starts only after the first settles
- FIFO order is preserved across the wait
- `enqueue` is idempotent for a task already queued or already active
- the `draining` guard: two overlapping `drain()` calls never double-start a task
- `cancel` on a *queued* task removes it from `pending` and marks it cancelled
  without spawning
- `cancel` on a *running* task delegates to the handle
- `retry` throws while the task is still active, and otherwise clears
  `session_id`, `worktree_path`, and `branch`
- `resume` throws its three distinct preconditions (already running, no
  `session_id`, no `worktree_path`)
- `requeuePersisted` re-admits persisted `queued` rows without duplicating ones
  already pending
- `shutdown` cancels every handle and honours the 6 s race

The runner deserves the same treatment with a fake binary: refusing to run when
`cwd` equals the project root, exit 0 with `is_error: true` mapping to `failed`,
the SIGTERM → SIGKILL escalation, and `pid` being cleared on every exit path.

---

## Priority 4 — API input validation

No route has a test. Two concrete bugs are sitting in this gap:

**`PATCH /api/config` does not validate types.** `updateConfig` clamps
`concurrency < 1`, but a JSON body of `{"concurrency": "abc"}` is written to
`karkhana.config.json` verbatim — `"abc" < 1` is `false`, so the clamp never
fires. The orchestrator then evaluates `this.active.size < this.limit` as
`0 < "abc"`, which is `false`, and **no task ever starts again, across
restarts**, because the bad value is persisted to disk. A non-integer like `2.5`
gets through the same way. This needs both a validation fix and a test.

**`PATCH /api/projects/[id]` does not validate `base_branch`.** A typo is
accepted silently and every subsequent `createWorktree` for that project throws
at task-creation time, far from the cause.

Beyond those, the route-level cases worth covering: `POST /api/tasks` rejecting
a missing prompt, an unknown project, and an invalid model; `handle()` turning a
thrown error into `{error}` with status 500 rather than Next's HTML error page;
`DELETE /api/projects/[id]` removing worktrees *before* the FK cascade.

---

## Priority 5 — WebSocket and UI

### A real race in `wsServer.ts`

On `subscribe`, the handler adds the task id to `client.subscriptions` and *then*
replays history. Between those two steps the bus listener is already matching
this client, so a live frame can be sent ahead of the replayed events that
precede it. `app/page.tsx:70` dedupes by id but appends without sorting
(`[...existing, frame.event]`), and `LogStream` renders in array order — so the
log pane can show events out of chronological order on any task that is actively
streaming when you open it.

Worth a test that opens a socket, subscribes while events are being appended,
and asserts the received ids are monotonic. The fix is to buffer live frames
until replay completes, or to sort on insert client-side.

Also untested: `event` frames reaching only subscribed clients (asserted only
indirectly by `e2e`), `stats` and `status` broadcasting to everyone, the
heartbeat terminating a client that stops ponging, and the upgrade handler
leaving non-`/ws` paths alone so Next's HMR socket survives.

### `useSocket`

Exponential backoff capping at 10 s, re-subscribing to everything in
`subscriptionsRef` on reconnect, and not tearing down the socket when the parent
re-renders (the whole reason the handler lives in a ref). All testable with a
mock WebSocket.

### Components

~1,390 lines with no test renderer installed. Lowest priority — but if any of it
gets tests, make it the pure rendering logic: `KanbanBoard` grouping by
`STATUS_ORDER`, `DiffView` parsing a patch into hunks, `NewTaskDialog`
validation.

---

## Infrastructure to add first

None of the above lands well without a runner. Suggested, in order:

1. **`node:test`** — zero new dependencies, and the project already runs TS via
   `--experimental-strip-types` in its npm scripts. Add
   `"test": "node --experimental-strip-types --test 'lib/**/*.test.ts'"`.
2. **A git fixture helper** — `makeTempRepo()` that inits a repo, commits a file,
   and returns a path plus a cleanup function. Most of Priority 2 depends on it.
3. **A fake agent binary** — a shell script that prints canned stream-json and
   exits with a configurable code. Unlocks every runner and orchestrator test in
   Priority 3 without an API key. Point `claudeBinPath` at it.
4. **A temp-DB helper** — `getConfig().dbPath` is process-global, so tests need
   to point it at a fresh file per suite and call `closeDb()` after.
5. **`"typecheck": "tsc --noEmit"`** — there is no typecheck script today.
6. **CI** — there is no `.github/` directory at all. A workflow running
   typecheck plus the hermetic tests on every push is the single highest-value
   change here; it makes everything above a gate instead of a suggestion.

Keep the three existing harnesses. They cover the one thing unit tests
legitimately cannot — that a real Claude Code binary produces the stream shape
we parse — and they should stay as a manual pre-release check, not become CI.

## Suggested order

1. CI + `node:test` + `tsc --noEmit` (a day, unblocks everything)
2. `streamParser` and `format` unit tests (pure, no fixtures needed)
3. Git fixture helper, then `mergeTask` conflict and refusal paths
4. Fake agent binary, then orchestrator concurrency invariants
5. The two confirmed bugs — config type validation, rename paths in
   `getTaskDiff` — fixed with regression tests
6. WebSocket replay ordering
7. UI, if and when it stops changing shape
