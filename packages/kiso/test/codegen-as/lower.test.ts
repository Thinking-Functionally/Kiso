import { describe, it, expect } from 'vitest';
import { lowerModule, AsUnsupportedError } from '../../src/codegen-as/lower.js';
import type { Node } from '../../src/analyzer/node.js';

describe('lowerModule: JS-only node rejection', () => {
  it('rejects js-raw with the construct name and node index', () => {
    const nodes: Node[] = [
      { type: 'def', name: 'x', init: { type: 'literal', value: 1, jsType: 'number' }, doc: null },
      { type: 'js-raw', code: 'window.alert(1)' },
    ];
    expect(() => lowerModule(nodes)).toThrow(AsUnsupportedError);
    try {
      lowerModule(nodes);
    } catch (e) {
      const err = e as AsUnsupportedError;
      expect(err.construct).toBe('js-raw');
      expect(err.nodeIndex).toBe(1);
    }
  });

  const num = (v: number): Node => ({ type: 'literal', value: v, jsType: 'number' });
  const ref = (name: string): Node => ({ type: 'var-ref', name, local: false });

  it('finds JS-only nodes nested inside supported nodes', () => {
    const nodes: Node[] = [
      { type: 'def', name: 'f', doc: null, init: {
        type: 'fn', name: null, arities: [{ params: ['x'], restParam: null, body: {
          type: 'if', test: ref('x'), then: num(1),
          else: { type: 'interop-call', target: ref('x'), method: 'foo', args: [] },
        } }],
      } },
    ];
    expect(() => lowerModule(nodes)).toThrowError(/interop-call/);
  });

  it.each([
    ['js-array', { type: 'js-array', items: [] }],
    ['js-object', { type: 'js-object', keys: [], vals: [] }],
    ['interop-field', { type: 'interop-field', target: ref('x'), field: 'a' }],
    ['js/ reference', ref('js/window')],
    ['new', { type: 'new', ctor: ref('js/Date'), args: [] }],
  ] as [string, Node][])('rejects %s', (construct, node) => {
    expect(() => lowerModule([node])).toThrowError(new RegExp(construct.replace('/', '\\/')));
  });

  it('accepts set! on a var and rejects set! on interop targets', () => {
    expect(() => lowerModule([{ type: 'set!', target: ref('*x*'), value: num(1) }])).not.toThrow();
    const field: Node = { type: 'interop-field', target: ref('o'), field: 'a' };
    expect(() => lowerModule([{ type: 'set!', target: field, value: num(1) }])).toThrow(AsUnsupportedError);
  });

  it('passes supported nodes through unchanged', () => {
    const nodes: Node[] = [
      { type: 'def', name: 'x', init: { type: 'vector', items: [num(1), num(2)] }, doc: null },
      { type: 'invoke', fn: ref('inc'), args: [num(1)] },
    ];
    expect(lowerModule(nodes)).toEqual(nodes);
  });
});
