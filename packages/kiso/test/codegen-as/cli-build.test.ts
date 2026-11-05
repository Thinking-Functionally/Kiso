import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from '../../src/cli/args.js';
import { buildCommand } from '../../src/cli/build-command.js';
import { instantiateKiso } from '../../src/host/node.js';

describe('cli: build/run args', () => {
  it('parses build', () => {
    expect(parseArgs(['build', 'a.cljs', '-o', 'a.wasm', '--runtime', 'stub'])).toMatchObject({ command: 'build', file: 'a.cljs', outFile: 'a.wasm', runtime: 'stub' });
  });
  it('parses run with program args after --', () => {
    expect(parseArgs(['run', 'a.cljs', '--', 'x', '--flag'])).toMatchObject({ command: 'run', programArgs: ['x', '--flag'] });
  });
  it('rejects bad runtime and missing file', () => {
    expect(() => parseArgs(['build', 'a.cljs', '--runtime', 'bogus'])).toThrow(/runtime/);
    expect(() => parseArgs(['run'])).toThrow(/exactly one/);
  });
});

describe('cli: build produces a runnable wasm file', () => {
  it('builds and runs', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kiso-'));
    const src = join(dir, 'app.cljs');
    writeFileSync(src, '(defn -main [] (println "built" (count (host/args))))');
    const out = await buildCommand({ file: src, outFile: null, runtime: 'stub', exports: [] });
    expect(existsSync(out)).toBe(true);
    let text = '';
    const inst = await instantiateKiso(readFileSync(out), { args: ['a', 'b'], write: (s) => void (text += s) });
    expect(inst.runMain()).toBe(0);
    expect(text).toBe('built 2\n');
  }, 60_000);
});
