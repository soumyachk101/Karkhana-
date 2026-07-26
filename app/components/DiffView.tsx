'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { highlight, languageFromPath } from '@/lib/highlight';
import type { TaskDiff } from '@/lib/worktree';
import { Icon } from './ui/icons.tsx';
import { Badge, Button, CopyButton, EmptyState, IconButton, PaneHeader, Spinner } from './ui/primitives.tsx';

type FilePatch = { path: string; body: string };

/**
 * Splits a combined patch into per-file chunks.
 *
 * `git diff` emits one stream for the whole worktree; a reviewer reads it one
 * file at a time. Splitting here is what makes per-file collapse, jump-to-file,
 * and per-file copy possible without asking git for each file separately.
 */
function splitPatch(patch: string): FilePatch[] {
  if (!patch.trim()) return [];
  const files: FilePatch[] = [];
  let current: FilePatch | null = null;

  for (const line of patch.split('\n')) {
    if (line.startsWith('diff --git ')) {
      if (current) files.push(current);
      const match = /diff --git a\/(.+?) b\/(.+)$/.exec(line);
      current = { path: match?.[2] ?? line.slice('diff --git '.length), body: '' };
      continue;
    }
    if (!current) continue;
    // Header noise the file card already shows in its own chrome.
    if (/^(index |--- |\+\+\+ |new file mode |deleted file mode |similarity index |rename )/.test(line)) {
      continue;
    }
    current.body += (current.body ? '\n' : '') + line;
  }
  if (current) files.push(current);
  return files;
}

const HUNK = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/;

