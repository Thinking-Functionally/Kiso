import { add, ifn, lt, println, subtract, truthy } from '@clojurewasm/kiso/runtime';

export let fib = function fib(n) {
  return (truthy(lt(n, 2))
    ? n
    : add(ifn(fib)(subtract(n, 1)), ifn(fib)(subtract(n, 2))));
};

export let _main = function _main() {
  return println(fib(32));
};