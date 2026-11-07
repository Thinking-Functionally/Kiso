// Interop — clj->js, js->clj conversion functions.
//
// Converts between Kiso persistent data structures and plain JS values.

import { isKeyword, Keyword } from './keyword.js';
import { isVector, PersistentVector, vector } from './vector.js';
import { isHashMap, PersistentHashMap, hashMap } from './hash-map.js';
import { isHashSet, PersistentHashSet } from './hash-set.js';
import { isList, first, rest, count } from './list.js';
import { keyword } from './keyword.js';
import { toArray } from './seq.js';
import { LazySeq } from './lazy-seq.js';

/** Convert Kiso persistent data to plain JS. */
export function clj_to_js(x: unknown): unknown {
  if (x === null || x === undefined) return x;

  if (isKeyword(x)) {
    const kw = x as Keyword;
    return kw.ns ? `${kw.ns}/${kw.name}` : kw.name;
  }

  if (isVector(x)) {
    const v = x as PersistentVector;
    const arr: unknown[] = [];
    for (let i = 0; i < v.count; i++) {
      arr.push(clj_to_js(v.nth(i)));
    }
    return arr;
  }

  if (isList(x)) {
    const arr: unknown[] = [];
    let l = x;
    while (count(l as any) > 0) {
      arr.push(clj_to_js(first(l as any)));
      l = rest(l as any);
    }
    return arr;
  }

  if (isHashMap(x)) {
    const m = x as PersistentHashMap;
    const obj: Record<string, unknown> = {};
    m.forEach((key, val) => {
      const k = isKeyword(key) ? (key as Keyword).name : String(key);
      obj[k] = clj_to_js(val);
    });
    return obj;
  }

  if (isHashSet(x)) {
    const s = x as PersistentHashSet;
    const arr: unknown[] = [];
    s.forEach((key) => arr.push(clj_to_js(key)));
    return arr;
  }

  if (x instanceof LazySeq) {
    return (toArray(x as any) as unknown[]).map(clj_to_js);
  }

  return x;
}

/** Shallow JS object → persistent map with keyword keys. */
export function bean(obj: unknown): unknown {
  if (obj == null) return null;
  const kvs: unknown[] = [];
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    kvs.push(keyword(k), v);
  }
  return hashMap(...kvs);
}

/**
 * Convert to plain JS object.
 * - If first arg is a PersistentHashMap: shallow convert (keyword keys → string keys)
 * - Otherwise: treat as key-value pairs like CLJS (js-obj "k1" v1 "k2" v2)
 */
export function js_obj(...args: unknown[]): unknown {
  if (args.length === 1 && isHashMap(args[0])) {
    const m = args[0] as PersistentHashMap;
    const obj: Record<string, unknown> = {};
    m.forEach((key, val) => {
      const k = isKeyword(key) ? (key as Keyword).name : String(key);
      obj[k] = val; // shallow — no recursive conversion
    });
    return obj;
  }
  // Key-value pairs
  const obj: Record<string, unknown> = {};
  for (let i = 0; i < args.length; i += 2) {
    obj[String(args[i])] = args[i + 1];
  }
  return obj;
}

/** Create a JS array from the arguments (like cljs `js-array`). */
export function js_array(...items: unknown[]): unknown[] {
  return items;
}

/** Shallow convert a sequential collection to a JS array (`into-array` / `to-array`). */
export function into_array(coll: unknown): unknown[] {
  if (isVector(coll)) {
    const v = coll as PersistentVector;
    const arr: unknown[] = [];
    for (let i = 0; i < v.count; i++) {
      arr.push(v.nth(i)); // shallow
    }
    return arr;
  }
  if (isList(coll)) {
    const arr: unknown[] = [];
    let l = coll;
    while (count(l as any) > 0) {
      arr.push(first(l as any)); // shallow
      l = rest(l as any);
    }
    return arr;
  }
  if (Array.isArray(coll)) return coll;
  return [];
}

/** Convert plain JS data to Kiso persistent data (recursive). Keys stay strings unless `:keywordize-keys true`. */
export function js_to_clj(x: unknown, ...opts: unknown[]): unknown {
  let keywordize = false;
  for (let i = 0; i + 1 < opts.length; i += 2) {
    const k = opts[i] as { name?: string } | null;
    if (k && k.name === 'keywordize-keys') keywordize = opts[i + 1] !== false && opts[i + 1] != null;
  }
  const conv = (v: unknown): unknown => {
    if (v === null || v === undefined) return v;
    if (Array.isArray(v)) return vector(...v.map(conv));
    if (typeof v === 'object' && v.constructor === Object) {
      const kvs: unknown[] = [];
      for (const [k, val] of Object.entries(v)) kvs.push(keywordize ? keyword(k) : k, conv(val));
      return hashMap(...kvs);
    }
    return v;
  };
  return conv(x);
}

export { into_array as to_array };

// Backward-compatible camelCase aliases
export { clj_to_js as cljToJs, js_to_clj as jsToClj };

function jsonToClj(x: unknown): unknown {
  if (x === null || x === undefined) return null;
  if (Array.isArray(x)) return vector(...x.map(jsonToClj));
  if (typeof x === 'object') {
    const args: unknown[] = [];
    for (const [k, v] of Object.entries(x as object)) args.push(keyword(k), jsonToClj(v));
    return hashMap(...args);
  }
  return x;
}

/** host/json-parse: same contract as the AS backend (keyword keys, throws on invalid input). */
export function host_json_parse(s: string): unknown {
  return jsonToClj(JSON.parse(s));
}

function cljToJson(x: unknown): unknown {
  if (x === null || x === undefined) return null;
  if (typeof x === 'number') return Number.isFinite(x) ? x : null;
  if (isKeyword(x)) {
    const kw = x as Keyword;
    return kw.ns ? `${kw.ns}/${kw.name}` : kw.name;
  }
  if (isHashMap(x)) {
    const obj: Record<string, unknown> = {};
    (x as PersistentHashMap).forEach((k, v) => {
      obj[isKeyword(k) ? cljToJson(k) as string : String(k)] = cljToJson(v);
    });
    return obj;
  }
  if (isVector(x) || isList(x) || isHashSet(x)) return (toArray(x as any) as unknown[]).map(cljToJson);
  return x;
}

export function host_json_stringify(x: unknown): string {
  return JSON.stringify(cljToJson(x));
}
