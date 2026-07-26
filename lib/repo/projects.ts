import path from 'node:path';
import { getDb, newId } from '../db.ts';
import { branchExists, guessDefaultBranch, isGitRepo, repoRoot } from '../git.ts';
import type { Project } from '../types.ts';

export function listProjects(): Project[] {
  return getDb().prepare('SELECT * FROM projects ORDER BY created_at ASC').all() as Project[];
}

export function getProject(id: string): Project | null {
  return (getDb().prepare('SELECT * FROM projects WHERE id = ?').get(id) as Project) ?? null;
}

export function getProjectByPath(p: string): Project | null {
  return (getDb().prepare('SELECT * FROM projects WHERE path = ?').get(p) as Project) ?? null;
}

/**
 * Registers a local repo. `dir` may point anywhere inside the repo; we store
 * the resolved root so worktree paths are stable.
 */
export async function createProject(input: {
  path: string;
  name?: string;
  baseBranch?: string;
}): Promise<Project> {
  const abs = path.resolve(input.path.replace(/^~(?=$|\/)/, process.env.HOME ?? '~'));

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
