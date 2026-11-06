// Clojure-style printing of runtime values (pr-str / str / println).

import { isList } from './list.js';
import { isVector } from './vector.js';
import { isHashMap } from './hash-map.js';
import { isArrayMap } from './array-map.js';
import { isSortedMap } from './sorted-map.js';
import { isHashSet } from './hash-set.js';
import { isSortedSet } from './sorted-set.js';
import { LazySeq } from './lazy-seq.js';
import { IndexedSeq, seq, first, next } from './seq.js';
import { isKeyword } from './keyword.js';
import { isSymbol } from './symbol.js';

const ESC: Record<string, string> = { '"': '\\"', '\\': '\\\\', '\n': '\\n', '\t': '\\t', '\r': '\\r', '\b': '\\b', '\f': '\\f' };

function seqItems(coll: unknown, readably: boolean): string[] {
  const out: string[] = [];
  let s = seq(coll as never);
  while (s !== null) {
    out.push(printStr(first(s as never), readably));
    s = next(s as never);
  }
  return out;
}

/** Print a value; `readably` quotes strings (pr-str) and prints nested strings the same way str does for collections. */
export function printStr(x: unknown, readably: boolean): string {
  if (x === null || x === undefined) return 'nil';
  if (typeof x === 'string') return readably ? `"${x.replace(/["\\\n\t\r\b\f]/g, (c) => ESC[c]!)}"` : x;
  if (typeof x === 'number') return Number.isNaN(x) ? '##NaN' : x === Infinity ? '##Inf' : x === -Infinity ? '##-Inf' : String(x);
  if (typeof x === 'boolean' || typeof x === 'bigint') return String(x);
  if (isKeyword(x) || isSymbol(x)) return String(x);
  if (isVector(x)) return `[${seqItems(x, readably).join(' ')}]`;
  if (isList(x) || x instanceof IndexedSeq || x instanceof LazySeq) return `(${seqItems(x, readably).join(' ')})`;
  if (isHashMap(x) || isArrayMap(x) || isSortedMap(x)) {
    const parts: string[] = [];
    (x as { forEach(f: (k: unknown, v: unknown) => void): void }).forEach((k, v) => parts.push(`${printStr(k, readably)} ${printStr(v, readably)}`));
    return `{${parts.join(', ')}}`;
  }
  if (isHashSet(x) || isSortedSet(x)) {
    const parts: string[] = [];
    (x as { forEach(f: (k: unknown) => void): void }).forEach((k) => parts.push(printStr(k, readably)));
    return `#{${parts.join(' ')}}`;
  }
  if (x instanceof RegExp) return readably ? `#"${x.source}"` : x.source;
  if (Array.isArray(x)) return `#js [${x.map((e) => printStr(e, readably)).join(' ')}]`;
  if (typeof x === 'function') return '#object[Function]';
  const o = x as { toString?: () => string };
  return typeof o.toString === 'function' && o.toString !== Object.prototype.toString ? o.toString() : String(x);
}

/** What str / print show for one argument: nil is empty for str, strings are raw, collections print readably. */
export function displayStr(x: unknown): string {
  if (x === null || x === undefined) return '';
  return printStr(x, typeof x !== 'string');
}
