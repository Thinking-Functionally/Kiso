import { describe, it, expect } from 'vitest';
import { readAllStr } from '../../src/reader/reader.js';
import { Analyzer } from '../../src/analyzer/analyzer.js';
import { lowerModule } from '../../src/codegen-as/lower.js';
import { AsUnsupportedError } from '../../src/codegen-as/supported.js';
import type { LModule, LStmt, LExpr, LFunction } from '../../src/codegen-as/lowered.js';

function lower(src: string): LModule {
  const analyzer = new Analyzer();
  return lowerModule(readAllStr(src).map((f) => analyzer.analyze(f)));
}

const types = (b: LStmt[]) => b.map((s) => s.type);
const fnOf = (m: LModule, id = 0): LFunction => m.functions[id]!;

function find(stmts: LStmt[], type: LStmt['type']): LStmt | undefined {
  for (const s of stmts) {
    if (s.type === type) return s;
    const kids: LStmt[][] =
      s.type === 'if' ? [s.then, s.else] : s.type === 'loop' ? [s.body] : s.type === 'try' ? [s.body, ...s.catches.map((c) => c.body)] : [];
    for (const k of kids) {
      const r = find(k, type);
      if (r) return r;
    }
  }
  return undefined;
}

describe('lowerModule: flattening (M1.8)', () => {
  it('rejects unsupported constructs', () => {
    expect(() => lower('(js* "1")')).toThrow(AsUnsupportedError);
  });

  it('flattens expression-position if into a temp', () => {
    const m = lower('(def x (if a 1 2))');
    expect(types(m.body)).toEqual(['let', 'if', 'def']);
    const def = m.body[2] as Extract<LStmt, { type: 'def' }>;
    expect(def.value).toMatchObject({ type: 'var', kind: 'local' });
  });

  it('spills earlier arguments when a later argument needs statements', () => {
    const m = lower('(f (g) (if a 1 2))');
    // global vars are spilled too: a later statement could rebind them
    expect(types(m.body)).toEqual(['let', 'let', 'let', 'if', 'expr']);
    const second = m.body[1] as Extract<LStmt, { type: 'let' }>;
    expect(second.init).toMatchObject({ type: 'invoke' });
  });

  it('keeps nested lets unique so shadowing is safe', () => {
    const m = lower('(let [x 1 x (inc x)] x)');
    const lets = m.body.filter((s) => s.type === 'let') as Extract<LStmt, { type: 'let' }>[];
    expect(new Set(lets.map((l) => l.name)).size).toBe(lets.length);
  });

  it('turns host/ calls into host-call', () => {
    const m = lower('(host/args)');
    expect((m.body[0] as Extract<LStmt, { type: 'expr' }>).expr).toMatchObject({ type: 'host-call', name: 'host/args' });
  });

  it('lowers throw to a throw statement', () => {
    expect(types(lower('(throw (ex-info "x" {}))').body)).toContain('throw');
  });

  it('lowers set! on a var to set-global', () => {
    expect(types(lower('(set! *x* 1)').body)).toContain('set-global');
  });
});

describe('lowerModule: closures (M1.6)', () => {
  it('captures enclosing locals by value', () => {
    const m = lower('(defn f [x] (fn [y] (+ x y)))');
    const inner = m.functions.find((f) => f.captures.length > 0)!;
    expect(inner.captures).toEqual(['x']);
    const body = JSON.stringify(inner.arities[0]!.body);
    expect(body).toContain('"kind":"captured"');
  });

  it('propagates captures through intermediate functions', () => {
    const m = lower('(fn [a] (fn [] (fn [] a)))');
    const withCaps = m.functions.filter((f) => f.captures.includes('a'));
    expect(withCaps.length).toBe(2);
  });

  it('does not capture globals', () => {
    const m = lower('(defn f [x] (fn [] (g x)))');
    const inner = m.functions.find((f) => f.captures.length > 0)!;
    expect(inner.captures).toEqual(['x']);
  });

  it('resolves a named fn self-reference', () => {
    const m = lower('(fn foo [n] (foo n))');
    expect(JSON.stringify(fnOf(m).arities[0]!.body)).toContain('"kind":"self"');
  });

  it('letfn creates closures together', () => {
    const m = lower('(letfn [(ev? [n] (od? n)) (od? [n] (ev? n))] (ev? 1))');
    const stmt = find(m.body, 'letfn') as Extract<LStmt, { type: 'letfn' }>;
    expect(stmt.bindings).toHaveLength(2);
    expect(m.functions.every((f) => f.captures.length === 1)).toBe(true);
  });
});

