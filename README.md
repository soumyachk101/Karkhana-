# Karkhana

Local-first dashboard for running many headless Claude Code agents in parallel
across your git repos — including several agents on the *same* repo at once,
each in its own worktree and branch.

Localhost only. No auth, no cloud, no Docker. See [CLAUDE.md](./CLAUDE.md) for
the architecture and the invariants worth knowing before changing anything.

## Requirements

| | |
|---|---|
| Node | **22.18+** (the server imports `lib/*.ts` directly and relies on native type stripping) |
| git | on `PATH`, 2.20+ for `git worktree` |
| Claude Code | installed and logged in — auto-detected via `which claude`, then a list of common install paths |

## Run it

```bash
npm install
npm run build
npm start                     # http://127.0.0.1:3000, WebSocket on the same port
npm run smoke                 # verify the deployment (no repo, no API key needed)
```

For development, skip the build — `npm run dev` runs Next in dev mode through
the same custom server, with Fast Refresh.

First boot writes `karkhana.config.json` next to the app and creates
`karkhana.db`. Both are gitignored: they are machine state, not project state.

```jsonc
{
  "claudeBinPath": "/usr/local/bin/claude",  // edit if the top bar says it's missing
  "concurrency": 3,                          // agents running at once; the rest queue
  "worktreeRoot": null,                      // null = <project>/../.karkhana
  "dbPath": "/path/to/karkhana.db"
}
```

`concurrency` is also editable from the UI and takes effect immediately.

### Environment

| Variable | Default | |
|---|---|---|
| `PORT` | `3000` | HTTP and WebSocket share it |
| `KARKHANA_HOST` | `127.0.0.1` | leave it — there is no auth layer |
| `KARKHANA_HOME` | cwd | where `karkhana.config.json` and `karkhana.db` live. **Required for service units**, which start in `/` |
| `NODE_ENV` | — | `production` skips dev mode; `npm start` sets it |

## Run it as a service

Both units are templates; fill the placeholders with the commands below.

**macOS (launchd)**

```bash
sed -e "s|{{NODE}}|$(which node)|" \
    -e "s|{{KARKHANA_DIR}}|$PWD|g" \
    -e "s|{{HOME}}|$HOME|" \
    -e "s|{{PATH}}|$PATH|" \
    deploy/com.karkhana.dashboard.plist > ~/Library/LaunchAgents/com.karkhana.dashboard.plist

launchctl load ~/Library/LaunchAgents/com.karkhana.dashboard.plist
npm run smoke
```

Unload with `launchctl unload ~/Library/LaunchAgents/com.karkhana.dashboard.plist`.
Logs land in `karkhana.log` in the app directory.

**Linux (systemd user unit)**

```bash
mkdir -p ~/.config/systemd/user
sed -e "s|{{NODE}}|$(which node)|" \
    -e "s|{{KARKHANA_DIR}}|$PWD|g" \
    deploy/karkhana.service > ~/.config/systemd/user/karkhana.service

systemctl --user daemon-reload
systemctl --user enable --now karkhana
npm run smoke
```

`loginctl enable-linger $USER` if you want it up without an active login.
Logs: `journalctl --user -u karkhana -f`.

Both units are user-scoped on purpose. The agent Karkhana spawns inherits the
environment, and it needs your `HOME` to find its own credentials and your
`PATH` to find `git`.

### Upgrading

```bash
git pull && npm install && npm run build
launchctl kickstart -k gui/$UID/com.karkhana.dashboard   # or: systemctl --user restart karkhana
```

`npm start` refuses to run without a build rather than failing deep inside Next,
so a forgotten `npm run build` is a one-line error, not a mystery. In-flight
agents are SIGTERM'd on shutdown and marked `failed` on the next boot; their
worktrees are kept.

## Checks

```bash
npm run typecheck                              # tsc --noEmit
npm run smoke -- [baseUrl]                     # HTTP + WebSocket against a running server
npm run wt:test    -- <repoPath> [base] [--merge]   # worktree isolation and merge, no agent
npm run agent:test -- <repoPath> "<prompt>" [model] [--keep]  # one agent end to end
npm run e2e        -- <repoPath> [baseUrl]     # two agents on one repo, needs the server up
```

`smoke` and `typecheck` are hermetic. The rest need a real repo, and
`agent:test`/`e2e` spend real tokens. There is no unit test suite —
[TEST_COVERAGE.md](./TEST_COVERAGE.md) says where the gaps are and which are
worth closing first.

## Troubleshooting

| Symptom | Cause |
|---|---|
| `Node <v> is too old` on start | Node below 22.18; upgrade, or start with `node --experimental-strip-types server/index.mjs` |
| `no production build found in .next` | run `npm run build` |
| Top bar says the binary is missing | set `claudeBinPath` in `karkhana.config.json` to the output of `which claude` |
| Fresh `karkhana.db` after installing the service | `KARKHANA_HOME` isn't set, so state went to the unit's cwd |
| Tasks stuck `queued` | concurrency limit reached, or the binary check failed — check `/api/system` |
| Merge reports a conflict | resolve it by hand with the command in the UI; Karkhana aborts rather than leave your main tree half-merged |
| Orphan worktrees listed after a crash | expected — they may hold the only copy of an agent's work, so they are reported, never auto-deleted |

Karkhana never runs an agent in a project's main working tree, and never leaves
that tree dirty. If you see either, it's a bug.
