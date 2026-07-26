# Deploy status — 2026-07-27

Target chosen: **local production run** (matches CLAUDE.md — localhost only, no
auth, no Docker, no cloud).

Session was cut short. Everything below is done and verified unless marked
otherwise. Nothing is half-applied — the tree builds and runs as it stands.

---

## Baseline found

`npm install` had never been run here. Once installed, the existing code was
already in better shape than expected:

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | clean, 0 errors |
| `npm run build` | passes, Next 16.2.12, 14 routes |
| `NODE_ENV=production node server/index.mjs` | boots, serves `/` 200, all API routes 200 |
| SIGTERM shutdown | graceful, exits in <1s, logs `SIGTERM — shutting down` |
| WebSocket `/ws` | connects, pushes `stats` on connect |

So the app was never broken. What was missing was everything *around* running
it in production.

---

## Changes made

### 1. `server/index.mjs` — three guards

- **Node version guard.** The server imports `lib/*.ts` directly and relies on
  native type stripping, which is only unflagged from Node 22.18. Older Node
  died with an opaque `SyntaxError` partway through boot. Now it exits 1 with
  the version, the requirement, and the `--experimental-strip-types` fallback.
- **Missing-build guard.** `npm start` on a fresh clone with no `.next` used to
  fail deep inside Next. Now: `no production build found in .next — run
  npm run build first`. Verified by moving `.next` aside — exits 1 with that
  line.
- **Explicit `dir` for Next.** `next({ dir: appRoot })`, resolved from
  `import.meta.url` instead of cwd. This is the load-bearing one for services:
  launchd and systemd start the process in `/`, where Next would have looked
  for `.next` and found nothing. Verified by launching from `/` — serves 200 and
  passes the full smoke check.

### 2. `lib/config.ts` — `KARKHANA_HOME`

`const ROOT = process.env.KARKHANA_HOME ?? process.cwd()`.

Same reason: under a service unit the cwd is `/`, so `karkhana.config.json` and
`karkhana.db` would have been written to the filesystem root (or failed).
Plus a `mkdirSync(ROOT, { recursive: true })` before the first config write, so
pointing `KARKHANA_HOME` at a directory that doesn't exist yet just works.

Verified: launched from `/` with `KARKHANA_HOME` set to a temp dir, all four
state files (`karkhana.config.json`, `.db`, `.db-wal`, `.db-shm`) landed there,
and `/api/system` reported the relocated `dbPath`.

### 3. `scripts/smoke.mts` (new) — the post-deploy check

`npm run smoke -- [baseUrl]`. Unlike the other three harnesses this needs **no
repo, no API key, and spawns no agent**, so it is the one that can run in a
service unit or a post-install hook. Checks:

- `GET /` serves HTML
- `/api/system` answers, and `binary.ok` is true
- `boot` report is non-null — i.e. the `holder()` singleton still crosses the
  Node-side / webpack-side module boundary (the exact bug CLAUDE.md documents)
- `/api/tasks`, `/api/projects`, `/api/config` all 200
- WebSocket `/ws` pushes a `stats` frame within 8s

Exits non-zero on failure. Verified both ways: 9/9 PASS against a live server,
and a clean `server unreachable` + exit 1 against a dead port.

### 4. `package.json`

- `"typecheck": "tsc --noEmit"`
- `"smoke": "node --experimental-strip-types scripts/smoke.mts"`
- `"engines": { "node": ">=22.18" }`

### 5. `deploy/` (new) — service units

- `deploy/com.karkhana.dashboard.plist` — launchd, macOS
- `deploy/karkhana.service` — systemd **user** unit, Linux

Both are templates with `{{NODE}}` / `{{KARKHANA_DIR}}` / `{{HOME}}` / `{{PATH}}`
placeholders and a `sed` one-liner in the README to fill them.

User-scoped on purpose, and both spell out `HOME` and `PATH`: the spawned agent
inherits the server's environment, so without `HOME` it can't find its own
credentials and without `PATH` it can't find `git`. The systemd unit also sets
`KillSignal=SIGTERM` + `TimeoutStopSec=30` so the orchestrator gets to cancel
live agents instead of being SIGKILLed mid-run.

### 6. `README.md` (new)

Requirements, quick start, config reference, env var table, both service
install recipes, upgrade steps, the check commands, and a troubleshooting table
covering each failure mode above.

---

## Not done

- **`npm run wt:test` on a scratch repo** — was mid-command when the session
  ended. A throwaway repo is already sitting at
  `<scratchpad>/testrepo` (single commit, branch `main`) if you want to pick it
  straight up:

  ```bash
  npm run wt:test -- <path-to>/testrepo main --merge
  ```

  Free — no API call. This is the only unverified path in the deploy story: the
  worktree/merge core has not been exercised against this install.

- **`agent:test` / `e2e`** — deliberately skipped, they spend real tokens.
  Worth one `agent:test` run before calling it done.

- **Service units installed for real** — the plist and unit file are written and
  the paths are right, but neither has been `launchctl load`ed on this machine.

- **Tests / CI** — untouched. `TEST_COVERAGE.md` still describes the state
  accurately: no framework, no runner, no CI, ~1,700 lines never executed.
  `smoke` and `typecheck` are the first two things that *could* run in CI, but
  no workflow file was added.

---

## To resume

```bash
npm install && npm run build     # if node_modules got cleared
npm start                        # :3000
npm run smoke                    # 9 checks, should be all PASS
```

Then the wt:test line above, then decide on `agent:test`.

Nothing is committed — all of this is uncommitted working-tree changes on
`claude/karkhana-multi-agent-3ph91a`.
