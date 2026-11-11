import { host_wasm_call, truthy } from '@clojurewasm/kiso/runtime';

export let add = function add(wasm__a0, wasm__a1) {
  return host_wasm_call("fixture", "add", "ii>i", wasm__a0, wasm__a1);
};

export let _main = function _main() {
  return (() => {
    let dt__limit = 100000;
    return ((dt__i) => (() => {
      while (true) {
        if (truthy(dt__i < dt__limit)) {
          const i = dt__i;
          add(i, 1);
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