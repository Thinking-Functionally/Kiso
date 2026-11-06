// MultiFn — Runtime support for defmulti/defmethod dispatch.
//
// A MultiFn wraps a dispatch function and a method table.
// When invoked, it calls the dispatch fn on the args to get a dispatch value,
// then looks up the matching method. Falls back to :default if no match.

import { equiv } from './equiv.js';
import { isKeyword } from './keyword.js';
import { isa_p } from './hierarchy.js';

export type MultiFn = {
  (...args: any[]): any;
  addMethod(dispatchVal: any, fn: (...args: any[]) => any): void;
  preferMethod(preferred: any, other: any): void;
};

export function defmultiFn(dispatchFn: (...args: any[]) => any): MultiFn {
  const methods: Array<[any, (...args: any[]) => any]> = [];
  let defaultMethod: ((...args: any[]) => any) | null = null;
  const prefers: Array<[any, any]> = [];
  const prefersOver = (a: any, b: any) => prefers.some(([x, y]) => equiv(x, a) && equiv(y, b));
  const dominates = (a: any, b: any) => prefersOver(a, b) || isa_p(a, b);

  const mf = function (...args: any[]) {
    const dv = dispatchFn(...args);
    // Value-based lookup using equiv
    for (const [key, method] of methods) {
      if (equiv(key, dv)) return method(...args);
    }
    const matches = methods.filter(([key]) => isa_p(dv, key));
    if (matches.length > 0) {
      const best = matches.reduce((a, b) => (dominates(b[0], a[0]) ? b : a));
      for (const other of matches) {
        if (other !== best && !dominates(best[0], other[0])) {
          throw new Error(`Multiple methods match dispatch value: ${dv} -> ${best[0]} and ${other[0]}, and neither is preferred`);
        }
      }
      return best[1](...args);
    }
    if (defaultMethod) return defaultMethod(...args);
    throw new Error(`No method in multimethod for dispatch value: ${dv}`);
  } as MultiFn;

  mf.addMethod = function (dispatchVal: any, fn: (...args: any[]) => any): void {
    if (isKeyword(dispatchVal) && dispatchVal.name === 'default') {
      defaultMethod = fn;
      return;
    }
    // A later defmethod for an equal dispatch value replaces the earlier one.
    const i = methods.findIndex(([key]) => equiv(key, dispatchVal));
    if (i >= 0) methods[i] = [dispatchVal, fn];
    else methods.push([dispatchVal, fn]);
  };

  mf.preferMethod = function (preferred: any, other: any): void {
    prefers.push([preferred, other]);
  };

  return mf;
}

export function prefer_method(mf: MultiFn, preferred: unknown, other: unknown): MultiFn {
  mf.preferMethod(preferred, other);
  return mf;
}
