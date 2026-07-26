import assert from 'node:assert/strict';
import { test } from 'node:test';
import { describeToolInput, duration, relativeTime, toLogLines } from './format.ts';
import type { TaskEvent } from './types.ts';

function makeEvent(type: TaskEvent['type'], payload: unknown): TaskEvent {
  return {
    id: 1,
    task_id: 't1',
    type,
    payload_json: typeof payload === 'string' ? payload : JSON.stringify(payload),
    ts: Date.now(),
  };
}

test('toLogLines yields a single error line for unparseable payload_json', () => {
  const event = makeEvent('stderr', 'not json');
  const [line] = toLogLines(event);
  assert.equal(line.kind, 'error');
  assert.equal(line.body, 'not json');
});

test('toLogLines renders stderr events', () => {
  const [line] = toLogLines(makeEvent('stderr', { source: 'stderr', text: 'boom' }));
  assert.deepEqual(line, { kind: 'error', label: 'stderr', body: 'boom' });
});

test('toLogLines renders lifecycle events, flagging fail/orphan kinds as errors', () => {
  const [ok] = toLogLines(makeEvent('lifecycle', { kind: 'spawned', pid: 123, model: 'sonnet' }));
  assert.equal(ok.kind, 'meta');
  assert.equal(ok.body, 'pid 123 · sonnet');

  const [failed] = toLogLines(makeEvent('lifecycle', { kind: 'failed_to_start', error: 'nope' }));
  assert.equal(failed.kind, 'error');

  const [orphaned] = toLogLines(makeEvent('lifecycle', { kind: 'orphaned_by_restart' }));
  assert.equal(orphaned.kind, 'error');
});

test('toLogLines renders system/init as a session summary', () => {
  const [line] = toLogLines(
    makeEvent('system', { subtype: 'init', model: 'sonnet', tools: ['Read', 'Write'], permissionMode: 'default' }),
  );
  assert.equal(line.kind, 'meta');
  assert.equal(line.label, 'session');
  assert.equal(line.body, 'sonnet · 2 tools · default');
});

test('toLogLines renders a result event, success and failure', () => {
  const [ok] = toLogLines(
    makeEvent('result', { is_error: false, result: 'done', duration_ms: 1500, num_turns: 3, total_cost_usd: 0.02 }),
  );
  assert.equal(ok.kind, 'result');
  assert.equal(ok.label, 'done');
  assert.equal(ok.detail, '1.5s · 3 turns · $0.0200');

  const [failed] = toLogLines(makeEvent('result', { is_error: true, result: 'hit max turns' }));
  assert.equal(failed.kind, 'error');
  assert.equal(failed.label, 'failed');
});

test('toLogLines flattens assistant message content blocks', () => {
  const lines = toLogLines(
    makeEvent('assistant', {
      message: {
        content: [
          { type: 'text', text: 'hi there' },
          { type: 'thinking', thinking: 'pondering' },
          { type: 'tool_use', name: 'Read', input: { file_path: '/a/b/c.ts' } },
          { type: 'tool_result', content: 'file contents', is_error: false },
          { type: 'tool_result', content: 'boom', is_error: true },
        ],
      },
    }),
  );
  assert.equal(lines.length, 5);
  assert.deepEqual(lines[0], { kind: 'text', body: 'hi there' });
  assert.deepEqual(lines[1], { kind: 'thinking', body: 'pondering' });
  assert.equal(lines[2].kind, 'tool_use');
  assert.equal(lines[2].label, 'Read');
  assert.equal(lines[2].body, 'b/c.ts');
  assert.equal(lines[3].label, undefined);
  assert.equal(lines[4].label, 'error');
});

test('toLogLines falls back to a meta line for unrecognised event shapes', () => {
  const [line] = toLogLines(makeEvent('user' as TaskEvent['type'], { foo: 'bar' }));
  assert.equal(line.kind, 'meta');
  assert.equal(line.label, 'user');
});

test('describeToolInput covers Read/Write/Edit/Bash/Glob/Grep and the default branch', () => {
  assert.equal(describeToolInput('Read', { file_path: '/a/b/c.txt' }), 'b/c.txt');
  assert.equal(describeToolInput('Write', { file_path: '/a/b/c.txt' }), 'b/c.txt');
  assert.equal(
    describeToolInput('Edit', { file_path: '/x/y.ts', old_string: 'foo\nbar', new_string: 'baz' }),
    'x/y.ts  foo⏎bar → baz',
  );
  assert.equal(describeToolInput('Bash', { command: 'ls -la' }), 'ls -la');
  assert.equal(describeToolInput('Glob', { pattern: '*.ts', path: '/a/b' }), '*.ts in a/b');
  assert.equal(describeToolInput('Grep', { pattern: 'foo' }), 'foo');
  assert.equal(describeToolInput('SomeOtherTool', { x: 1 }), JSON.stringify({ x: 1 }));
  assert.equal(describeToolInput('Read', undefined), '');
});

test('relativeTime boundaries', () => {
  const now = Date.now();
  assert.equal(relativeTime(null), '');
  assert.equal(relativeTime(now - 59_000), '59s ago');
  assert.equal(relativeTime(now - 60_000), '1m ago');
  assert.equal(relativeTime(now - 59 * 60_000), '59m ago');
  assert.equal(relativeTime(now - 60 * 60_000), '1h ago');
  assert.equal(relativeTime(now - 23 * 3_600_000), '23h ago');
  assert.equal(relativeTime(now - 24 * 3_600_000), '1d ago');
});

test('duration boundaries', () => {
  assert.equal(duration(null, null), '');
  const from = 1_000_000;
  assert.equal(duration(from, from + 999), '999ms');
  assert.equal(duration(from, from + 1000), '1.0s');
  assert.equal(duration(from, from + 59_000), '59.0s');
  assert.equal(duration(from, from + 60_000), '1m 0s');
  assert.equal(duration(from, from + 61_000), '1m 1s');
});
