import { host_wasm_call, range, truthy, vec } from '@clojurewasm/kiso/runtime';

export let sum_f64s = function sum_f64s(wasm__a0) {
  return host_wasm_call("fixture", "sum_f64s", "D>d", wasm__a0);
};

export let xs = vec(range(100000));

export let _main = function _main() {
  return (() => {
    let dt__limit = 20;
    return ((dt__i) => (() => {
      while (true) {
        if (truthy(dt__i < dt__limit)) {
          const _ = dt__i;
          sum_f64s(xs);
          const dt__i__tmp = dt__i + 1;
          dt__i = dt__i__tmp;
          continue;
        } else {
          return null;
        }
      }
    })())(0);
  })();
};