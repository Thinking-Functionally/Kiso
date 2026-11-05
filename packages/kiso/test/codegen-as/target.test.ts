import { describe, it, expect } from 'vitest';
import { compile } from '../../src/api/compiler.js';
import { CompileError } from '../../src/api/errors.js';
import { parseArgs } from '../../src/cli/args.js';

function catchErr(fn: () => unknown): CompileError {
  try {
    fn();
  } catch (e) {
    return e as CompileError;
  }
  throw new Error('expected throw');
}

describe('compile target option', () => {
  it('defaults to js', () => {
    expect(compile('(def x 1)').code).toContain('x');
  });

  it("reports JS-only constructs with source location for target 'as'", () => {
    const err = catchErr(() => compile('(def a 1)\n(js* "window.alert(1)")', { target: 'as', filename: 'a.cljs' }));
    expect(err).toBeInstanceOf(CompileError);
    expect(err.phase).toBe('codegen');
    expect(err.message).toMatch(/js-raw/);
    expect(err.line).toBe(2);
    expect(err.filename).toBe('a.cljs');
  });

  it("reports missing required entry points for target 'as'", () => {
    const err = catchErr(() => compile('(defn a [] 1)', { target: 'as', exports: ['handle'] }));
    expect(err.message).toMatch(/handle/);
    expect(err.message).toMatch(/a/);
  });

  it("fails clearly while the AS emitter is not implemented", () => {
    const err = catchErr(() => compile('(def a 1)', { target: 'as' }));
    expect(err.message).toMatch(/not implemented/i);
  });
});

describe('cli --target', () => {
  it('parses --target as and defaults to js', () => {
    const a = parseArgs(['compile', 'x.cljs', '--target', 'as']);
    expect(a.command === 'compile' && a.target).toBe('as');
    const b = parseArgs(['compile', 'x.cljs']);
    expect(b.command === 'compile' && b.target).toBe('js');
  });

  it('parses repeated --export', () => {
    const a = parseArgs(['compile', 'x.cljs', '--target', 'as', '--export', 'main', '--export', 'handle']);
    expect(a.command === 'compile' && a.exports).toEqual(['main', 'handle']);
  });

  it('rejects unknown targets', () => {
    expect(() => parseArgs(['compile', 'x.cljs', '--target', 'wat'])).toThrow(/target/);
  });
});
