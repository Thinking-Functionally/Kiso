import { truthy } from '@clojurewasm/kiso/runtime';

import * as str from 'clojure/string.js';

export let _main = function _main() {
  return (() => {
    let dt__limit = 10000;
    return ((dt__i) => (() => {
      while (true) {
        if (truthy(dt__i < dt__limit)) {
          const _ = dt__i;
          str.upper_case("hello wasm ffi world");
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