// Opt-in clojure.test subset used to run the tests/clj suites (compile option `testMacros`).
// Each assertion reports by printing a `CLJT pass|fail|error|skip` line that the harness counts
// (no shared state, so it works on both backends). On the AS target `try` is unavailable, so `thrown?` assertions count as skipped
// and a throwing assertion aborts the program.

import { type Form, makeInt, makeKeyword, makeList, makeStr, makeSymbol, makeVector, prStr } from '../reader/form.js';
import { TEST_MACROS, currentMacroTarget } from './macros.js';

const sym = (n: string): Form => makeSymbol(null, n);
const list = (...xs: Form[]): Form => makeList(xs);
const say = (tag: string, ...rest: Form[]): Form => list(sym('println'), makeStr(`CLJT ${tag}`), ...rest);

function isSym(f: Form, name: string): boolean {
  return f.data.type === 'symbol' && f.data.ns === null && f.data.name === name;
}

function isThrown(f: Form): boolean {
  const it = f.data.type === 'list' ? f.data.items : null;
  const h = it?.[0]?.data;
  return h?.type === 'symbol' && (h.name === 'thrown?' || h.name === 'thrown-with-msg?');
}

function assertion(form: Form): Form {
  const text = makeStr(prStr(form));
  const as = currentMacroTarget() === 'as';
  if (isThrown(form)) {
    if (as) return say('skip');
    const items = (form.data as { items: Form[] }).items;
    const body = items[(items[0]!.data as { name: string }).name === 'thrown?' ? 2 : 3]!;
    return list(sym('try'), body, say('fail', text),
      list(sym('catch'), makeKeyword(null, 'default'), sym('e__'), say('pass')));
  }
  const eqArgs = form.data.type === 'list' && form.data.items.length === 3 && isSym(form.data.items[0]!, '=') ? form.data.items.slice(1) : null;
  // `(= expected actual)` is evaluated once and both values are reported on failure.
  const check = eqArgs
    ? list(sym('let'), makeVector([sym('a__'), eqArgs[0]!, sym('b__'), eqArgs[1]!]),
        list(sym('if'), list(sym('='), sym('a__'), sym('b__')), say('pass'),
          say('fail', text, makeStr('expected:'), list(sym('pr-str'), sym('a__')), makeStr('actual:'), list(sym('pr-str'), sym('b__')))))
    : list(sym('if'), form, say('pass'), say('fail', text));
  if (as) return check;
  return list(sym('try'), check,
    list(sym('catch'), makeKeyword(null, 'default'), sym('e__'), say('error', text, list(sym('str'), sym('e__')))));
}

TEST_MACROS.set('is', (items) => assertion(items[1]!));
TEST_MACROS.set('testing', (items) => list(sym('do'), ...items.slice(2), makeInt(0)));
// The `CLJT begin` line lets a runner attribute the assertions that follow to this test.
TEST_MACROS.set('deftest', (items) => {
  const name = (items[1]!.data as { name: string }).name;
  return list(sym('defn'), items[1]!, makeVector([]), say('begin', makeStr(name)), ...items.slice(2));
});
TEST_MACROS.set('run-tests', () => makeInt(0));
TEST_MACROS.set('are', (items) => {
  const names = (items[1]!.data as { items: Form[] }).items;
  const expr = items[2]!;
  const vals = items.slice(3);
  const out: Form[] = [];
  for (let i = 0; i + names.length <= vals.length; i += names.length) {
    const binds: Form[] = [];
    names.forEach((n, j) => binds.push(n, vals[i + j]!));
    out.push(list(sym('let'), makeVector(binds), assertion(expr)));
  }
  return list(sym('do'), ...out, makeInt(0));
});
