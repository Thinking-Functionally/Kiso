import { add, range, reduce, truthy, vec } from '@clojurewasm/kiso/runtime';

export let xs = vec(range(100000));

export let _main = function _main() {
  return (() => {
    let dt__limit = 20;
    return ((dt__i) => (() => {
      while (true) {
        if (truthy(dt__i < dt__limit)) {
          const _ = dt__i;
          reduce(add, 0, xs);
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