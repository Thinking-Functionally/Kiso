import { describe, it, expect } from 'vitest';
import { runKisoAs } from './helpers/build-wasm.js';

const withHost = (src: string, host = {}) => runKisoAs(src, { host });

describe('host/ functions (Node host)', () => {
  it('host/args returns a list of strings or nil', async () => {
    const r = await withHost('(defn -main [] (prn (host/args)))', { args: ['a', 'b c'] });
    r.runMain();
    expect(r.output).toBe('("a" "b c")\n');
    const e = await withHost('(defn -main [] (prn (host/args)))', { args: [] });
    e.runMain();
    expect(e.output).toBe('nil\n');
  });
  it('host/env', async () => {
    const r = await withHost('(defn -main [] (prn (host/env "HOME") (host/env "NOPE")))', { env: { HOME: '/h' } });
    r.runMain();
    expect(r.output).toBe('"/h" nil\n');
  });
  it('host/read-file and host/write-file', async () => {
    const files: Record<string, string> = { in: 'hello' };
    const r = await withHost('(defn -main [] (prn (host/read-file "in") (host/read-file "missing") (host/write-file "out" "x")))', {
      readFile: (p: string) => {
        if (!(p in files)) throw new Error('ENOENT');
        return files[p]!;
      },
      writeFile: (p: string, c: string) => void (files[p] = c),
    });
    r.runMain();
    expect(r.output).toBe('"hello" nil true\n');
    expect(files.out).toBe('x');
  });
  it('host/stdin and host/now', async () => {
    const r = await withHost('(defn -main [] (prn (host/stdin) (host/now)))', { stdin: () => 'in!', now: () => 42 });
    r.runMain();
    expect(r.output).toBe('"in!" 42\n');
  });
  it('host calls work at top level (during start)', async () => {
    const r = await withHost('(def a (host/args))\n(prn (first a))', { args: ['x'] });
    expect(r.output).toBe('"x"\n');
  });
  it('host/exit stops the program with a code', async () => {
    const r = await withHost('(defn -main [] (println "a") (host/exit 3) (println "b"))');
    expect(r.runMain()).toBe(3);
    expect(r.output).toBe('a\n');
  });
  it('rejects unknown host functions and wrong arity', async () => {
    await expect(withHost('(host/nope)')).rejects.toThrow(/unknown host function/);
    await expect(withHost('(host/env)')).rejects.toThrow(/expects 1/);
  });
});
