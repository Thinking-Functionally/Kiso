import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { WasmLinker, parseSig } from '../../src/runtime/wasm-link.js';
import { compile } from '../../src/api/compiler.js';

const bytes = readFileSync(new URL('../fixtures/ffi_fixture.wasm', import.meta.url));

describe('parseSig', () => {
  it('parses arguments and return', () => {
    expect(parseSig('ii>i')).toEqual({ args: ['i', 'i'], ret: 'i' });
    expect(parseSig('>v')).toEqual({ args: [], ret: 'v' });
  });
  it('rejects malformed signatures', () => {
    expect(() => parseSig('ii')).toThrow(/invalid signature/);
    expect(() => parseSig('x>i')).toThrow(/unsupported argument type/);
  });
});

describe('WasmLinker', () => {
  const linker = new WasmLinker();
  linker.register('fx', bytes);

  it('calls scalars and strings', () => {
    expect(linker.call('fx', 'add', 'ii>i', [2, 3])).toBe(5);
    expect(linker.call('fx', 'is_even', 'i>b', [4])).toBe(true);
    expect(linker.call('fx', 'upper', 's>s', ['héllo'])).toBe('HÉLLO');
  });
  it('reports unknown modules, exports and arity', () => {
    expect(() => linker.call('nope', 'add', 'ii>i', [1, 2])).toThrow(/not registered/);
    expect(() => linker.call('fx', 'missing', 'ii>i', [1, 2])).toThrow(/no export "missing"/);
    expect(() => linker.call('fx', 'add', 'ii>i', [1])).toThrow(/expects 2/);
  });
  it('rejects wrong argument types', () => {
    expect(() => linker.call('fx', 'add', 'ii>i', [1, 'x'])).toThrow(/expects a number/);
    expect(() => linker.call('fx', 'upper', 's>s', [1])).toThrow(/must be a string/);
  });
  it('turns a packed 0 into an error with the module message', () => {
    expect(() => linker.call('fx', 'fail_always', '>s', [])).toThrow(/fail_always failed: fixture failure/);
  });
  it('marshals typed arrays in both directions', () => {
    expect(linker.call('fx', 'sum_f64s', 'D>d', [[1.5, 2.5]])).toBe(4);
    expect(linker.call('fx', 'sum_i32s', 'I>i', [new Int32Array([1, 2, 3])])).toBe(6);
    expect([...(linker.call('fx', 'rev_i32s', 'I>I', [[1, 2, 3]]) as Int32Array)]).toEqual([3, 2, 1]);
    expect([...(linker.call('fx', 'echo_bytes', 'B>B', [[0, 255]]) as Uint8Array)]).toEqual([0, 255]);
    expect((linker.call('fx', 'echo_bytes', 'B>B', [[]]) as Uint8Array).length).toBe(0);
  });
  it('rejects non-array values for array arguments', () => {
    expect(() => linker.call('fx', 'sum_f64s', 'D>d', ['abc'])).toThrow(/array of numbers/);
    expect(() => linker.call('fx', 'sum_f64s', 'D>d', [null])).toThrow(/array of numbers/);
  });
  it('surfaces module errors for array results', () => {
    expect(() => linker.call('fx', 'mean_and_max', 'D>D', [[]])).toThrow(/empty input/);
  });
  it('registers asynchronously', async () => {
    const l = new WasmLinker();
    await l.registerAsync('fx', bytes);
    expect(l.call('fx', 'add', 'ii>i', [1, 1])).toBe(2);
  });
});

describe('defwasm', () => {
  it('rejects unsupported types at compile time', () => {
    expect(() => compile('(defwasm f "m" [:i64] :i32)', { target: 'js' })).toThrow(/unsupported type :i64/);
  });
  it('wraps :edn arguments in pr-str and results in read-string', () => {
    const js = compile('(defwasm q "m" [:edn :i32] :edn)', { target: 'js' }).code;
    expect(js).toMatch(/read_string/);
    expect(js).toMatch(/pr_str/);
    expect(js).toContain('"si>s"');
  });
  it('uses the munged name as the export unless given', () => {
    const js = compile('(defwasm is-even "m" [:i32] :bool)\n(defwasm f "m" "other" [] :nil)', { target: 'js' }).code;
    expect(js).toContain('"is_even"');
    expect(js).toContain('"other"');
    expect(js).toContain('">v"');
  });
});
