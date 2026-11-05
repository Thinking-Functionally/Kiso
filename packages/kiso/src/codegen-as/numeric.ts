// Numeric specialization (D19): functions provably made only of f64 arithmetic get a native
// `nf_<id>(f64…): f64` twin. The boxed Fn class calls it when every argument is a Num,
// otherwise it falls back to the generic body, so semantics are unchanged.

import type { LExpr, LFunction, LStmt } from './lowered.js';
import { mangle } from './mangle.js';

const ARITH = new Set(['+', '-', '*', '/', 'mod', 'rem', 'inc', 'dec']);
const CMP: Record<string, string> = { '<': '<', '>': '>', '<=': '<=', '>=': '>=', '=': '==' };
const PRED: Record<string, string> = { 'zero?': '== 0', 'pos?': '> 0', 'neg?': '< 0' };

export function nativeName(fn: LFunction): string {
  return `nf_${fn.id}`;
}

function isCore(e: LExpr, globals: Set<string>): string | null {
  return e.type === 'var' && e.kind === 'global' && !globals.has(e.name) ? e.name : null;
}

export class NumericCheck {
  constructor(private fn: LFunction, private globals: Set<string>) {}

  private num(e: LExpr, locals: Set<string>): boolean {
    switch (e.type) {
      case 'literal':
        return e.jsType === 'number';
      case 'var':
        return e.kind === 'local' && locals.has(e.name);
      case 'invoke': {
        if (e.fn.type === 'var' && e.fn.kind === 'self') {
          return e.args.length === this.fn.arities[0]!.params.length && e.args.every((a) => this.num(a, locals));
        }
        const core = isCore(e.fn, this.globals);
        if (!core || !e.args.every((a) => this.num(a, locals))) return false;
        if (core === '+' || core === '*') return true;
        if (core === '-') return e.args.length >= 1;
        if (core === 'inc' || core === 'dec') return e.args.length === 1;
        return ARITH.has(core) && e.args.length === 2;
      }
      default:
        return false;
    }
  }

  private test(e: LExpr, locals: Set<string>): boolean {
    if (e.type === 'literal') return e.jsType === 'boolean';
    if (e.type !== 'invoke') return false;
    const core = isCore(e.fn, this.globals);
    if (!core) return false;
    if (core in CMP) return e.args.length === 2 && e.args.every((a) => this.num(a, locals));
    if (core in PRED) return e.args.length === 1 && this.num(e.args[0]!, locals);
    if (core === 'not') return e.args.length === 1 && this.test(e.args[0]!, locals);
    return false;
  }

  private stmts(list: LStmt[], locals: Set<string>): boolean {
    for (const s of list) {
      switch (s.type) {
        case 'let':
          locals.add(s.name);
          if (s.init && !this.num(s.init, locals)) return false;
          break;
        case 'assign':
          if (!locals.has(s.name) || !this.num(s.value, locals)) return false;
          break;
        case 'if':
          if (!this.test(s.test, locals) || !this.stmts(s.then, locals) || !this.stmts(s.else, locals)) return false;
          break;
        case 'loop':
          if (!this.stmts(s.body, locals)) return false;
          break;
        case 'break':
        case 'continue':
          break;
        case 'return':
          if (!this.num(s.value, locals)) return false;
          break;
        default:
          return false;
      }
    }
    return true;
  }

  ok(): boolean {
    const f = this.fn;
    if (f.captures.length > 0 || f.fields.length > 0 || f.arities.length !== 1) return false;
    const ar = f.arities[0]!;
    if (ar.restParam !== null || ar.params.length === 0) return false;
    return this.stmts(ar.body, new Set(ar.params));
  }
}

export function emitNative(fn: LFunction): string[] {
  const ar = fn.arities[0]!;
  const ex = (e: LExpr): string => {
    switch (e.type) {
      case 'literal': {
        const n = e.value as number;
        return Number.isNaN(n) ? 'NaN' : n === Infinity ? 'Infinity' : n === -Infinity ? '-Infinity' : Number.isInteger(n) ? `${n}.0` : String(n);
      }
      case 'var':
        return `l_${mangle(e.name)}`;
      case 'invoke': {
        if (e.fn.type === 'var' && e.fn.kind === 'self') return `${nativeName(fn)}(${e.args.map(ex).join(', ')})`;
        const op = (e.fn as { name: string }).name;
        const a = e.args.map(ex);
        switch (op) {
          case '+': return a.length === 0 ? '0.0' : `(${a.join(' + ')})`;
          case '*': return a.length === 0 ? '1.0' : `(${a.join(' * ')})`;
          case '-': return a.length === 1 ? `(-${a[0]})` : `(${a.join(' - ')})`;
          case '/': return `(${a[0]} / ${a[1]})`;
          case 'rem': return `(${a[0]} % ${a[1]})`;
          case 'mod': return `nmod(${a[0]}, ${a[1]})`;
          case 'inc': return `(${a[0]} + 1.0)`;
          default: return `(${a[0]} - 1.0)`;
        }
      }
      default:
        throw new Error('unreachable: non-numeric expression');
    }
  };
  const tx = (e: LExpr): string => {
    if (e.type === 'literal') return e.value ? 'true' : 'false';
    const inv = e as Extract<LExpr, { type: 'invoke' }>;
    const op = (inv.fn as { name: string }).name;
    const a = inv.args;
    if (op === 'not') return `!${tx(a[0]!)}`;
    if (op in PRED) return `(${ex(a[0]!)} ${PRED[op]})`;
    return `(${ex(a[0]!)} ${CMP[op]} ${ex(a[1]!)})`;
  };
  const st = (list: LStmt[], ind: string): string[] =>
    list.flatMap((s): string[] => {
      switch (s.type) {
        case 'let': return [`${ind}let l_${mangle(s.name)}: f64 = ${s.init ? ex(s.init) : '0.0'};`];
        case 'assign': return [`${ind}l_${mangle(s.name)} = ${ex(s.value)};`];
        case 'if': return [`${ind}if (${tx(s.test)}) {`, ...st(s.then, ind + '  '), `${ind}} else {`, ...st(s.else, ind + '  '), `${ind}}`];
        case 'loop': return [`${ind}while (true) {`, ...st(s.body, ind + '  '), `${ind}}`];
        case 'break': return [`${ind}break;`];
        case 'continue': return [`${ind}continue;`];
        case 'return': return [`${ind}return ${ex(s.value)};`];
        default: return [];
      }
    });
  return [
    `function ${nativeName(fn)}(${ar.params.map((p) => `l_${mangle(p)}: f64`).join(', ')}): f64 {`,
    ...st(ar.body, '  '),
    '  return 0.0;',
    '}',
  ];
}