describe('lowerModule: tail position and recur (M1.7)', () => {
  it('lowers loop/recur to loop + continue/break', () => {
    const m = lower('(def r (loop [i 0] (if (< i 3) (recur (inc i)) i)))');
    const loop = find(m.body, 'loop') as Extract<LStmt, { type: 'loop' }>;
    expect(loop).toBeDefined();
    expect(find(loop.body, 'continue')).toBeDefined();
    expect(find(loop.body, 'break')).toBeDefined();
  });

  it('wraps fn arities that use recur in a loop', () => {
    const m = lower('(fn [n] (if (< n 1) n (recur (dec n))))');
    const body = fnOf(m).arities[0]!.body;
    expect(types(body)).toEqual(['loop']);
    expect(find(body, 'continue')).toBeDefined();
  });

  it('does not wrap arities without recur', () => {
    const m = lower('(fn [n] n)');
    expect(types(fnOf(m).arities[0]!.body)).toEqual(['return']);
  });

  it('rejects recur outside tail position', () => {
    expect(() => lower('(loop [i 0] (inc (recur i)))')).toThrowError(/recur/);
  });

  it('rejects recur across try', () => {
    expect(() => lower('(loop [i 0] (try (recur i) (catch :default e 1)))')).toThrowError(/recur/);
  });

  it('rejects recur with the wrong arity', () => {
    expect(() => lower('(loop [i 0] (recur 1 2))')).toThrowError(/recur/);
  });

  it('evaluates recur args into temps before assigning loop vars', () => {
    const m = lower('(loop [a 1 b 2] (if (> a 9) b (recur b (+ a b))))');
    const loop = find(m.body, 'loop') as Extract<LStmt, { type: 'loop' }>;
    const recurBranch = (loop.body.find((s) => s.type === 'if') as Extract<LStmt, { type: 'if' }>).else;
    expect(types(recurBranch)).toEqual(['let', 'let', 'assign', 'assign', 'continue']);
  });
});

describe('lowerModule: functions (M1.9)', () => {
  it('lowers multi-arity and variadic fns to separate arities', () => {
    const m = lower('(fn ([a] a) ([a b] b) ([a b & more] more))');
    const f = fnOf(m);
    expect(f.arities.map((a) => a.params.length)).toEqual([1, 2, 2]);
    expect(f.arities.map((a) => a.restParam !== null)).toEqual([false, false, true]);
  });

  it('closure expression references its function id', () => {
    const m = lower('(def f (fn [x] x))');
    const def = m.body[0] as Extract<LStmt, { type: 'def' }>;
    expect((def.value as LExpr)).toMatchObject({ type: 'closure', fnId: 0 });
  });
});

describe('lowerModule: try / case / types', () => {
  it('lowers try with catches in expression position', () => {
    const m = lower('(def v (try (f) (catch :default e 1)))');
    const t = find(m.body, 'try') as Extract<LStmt, { type: 'try' }>;
    expect(t.catches).toHaveLength(1);
    expect(types(m.body).at(-1)).toBe('def');
  });

  it('lowers case* to an if chain using =', () => {
    const m = lower('(case x 1 :a 2 :b :c)');
    expect(find(m.body, 'if')).toBeDefined();
    expect(JSON.stringify(m.body)).toContain('"name":"="');
  });

  it('resolves deftype fields as field vars inside methods', () => {
    const m = lower('(defprotocol P (area [this])) (deftype Sq [side] P (area [this] (* side side)))');
    const f = m.functions[0]!;
    expect(f.fields).toEqual(['side']);
    expect(JSON.stringify(f.arities[0]!.body)).toContain('"kind":"field"');
    expect(find(m.body, 'type-def')).toBeDefined();
  });
});
