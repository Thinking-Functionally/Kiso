// Map-like access to defrecord instances (declared fields only; extension keys are not supported).
import { isKeyword } from './keyword.js';

type RecordCtor = { __kiso_fields: string[]; name: string };
type RecordLike = { constructor: RecordCtor } & Record<string, unknown>;

export function isRecord(x: unknown): x is RecordLike {
  return typeof x === 'object' && x !== null
    && Array.isArray((x as { constructor?: { __kiso_fields?: unknown } }).constructor?.__kiso_fields);
}

function fieldOf(r: RecordLike, key: unknown): string | null {
  if (!isKeyword(key) || key.ns !== null) return null;
  return r.constructor.__kiso_fields.includes(key.name) ? key.name : null;
}

export function recordGet(r: RecordLike, key: unknown): unknown {
  const f = fieldOf(r, key);
  return f === null ? undefined : r[f];
}

export function recordHas(r: RecordLike, key: unknown): boolean {
  return fieldOf(r, key) !== null;
}

export function recordAssoc(r: RecordLike, key: unknown, val: unknown): unknown {
  const f = fieldOf(r, key);
  if (f === null) throw new Error(`assoc on ${r.constructor.name}: only declared fields are supported`);
  const Ctor = r.constructor as unknown as new (...a: unknown[]) => unknown;
  return new Ctor(...r.constructor.__kiso_fields.map((n) => (n === f ? val : r[n])));
}

export function recordEquiv(a: RecordLike, b: unknown, eq: (x: unknown, y: unknown) => boolean): boolean {
  if (!isRecord(b) || a.constructor !== b.constructor) return false;
  return a.constructor.__kiso_fields.every((n) => eq(a[n], b[n]));
}
