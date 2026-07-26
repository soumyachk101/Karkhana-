#!/usr/bin/env node
// Stand-in for the real `claude` binary, used by orchestrator/runner tests so
// they never spawn a real agent or spend an API call. Emits the same
// stream-json shapes the real CLI does, driven by a JSON directive smuggled
// through the `-p` prompt (see lib/testHelpers/harness.ts `fakePrompt`).
//
// Unrecognised or plain-text prompts fall back to a fast, clean success — so
// this also works as a generic "just finish quickly" stub.

const args = process.argv.slice(2);
const arg = (flag) => {
  const i = args.indexOf(flag);
  return i === -1 ? undefined : args[i + 1];
};

const prompt = arg('-p') ?? '';
const model = arg('--model') ?? 'sonnet';
const resumedSessionId = arg('--resume');

let directive = {};
try {
  directive = JSON.parse(prompt);
} catch {
  /* not a directive — use defaults */
}

const {
  exitCode = 0,
  isError = false,
  delayMs = 20,
} = directive;
const sessionId = resumedSessionId ?? `fake-${process.pid}-${Date.now().toString(36)}`;

const emit = (obj) => process.stdout.write(`${JSON.stringify(obj)}\n`);

emit({
  type: 'system',
  subtype: 'init',
  session_id: sessionId,
  model,
  cwd: process.cwd(),
  permissionMode: 'default',
  tools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'],
});

setTimeout(() => {
  emit({
    type: 'assistant',
    session_id: sessionId,
    message: { content: [{ type: 'text', text: 'fake agent did some work' }] },
  });
  emit({
    type: 'result',
    session_id: sessionId,
    subtype: isError ? 'error_max_turns' : 'success',
    is_error: isError,
    result: isError ? 'hit the fake limit' : 'done',
    duration_ms: delayMs,
    num_turns: 1,
    total_cost_usd: 0.001,
  });
  process.exit(exitCode);
}, delayMs);
