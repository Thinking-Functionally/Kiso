import { add, assoc, get, hashMap, inc, lt, multiply, println, range, reduce, truthy } from '@clojurewasm/kiso/runtime';

export let _main = function _main() {
  return (() => {
    let m = ((i) => ((m) => (() => {
      while (true) {
        if (truthy(lt(i, 50000))) {
          const i__tmp = inc(i);
          const m__tmp = assoc(m, i, multiply(i, 2));
          i = i__tmp;
          m = m__tmp;
          continue;
        } else {
          return m;
        }
      }
    })())(hashMap()))(0);
    return println(reduce(function (acc, i) {
      return add(acc, get(m, i));
    }, 0, range(50000)));
  })();
};