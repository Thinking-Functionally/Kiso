import { host_wasm_call, truthy } from '@clojurewasm/kiso/runtime';

export let upper = function upper(wasm__a0) {
  return host_wasm_call("fixture", "upper", "s>s", wasm__a0);
};

export let _main = function _main() {
  return (() => {
    let dt__limit = 10000;
    return ((dt__i) => (() => {
      while (true) {
        if (truthy(dt__i < dt__limit)) {
          const _ = dt__i;
          upper("hello wasm ffi world");
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