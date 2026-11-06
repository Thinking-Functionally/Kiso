// core.async runtime: channels and a run-to-completion scheduler.
// Every callback is queued (never re-entered synchronously), so `go` loops keep a flat stack.

import { vector, PersistentVector } from './vector.js';
import { toArray } from './seq.js';

type Thunk = () => void;
type Flag = { done: boolean };
type Taker = { cb: (v: unknown) => unknown; flag: Flag };
type Putter = { val: unknown; cb: (ok: unknown) => unknown; flag: Flag };
type BufSpec = { kind: 'fixed' | 'dropping' | 'sliding'; n: number };

const queue: Thunk[] = [];
let draining = false;

function drain(): void {
  if (draining) return;
  draining = true;
  try {
    for (let i = 0; i < queue.length; i++) queue[i]!();
  } finally {
    queue.length = 0;
    draining = false;
  }
}

export function go_dispatch(f: Thunk): null {
  queue.push(f);
  if (!draining) queueMicrotask(drain);
  return null;
}

export class Chan {
  buf: unknown[] = [];
  takers: Taker[] = [];
  putters: Putter[] = [];
  closed = false;
  constructor(readonly spec: BufSpec | null) {}
}

export function buffer(n: number): BufSpec { return { kind: 'fixed', n }; }
export function dropping_buffer(n: number): BufSpec { return { kind: 'dropping', n }; }
export function sliding_buffer(n: number): BufSpec { return { kind: 'sliding', n }; }

export function chan(spec?: number | BufSpec | null): Chan {
  if (spec == null || spec === 0) return new Chan(null);
  return new Chan(typeof spec === 'number' ? buffer(spec) : spec);
}

const nextLive = <T extends { flag: Flag }>(q: T[]): T | undefined => {
  while (q.length > 0) {
    const e = q.shift()!;
    if (!e.flag.done) { e.flag.done = true; return e; }
  }
  return undefined;
};
const hasLive = (q: { flag: Flag }[]): boolean => {
  while (q.length > 0 && q[0]!.flag.done) q.shift();
  return q.length > 0;
};
const noop = (): null => null;

function canTake(c: Chan): boolean { return c.buf.length > 0 || hasLive(c.putters) || c.closed; }
function canPut(c: Chan): boolean {
  return c.closed || hasLive(c.takers) || (c.spec !== null && (c.buf.length < c.spec.n || c.spec.kind !== 'fixed'));
}

function doTake(c: Chan, cb: (v: unknown) => unknown): void {
  if (c.buf.length > 0) {
    const v = c.buf.shift();
    const p = nextLive(c.putters);
    if (p) { c.buf.push(p.val); go_dispatch(() => p.cb(true)); }
    go_dispatch(() => cb(v));
    return;
  }
  const p = nextLive(c.putters);
  if (p) {
    go_dispatch(() => p.cb(true));
    go_dispatch(() => cb(p.val));
    return;
  }
  if (c.closed) { go_dispatch(() => cb(null)); return; }
  c.takers.push({ cb, flag: { done: false } });
}

function doPut(c: Chan, v: unknown, cb: (ok: unknown) => unknown): void {
  if (c.closed) { go_dispatch(() => cb(false)); return; }
  const t = nextLive(c.takers);
  if (t) {
    go_dispatch(() => t.cb(v));
    go_dispatch(() => cb(true));
    return;
  }
  if (c.spec !== null) {
    if (c.buf.length < c.spec.n) { c.buf.push(v); go_dispatch(() => cb(true)); return; }
    if (c.spec.kind === 'dropping') { go_dispatch(() => cb(true)); return; }
    if (c.spec.kind === 'sliding') { c.buf.shift(); c.buf.push(v); go_dispatch(() => cb(true)); return; }
  }
  c.putters.push({ val: v, cb, flag: { done: false } });
}

export function take_m(c: Chan, cb: (v: unknown) => unknown = noop): null {
  doTake(c, cb);
  return null;
}

export function put_m(c: Chan, v: unknown, cb: (ok: unknown) => unknown = noop): true {
  if (v == null) throw new Error("Can't put nil on a channel");
  doPut(c, v, cb);
  return true;
}

export function close_m(c: Chan): null {
  if (c.closed) return null;
  c.closed = true;
  let t: Taker | undefined;
  while ((t = nextLive(c.takers))) { const cb = t.cb; go_dispatch(() => cb(null)); }
  return null;
}

export function offer_m(c: Chan, v: unknown): boolean {
  if (v == null) throw new Error("Can't put nil on a channel");
  if (!canPut(c) || c.closed) return false;
  doPut(c, v, noop);
  return true;
}

export function timeout(ms: number): Chan {
  const c = chan();
  setTimeout(() => close_m(c), ms);
  return c;
}

export function go_start(f: (done: (v: unknown) => unknown) => unknown): Chan {
  const c = chan(1);
  go_dispatch(() => {
    f((v) => {
      if (v != null) doPut(c, v, noop);
      close_m(c);
      return null;
    });
  });
  return c;
}

/** `ports` is a vector of channels or `[ch val]` vectors; `cb` receives `[val port]`. */
export function go_alts(ports: PersistentVector, cb: (r: unknown) => unknown, opts?: unknown): null {
  const list = toArray(ports) as unknown[];
  void opts;
  const flag: Flag = { done: false };
  const finish = (val: unknown, port: Chan) => { flag.done = true; return cb(vector(val, port)); };
  const spec = list.map((p) => (p instanceof Chan ? { ch: p, put: false, val: null } : { ch: (p as PersistentVector).nth(0) as Chan, put: true, val: (p as PersistentVector).nth(1) }));
  for (const s of spec) {
    if (s.put ? canPut(s.ch) : canTake(s.ch)) {
      if (s.put) doPut(s.ch, s.val, (ok) => finish(ok, s.ch));
      else doTake(s.ch, (v) => finish(v, s.ch));
      return null;
    }
  }
  for (const s of spec) {
    if (s.put) s.ch.putters.push({ val: s.val, cb: (ok) => finish(ok, s.ch), flag });
    else s.ch.takers.push({ cb: (v) => finish(v, s.ch), flag });
  }
  return null;
}
