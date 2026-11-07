import { add, even_p, filter, inc, map, println, range, reduce } from '@clojurewasm/kiso/runtime';

export let _main = function _main() {
  return println(reduce(add, map(inc, filter(even_p, range(300000)))));
};