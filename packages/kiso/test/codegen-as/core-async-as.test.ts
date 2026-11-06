import { describe, it, expect } from 'vitest';
import { runKisoAs } from './helpers/build-wasm.js';
import { ASYNC_CASES, ASYNC_NS } from '../codegen/core-async-cases.js';

describe('core.async (AS/wasm) matches the JS backend', () => {
  for (const [name, body, expected] of ASYNC_CASES) {
    it(name, async () => {
      const r = await runKisoAs(`${ASYNC_NS}(defn -main [] ${body})`, { host: { sleep: () => {} } });
      r.runMain();
      expect(r.output.trimEnd()).toBe(expected);
    }, 60_000);
  }
});
