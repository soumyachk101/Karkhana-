import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getConfig } from './config.ts';
import { holder } from './singleton.ts';

// See lib/singleton.ts: two module instances plus HMR means a module-level
// `let` would give us several SQLite handles on one file.
const state = holder<{ db?: Database.Database }>('db');

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
  return (state.db ??= open());
}

export function closeDb(): void {
  state.db?.close();
  state.db = undefined;
}

/** Short, sortable, human-greppable ids: `t_ltz3k9x_4f2a`. */
export function newId(prefix: string): string {
  const time = Date.now().toString(36);
  const rand = Math.random().toString(16).slice(2, 6);
  return `${prefix}_${time}_${rand}`;
}
