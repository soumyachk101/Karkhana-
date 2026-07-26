import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  extractSessionId,
  normalizeEvent,
  parseResult,
  StreamJsonParser,
} from './streamParser.ts';

test('StreamJsonParser reassembles a JSON object split across pushes', () => {
  const parser = new StreamJsonParser();
  const line = JSON.stringify({ type: 'assistant', text: 'hello world' });
  const third = Math.floor(line.length / 3);

  assert.deepEqual(parser.push(line.slice(0, third)), []);
  assert.deepEqual(parser.push(line.slice(third, third * 2)), []);
  const out = parser.push(`${line.slice(third * 2)}\n`);

  assert.equal(out.length, 1);
  assert.deepEqual(out[0], { ok: true, event: JSON.parse(line) });
});

test('StreamJsonParser.flush returns a trailing line with no newline', () => {
  const parser = new StreamJsonParser();
  assert.deepEqual(parser.push('{"type":"a"}\n{"type":"b"}'), [
    { ok: true, event: { type: 'a' } },
  ]);
  assert.deepEqual(parser.flush(), [{ ok: true, event: { type: 'b' } }]);
});

test('StreamJsonParser.flush on an empty buffer returns nothing', () => {
  const parser = new StreamJsonParser();
  parser.push('{"type":"a"}\n');
  assert.deepEqual(parser.flush(), []);
});

test('a malformed line surfaces as ok:false instead of being dropped', () => {
  const parser = new StreamJsonParser();
  const out = parser.push('not json at all\n{"type":"ok"}\n');
  assert.deepEqual(out, [
    { ok: false, line: 'not json at all' },
    { ok: true, event: { type: 'ok' } },
  ]);
});

test('normalizeEvent drops commands_changed and thinking_tokens frames', () => {
  assert.equal(normalizeEvent({ type: 'system', subtype: 'commands_changed', huge: 'x'.repeat(1000) }), null);
  assert.equal(normalizeEvent({ type: 'system', subtype: 'thinking_tokens' }), null);
});

test('normalizeEvent drops noise types entirely', () => {
  assert.equal(normalizeEvent({ type: 'active_goal' }), null);
  assert.equal(normalizeEvent({ type: 'rate_limit_event' }), null);
});

test('normalizeEvent reduces system/init to the keep-list', () => {
  const event = {
    type: 'system',
    subtype: 'init',
    session_id: 's1',
    cwd: '/tmp',
    model: 'sonnet',
    permissionMode: 'default',
    tools: ['Read'],
    mcp_servers: [],
    claude_code_version: '1.0.0',
    apiKeySource: 'env',
    output_style: 'default',
    slash_commands: ['/a', '/b', '/c'],
    agents: ['huge inventory dropped'],
  };
  const normalized = normalizeEvent(event);
  assert.deepEqual(normalized, {
    type: 'system',
    subtype: 'init',
    session_id: 's1',
    cwd: '/tmp',
    model: 'sonnet',
    permissionMode: 'default',
    tools: ['Read'],
    mcp_servers: [],
    claude_code_version: '1.0.0',
    apiKeySource: 'env',
    output_style: 'default',
  });
  assert.ok(!('slash_commands' in normalized!));
  assert.ok(!('agents' in normalized!));
});

test('normalizeEvent strips nested thinking-block signatures', () => {
  const event = {
    type: 'assistant',
    message: {
      content: [
        { type: 'thinking', thinking: 'hmm', signature: 'a'.repeat(1024) },
        { type: 'text', text: 'hi' },
      ],
    },
  };
  const normalized = normalizeEvent(event) as typeof event;
  const content = normalized.message.content as Array<Record<string, unknown>>;
  assert.equal('signature' in content[0], false);
  assert.equal(content[0].thinking, 'hmm');
  assert.equal(content[1].text, 'hi');
});

test('normalizeEvent truncates payloads over 128KB', () => {
  const event = { type: 'user', message: { content: [{ type: 'tool_result', content: 'x'.repeat(200 * 1024) }] } };
  const normalized = normalizeEvent(event) as Record<string, unknown>;
  assert.equal(normalized._truncated, true);
  assert.equal(normalized.type, 'user');
  assert.ok(typeof normalized._original_bytes === 'number' && normalized._original_bytes > 128 * 1024);
  assert.ok(typeof normalized._preview === 'string' && normalized._preview.length <= 128 * 1024);
});

test('normalizeEvent leaves small payloads untouched', () => {
  const event = { type: 'result', is_error: false, result: 'done' };
  assert.deepEqual(normalizeEvent(event), event);
});

test('extractSessionId returns null for missing, empty, or non-string ids', () => {
  assert.equal(extractSessionId({}), null);
  assert.equal(extractSessionId({ session_id: '' }), null);
  assert.equal(extractSessionId({ session_id: 42 as unknown as string }), null);
  assert.equal(extractSessionId({ session_id: 'abc123' }), 'abc123');
});

test('parseResult coerces non-numeric duration_ms and num_turns to null', () => {
  const summary = parseResult({
    type: 'result',
    is_error: true,
    subtype: 'error_max_turns',
    result: 'stopped',
    duration_ms: '123' as unknown as number,
    num_turns: null as unknown as number,
    total_cost_usd: 0.05,
  });
  assert.deepEqual(summary, {
    isError: true,
    subtype: 'error_max_turns',
    result: 'stopped',
    durationMs: null,
    numTurns: null,
    totalCostUsd: 0.05,
  });
});
