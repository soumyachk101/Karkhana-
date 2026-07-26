/**
 * Process-wide mutable state holders.
 *
 * Karkhana loads `lib/` through two different module systems at once: the
 * custom server imports these files via Node's ESM loader, while Next's route
 * handlers get them through the webpack bundle. Those are *separate module
 * instances* — a plain `let` at module scope exists twice, and each side sees
 * only its own copy. Next's dev HMR adds a third way to get duplicates.
 *
 * `Symbol.for()` keys live in the process-wide symbol registry, so a holder
 * fetched from either side is the same object. Anything that must be shared —
 * the DB handle, the event bus, the orchestrator, cached config, the boot
 * report — has to live in one of these, not in a module-level variable.
 */
export function holder<T extends object>(name: string): T {
  const key = Symbol.for(`karkhana.${name}`);
  const store = globalThis as Record<symbol, unknown>;
  return (store[key] ??= {}) as T;
}
