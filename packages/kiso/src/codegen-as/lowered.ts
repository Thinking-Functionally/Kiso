// Lowered IR — AS backend only (D14). Independent of analyzer/node.ts.
//
// Statement-oriented: expression-position if/let/try/loop are flattened into
// statements with temporaries, `recur` is validated as tail-position and turned
// into assign + continue, and closures carry explicit by-value captures.
//
// Truthiness: `if.test` uses Clojure truthiness (only nil/false are falsey).

export type LVarKind =
  | 'local' // declared in the current function (unique name)
  | 'captured' // copied into the closure environment
  | 'global' // var / runtime function / ns-qualified name
  | 'field' // deftype/defrecord field, read from `this`
  | 'self'; // named fn referring to itself

export type LVar = { type: 'var'; name: string; kind: LVarKind };

export type LExpr =
  | { type: 'literal'; value: unknown; jsType: string }
  | { type: 'keyword'; ns: string | null; name: string }
  | LVar
  | { type: 'vector'; items: LExpr[] }
  | { type: 'set'; items: LExpr[] }
  | { type: 'map'; keys: LExpr[]; vals: LExpr[] }
  | { type: 'invoke'; fn: LExpr; args: LExpr[] }
  | { type: 'host-call'; name: string; args: LExpr[] }
  | { type: 'new'; ctor: LExpr; args: LExpr[] }
  | LClosure
  | { type: 'reify'; protocols: LProtocolImpl[] };

/** Closure creation. Each capture copies `source` (resolved in the creating function) under `name`. */
export type LClosure = {
  type: 'closure';
  fnId: number;
  captures: { name: string; source: LVar }[];
};

export type LProtocolImpl = {
  protocol: LExpr;
  methods: { name: string; fn: LClosure }[];
};

export type LCatch = { exType: string; binding: string; body: LStmt[] };

export type LStmt =
  | { type: 'let'; name: string; init: LExpr | null }
  | { type: 'assign'; name: string; value: LExpr }
  | { type: 'set-global'; name: string; value: LExpr }
  | { type: 'expr'; expr: LExpr }
  | { type: 'if'; test: LExpr; then: LStmt[]; else: LStmt[] }
  | { type: 'loop'; body: LStmt[] } // while (true); exits via break/return
  | { type: 'break' }
  | { type: 'continue' }
  | { type: 'return'; value: LExpr }
  | { type: 'throw'; value: LExpr }
  | { type: 'try'; body: LStmt[]; catches: LCatch[]; finalizer: LStmt[] | null }
  | { type: 'def'; name: string; value: LExpr | null; doc: string | null }
  // All closures are created first, then their captures are filled (mutual recursion).
  | { type: 'letfn'; bindings: { name: string; closure: LClosure }[] }
  | { type: 'type-def'; kind: 'deftype' | 'defrecord'; name: string; fields: string[]; protocols: LProtocolImpl[] }
  | { type: 'extend-type'; target: LExpr; protocols: LProtocolImpl[] }
  | { type: 'ns'; name: string; requires: { ns: string; alias: string | null; refers: string[] }[] };

export type LArity = {
  params: string[];
  restParam: string | null;
  body: LStmt[]; // wrapped in a single `loop` when the arity uses recur
};

export type LFunction = {
  id: number;
  name: string | null;
  captures: string[];
  fields: string[]; // non-empty for deftype/defrecord methods
  owner: string | null; // type name for deftype/defrecord methods; `this` is the first parameter
  arities: LArity[];
};

export type LModule = {
  functions: LFunction[];
  body: LStmt[];
};
