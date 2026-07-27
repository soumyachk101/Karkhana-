import '../lib/testHelpers/env.ts';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { checkClaudeBinary, getConfig, updateConfig, type KarkhanaConfig } from './config.ts';
import { holder } from './singleton.ts';

const configPath = path.join(process.env.KARKHANA_HOME!, 'karkhana.config.json');

/** Config is a process-wide singleton (see lib/singleton.ts) — each test that
 * cares about a clean slate resets both the in-memory cache and the file. */
function resetConfig(): void {
  holder<{ config?: KarkhanaConfig }>('config').config = undefined;
  fs.rmSync(configPath, { force: true });
}

await test('getConfig returns defaults and persists them to disk on first read', () => {
  resetConfig();
  const config = getConfig();
  assert.equal(config.concurrency, 10);
  assert.equal(config.worktreeRoot, null);
  assert.ok(fs.existsSync(configPath));
  const onDisk = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  assert.equal(onDisk.concurrency, 10);
});

await test('updateConfig merges a patch and persists it; getConfig reflects the cached value', () => {
  resetConfig();
  getConfig();
  const updated = updateConfig({ concurrency: 5 });
  assert.equal(updated.concurrency, 5);
  assert.equal(getConfig().concurrency, 5);
  const onDisk = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  assert.equal(onDisk.concurrency, 5);
});

await test('updateConfig clamps a non-numeric concurrency instead of persisting it verbatim', () => {
  resetConfig();
  getConfig();
  // Regression test: `{"concurrency": "abc"}` used to pass the `< 1` clamp
  // unscathed ("abc" < 1 is false) and get written to disk, after which the
  // orchestrator's `active.size < limit` was `0 < "abc"` — also false — so no
  // task ever started again, across restarts.
  const updated = updateConfig({ concurrency: 'abc' as unknown as number });
  assert.equal(updated.concurrency, 1);
  assert.equal(typeof updated.concurrency, 'number');
  const onDisk = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  assert.equal(onDisk.concurrency, 1);
});

await test('updateConfig clamps concurrency below 1, and floors a fractional value', () => {
  resetConfig();
  getConfig();
  assert.equal(updateConfig({ concurrency: 0 }).concurrency, 1);
  assert.equal(updateConfig({ concurrency: -5 }).concurrency, 1);
  assert.equal(updateConfig({ concurrency: 2.7 }).concurrency, 2);
});

await test('updateConfig ignores a non-string claudeBinPath rather than persisting garbage', () => {
  resetConfig();
  const before = getConfig().claudeBinPath;
  const updated = updateConfig({ claudeBinPath: 42 as unknown as string });
  assert.equal(updated.claudeBinPath, before);
});

await test('updateConfig accepts worktreeRoot as a string or an explicit null', () => {
  resetConfig();
  getConfig();
  assert.equal(updateConfig({ worktreeRoot: '/tmp/somewhere' }).worktreeRoot, '/tmp/somewhere');
  assert.equal(updateConfig({ worktreeRoot: null }).worktreeRoot, null);
});

await test('checkClaudeBinary reports a clear reason when no binary is configured', () => {
  resetConfig();
  getConfig();
  updateConfig({ claudeBinPath: '', antigravityBinPath: '', codexBinPath: '' });
  const result = checkClaudeBinary();
  assert.equal(result.ok, false);
  assert.match(result.reason ?? '', /no agent runner binary/i);
});

await test('checkClaudeBinary reports a clear reason when the configured path is not executable', () => {
  resetConfig();
  getConfig();
  const notExecutable = path.join(process.env.KARKHANA_HOME!, 'not-a-binary');
  fs.writeFileSync(notExecutable, 'nope');
  updateConfig({ claudeBinPath: notExecutable, antigravityBinPath: '', codexBinPath: '' });
  const result = checkClaudeBinary();
  assert.equal(result.ok, false);
  assert.match(result.reason ?? '', /missing or not executable/);
});
