import { apply, count, map, println, range, str } from '@clojurewasm/kiso/runtime';

export let _main = function _main() {
  return println(count(apply(str, map(str, range(50000)))));
};