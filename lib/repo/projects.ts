import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getDb, newId } from '../db.ts';
import { branchExists, cloneRepo, guessDefaultBranch, isGitRepo, repoRoot } from '../git.ts';
import type { Project } from '../types.ts';

const REMOTE_URL_RE = /^(https?:\/\/|git@|ssh:\/\/|git:\/\/|file:\/\/)/;
/**
 * Where a pasted GitHub/remote URL gets cloned to, one directory per repo
 * name. Overridable the same way as `KARKHANA_HOME` (see lib/config.ts) —
 * mainly so tests don't clone into the real machine's home directory.
 */
const getCloneRoot = (): string => {
  if (process.env.KARKHANA_CLONE_ROOT) return process.env.KARKHANA_CLONE_ROOT;
  try {
    if (process.env.VERCEL || !fs.existsSync(os.homedir())) {
      return path.join('/tmp', 'karkhana-repos');
    }
  } catch {
    return path.join('/tmp', 'karkhana-repos');
  }
  return path.join(os.homedir(), 'karkhana-repos');
};

function repoNameFromUrl(url: string): string {
  const cleaned = url.trim().replace(/\.git$/, '').replace(/\/+$/, '');
  const last = cleaned.split(/[/:]/).pop() || 'repo';
  return last.replace(/[^a-zA-Z0-9._-]/g, '-') || 'repo';
}

/**
 * Resolves the `path` field of a project-creation request to a local
 * directory, cloning it first if it's a remote URL rather than a path
 * already on disk. Reuses an existing clone at the destination rather than
 * re-cloning over it.
 */
async function resolveLocalPath(input: string): Promise<string> {
  const trimmed = input.trim();
  if (!REMOTE_URL_RE.test(trimmed)) {
    return path.resolve(trimmed.replace(/^~(?=$|\/)/, process.env.HOME ?? '~'));
  }
  const destDir = path.join(getCloneRoot(), repoNameFromUrl(trimmed));
  if (!(await isGitRepo(destDir))) {
    await cloneRepo(trimmed, destDir);
  }
  return destDir;
}

export function listProjects(): Project[] {
  const rows = getDb().prepare('SELECT * FROM projects ORDER BY created_at ASC').all() as Project[];
  const seen = new Set<string>();
  const unique: Project[] = [];
  for (const p of rows) {
    if (!seen.has(p.path)) {
      seen.add(p.path);
      unique.push(p);
    }
  }
  return unique;
}

export function getProject(id: string): Project | null {
  return (getDb().prepare('SELECT * FROM projects WHERE id = ?').get(id) as Project) ?? null;
}

export function getProjectByPath(p: string): Project | null {
  return (getDb().prepare('SELECT * FROM projects WHERE path = ?').get(p) as Project) ?? null;
}

export function updateProjectBaseBranch(id: string, baseBranch: string): Project | null {
  getDb().prepare('UPDATE projects SET base_branch = ? WHERE id = ?').run(baseBranch, id);
  return getProject(id);
}

/**
 * Registers a repo. `input.path` may be a local path pointing anywhere inside
 * the repo, or a remote URL (`https://github.com/...`, `git@...`) — a remote
 * is cloned to `~/karkhana-repos/<name>` first. Either way we store the
 * resolved local root so worktree paths are stable.
 */
export async function createProject(input: {
  path: string;
  name?: string;
  baseBranch?: string;
}): Promise<Project> {
  const abs = await resolveLocalPath(input.path);

  if (!(await isGitRepo(abs))) {
    throw new Error(`${abs} is not a git repository.`);
  }
  const root = await repoRoot(abs);

  const existing = getProjectByPath(root);
  if (existing) throw new Error(`${root} is already registered as "${existing.name}".`);

  const project: Project = {
    id: newId('p'),
    name: input.name?.trim() || path.basename(root),
    path: root,
    base_branch: input.baseBranch?.trim() || (await guessDefaultBranch(root)),
    created_at: Date.now(),
  };

  getDb()
    .prepare(
      `INSERT INTO projects (id, name, path, base_branch, created_at)
       VALUES (@id, @name, @path, @base_branch, @created_at)`,
    )
    .run(project);

  return project;
}

export async function updateProject(
  id: string,
  patch: Partial<Pick<Project, 'name' | 'base_branch'>>,
): Promise<Project> {
  const current = getProject(id);
  if (!current) throw new Error(`No project ${id}`);

  // An unchecked typo here fails every subsequent createWorktree for this
  // project at task-creation time, far from the cause — check it up front.
  if (patch.base_branch && patch.base_branch !== current.base_branch) {
    if (!(await branchExists(current.path, patch.base_branch))) {
      throw new Error(`Branch "${patch.base_branch}" does not exist in ${current.path}.`);
    }
  }

  const next = { ...current, ...patch };
  getDb()
    .prepare('UPDATE projects SET name = @name, base_branch = @base_branch WHERE id = @id')
    .run(next);
  return next;
}

/** Cascades to tasks and events via FK. Worktree cleanup is the caller's job. */
export function deleteProject(id: string): void {
  getDb().prepare('DELETE FROM projects WHERE id = ?').run(id);
}