function FileDiff({ file, stats }: { file: FilePatch; stats?: { added: number; deleted: number } }) {
  const [open, setOpen] = useState(true);
  const lang = languageFromPath(file.path) ?? undefined;

  const rows = useMemo(() => {
    let oldLine = 0;
    let newLine = 0;
    return file.body.split('\n').map((line, index) => {
      const hunk = HUNK.exec(line);
      if (hunk) {
        oldLine = Number(hunk[1]);
        newLine = Number(hunk[2]);
        return { index, kind: 'hunk' as const, text: line, old: null, next: null };
      }
      if (line.startsWith('+')) {
        return { index, kind: 'add' as const, text: line.slice(1), old: null, next: newLine++ };
      }
      if (line.startsWith('-')) {
        return { index, kind: 'del' as const, text: line.slice(1), old: oldLine++, next: null };
      }
      if (line.startsWith('\\')) {
        return { index, kind: 'meta' as const, text: line, old: null, next: null };
      }
      return { index, kind: 'ctx' as const, text: line.slice(1), old: oldLine++, next: newLine++ };
    });
  }, [file.body]);

  return (
    <section className="border-b border-ink-800 last:border-b-0">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-ink-800 bg-ink-850/95 px-2.5 py-1.5 backdrop-blur">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        >
          <Icon
            name="chevronRight"
            size={12}
            className={`text-ink-500 transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
          />
          <span className="truncate font-mono text-[11.5px] text-ink-100">{file.path}</span>
        </button>
        {stats && (
          <span className="shrink-0 font-mono text-[10.5px] tabular-nums">
            <span className="text-ok">+{stats.added}</span> <span className="text-danger">−{stats.deleted}</span>
          </span>
        )}
        <CopyButton text={file.body} size="xs" title="Copy this file's patch" />
      </header>

      {open && (
        <div className="overflow-x-auto font-mono text-[11.5px] leading-[1.55]">
          {rows.map((row) => {
            if (row.kind === 'hunk') {
              return (
                <div key={row.index} className="bg-info/8 px-2.5 py-0.5 text-info">
                  {row.text}
                </div>
              );
            }
            if (row.kind === 'meta') {
              return (
                <div key={row.index} className="px-2.5 py-0.5 text-ink-500 italic">
                  {row.text}
                </div>
              );
            }
            const tint =
              row.kind === 'add'
                ? 'bg-ok/8'
                : row.kind === 'del'
                  ? 'bg-danger/8'
                  : '';
            const sign = row.kind === 'add' ? '+' : row.kind === 'del' ? '−' : ' ';
            const signColor =
              row.kind === 'add' ? 'text-ok' : row.kind === 'del' ? 'text-danger' : 'text-ink-600';

            return (
              <div key={row.index} className={`flex ${tint}`}>
                <span className="w-10 shrink-0 select-none px-1 text-right text-ink-600 tabular-nums">
                  {row.old ?? ''}
                </span>
                <span className="w-10 shrink-0 select-none px-1 text-right text-ink-600 tabular-nums">
                  {row.next ?? ''}
                </span>
                <span className={`w-4 shrink-0 select-none text-center ${signColor}`}>{sign}</span>
                <span className="min-w-0 flex-1 whitespace-pre-wrap break-words pr-2.5">
                  {highlight(row.text, lang).map((token, i) => (
                    <span key={i} className={token.cls}>
                      {token.text}
                    </span>
                  ))}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function DiffView({
  taskId,
  refreshKey,
  onOpenTerminal,
}: {
  taskId: string;
  refreshKey: number;
  onOpenTerminal?: () => void;
}) {
  const [diff, setDiff] = useState<TaskDiff | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  const load = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/tasks/${taskId}/diff`)
      .then((r) => r.json())
      .then((body) => {
        if (cancelled) return;
        if (body.error) setError(body.error as string);
        else {
          setDiff(body as TaskDiff);
          setError(null);
        }
      })
      .catch((err) => !cancelled && setError(String(err)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [taskId, refreshKey, nonce]);

  const files = useMemo(() => splitPatch(diff?.patch ?? ''), [diff?.patch]);
  const statsByPath = useMemo(
    () => new Map((diff?.files ?? []).map((f) => [f.path, f])),
    [diff?.files],
  );

  const totalAdded = diff?.files.reduce((n, f) => n + f.added, 0) ?? 0;
  const totalDeleted = diff?.files.reduce((n, f) => n + f.deleted, 0) ?? 0;
  const changed = diff?.files.length ?? 0;

  return (
    <div className="flex h-full min-h-0 flex-col border-l border-ink-700 bg-ink-900">
      <PaneHeader
        icon="diff"
        title="Diff"
        meta={
          changed > 0 ? (
            <span className="tabular-nums">
              {changed} file{changed === 1 ? '' : 's'} <span className="text-ok">+{totalAdded}</span>{' '}
              <span className="text-danger">−{totalDeleted}</span>
            </span>
          ) : undefined
        }
      >
        {loading && <Spinner size={12} />}
        {diff?.patch && <CopyButton text={diff.patch} size="xs" title="Copy full patch" />}
        <IconButton icon="refresh" title="Reload diff" size="xs" onClick={load} />
      </PaneHeader>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {error && (
          <div className="m-3 rounded-md border border-danger/35 bg-danger/8 px-3 py-2 text-[11.5px] text-danger">
            {error}
          </div>
        )}

        {!error && changed === 0 && !loading && (
          <EmptyState
            icon="diff"
            title="No changes yet"
            hint="Nothing has been written in this worktree. The diff is taken against the merge base, so it updates as soon as the agent touches a file."
          >
            {onOpenTerminal && (
              <Button size="sm" icon="terminal" onClick={onOpenTerminal}>
                Open the terminal here
              </Button>
            )}
          </EmptyState>
        )}

        {diff && diff.untracked.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 border-b border-ink-800 bg-ink-850/50 px-2.5 py-1.5">
            <Badge tone="info">
              <Icon name="plus" size={10} />
              {diff.untracked.length} new
            </Badge>
            {diff.untracked.slice(0, 6).map((path) => (
              <span key={path} className="truncate font-mono text-[10.5px] text-ink-400">
                {path}
              </span>
            ))}
            {diff.untracked.length > 6 && (
              <span className="text-[10.5px] text-ink-500">+{diff.untracked.length - 6} more</span>
            )}
          </div>
        )}

        {files.map((file) => {
          const stats = statsByPath.get(file.path);
          return (
            <FileDiff
              key={file.path}
              file={file}
              stats={stats ? { added: stats.added, deleted: stats.deleted } : undefined}
            />
          );
        })}

        {diff?.truncated && (
          <p className="border-t border-ink-700 px-3 py-2 text-[11px] text-warn">
            Patch truncated at 2MB. Inspect the worktree directly for the rest.
          </p>
        )}
      </div>
    </div>
  );
}
