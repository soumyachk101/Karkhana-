import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Every test file that touches `lib/config.ts` (directly or transitively)
 * must import this FIRST, before any other karkhana module.
 *
 * `config.ts` reads `process.env.KARKHANA_HOME` into a top-level `const` at
 * import time, so setting the env var after that module has already been
 * evaluated is a no-op — it would silently point tests at this repo's real
 * `karkhana.config.json` / `karkhana.db` instead of a throwaway directory.
 */
process.env.KARKHANA_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'karkhana-test-'));
