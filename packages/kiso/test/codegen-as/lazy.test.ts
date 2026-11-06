import { describe, it, expect } from 'vitest';
import { runKisoAs } from './helpers/build-wasm.js';

// Value-level lazy seq/sort/for cases live in test/kiso/lazy_seq_test.cljs (run on both backends).
describe('AS lazy seqs: unsupported forms', () => {
  it('try is rejected with a clear message', async () => {
    await expect(runKisoAs('(defn -main [] (try 1 (catch js/Error e 2)))')).rejects.toThrow(/catchable exceptions/);
  }, 60_000);
});
