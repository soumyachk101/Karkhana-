import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getConfig } from './config.ts';

// Next's dev server re-evaluates modules on HMR, and the custom server imports
// this module too. Cache on globalThis so we never end up with two SQLite
// handles (or two orchestrators) fighting over the same file.
const GLOBAL_KEY = Symbol.for('karkhana.db');
type Holder = { db?: Database.Database };
const holder = ((globalThis as Record<symbol, unknown>)[GLOBAL_KEY] ??= {} as Holder) as Holder;

const HERE = path.dirname(fileURLToPath(import.meta.url));

function open(): Database.Database {
  const { dbPath } = getConfig();
  const db = new Database(dbPath);

  // WAL lets the UI read while an agent's events are being written.
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  db.exec(fs.readFileSync(path.join(HERE, 'schema.sql'), 'utf8'));
  return db;
}

export function getDb(): Database.Database {
  return (holder.db ??= open());
}

export function closeDb(): void {
  holder.db?.close();
  holder.db = undefined;
}

/** Short, sortable, human-greppable ids: `t_ltz3k9x_4f2a`. */
export function newId(prefix: string): string {
  const time = Date.now().toString(36);
  const rand = Math.random().toString(16).slice(2, 6);
  return `${prefix}_${time}_${rand}`;
}
