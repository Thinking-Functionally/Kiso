// Kiso AssemblyScript runtime (M2). Compiled together with generated code by asc;
// NOT part of the TypeScript build (lives outside src/).
//
// Value model (D18): every Kiso value is a `Value` heap object. Singletons for
// nil/true/false so truthiness and identity checks are pointer comparisons.

export abstract class Value {}

export class Nil extends Value {}
export class Bool extends Value {
  constructor(public v: bool) {
    super();
  }
}
export class Num extends Value {
  constructor(public v: f64) {
    super();
  }
}
export class Str extends Value {
  constructor(public v: string) {
    super();
  }
}
export class Kw extends Value {
  constructor(
    public ns: string,
    public name: string,
  ) {
    super();
  }
}

export const NIL: Value = new Nil();
export const TRUE: Value = new Bool(true);
export const FALSE: Value = new Bool(false);

export function bool_(b: bool): Value {
  return b ? TRUE : FALSE;
}

export function truthy(v: Value): bool {
  return v !== NIL && v !== FALSE;
}

// -- Host interface (D17) ----------------------------------------------------

@external("kiso", "write")
declare function hostWrite(s: string): void;

// -- Functions ---------------------------------------------------------------

export abstract class Fn extends Value {
  invoke(args: Array<Value>): Value {
    return arityError();
  }
  call0(): Value {
    return this.invoke([]);
  }
  call1(a: Value): Value {
    return this.invoke([a]);
  }
  call2(a: Value, b: Value): Value {
    return this.invoke([a, b]);
  }
  call3(a: Value, b: Value, c: Value): Value {
    return this.invoke([a, b, c]);
  }
}

export function arityError(): Value {
  abort("Wrong number of args passed to fn");
  return NIL;
}

export function asFn(v: Value): Fn {
  if (v instanceof Fn) return changetype<Fn>(v);
  abort("Value is not callable");
  return unreachable();
}

export function throwValue(v: Value): void {
  abort(toStr(v, false));
}

// -- Numbers -----------------------------------------------------------------

export function toF64(v: Value): f64 {
  if (v instanceof Num) return changetype<Num>(v).v;
  abort("Value is not a number");
  return 0;
}

export function add(a: Value, b: Value): Value {
  return new Num(toF64(a) + toF64(b));
}
export function sub(a: Value, b: Value): Value {
  return new Num(toF64(a) - toF64(b));
}
export function mul(a: Value, b: Value): Value {
  return new Num(toF64(a) * toF64(b));
}
export function div(a: Value, b: Value): Value {
  return new Num(toF64(a) / toF64(b));
}
export function neg(a: Value): Value {
  return new Num(-toF64(a));
}
export function inc(a: Value): Value {
  return new Num(toF64(a) + 1);
}
export function dec(a: Value): Value {
  return new Num(toF64(a) - 1);
}
export function rem(a: Value, b: Value): Value {
  return new Num(toF64(a) % toF64(b));
}
export function mod(a: Value, b: Value): Value {
  const y = toF64(b);
  return new Num(((toF64(a) % y) + y) % y);
}

export function lt(a: Value, b: Value): bool {
  return toF64(a) < toF64(b);
}
export function gt(a: Value, b: Value): bool {
  return toF64(a) > toF64(b);
}
export function lte(a: Value, b: Value): bool {
  return toF64(a) <= toF64(b);
}
export function gte(a: Value, b: Value): bool {
  return toF64(a) >= toF64(b);
}
export function isZero(a: Value): bool {
  return toF64(a) == 0;
}
export function isPos(a: Value): bool {
  return toF64(a) > 0;
}
export function isNeg(a: Value): bool {
  return toF64(a) < 0;
}

// -- Equality ----------------------------------------------------------------

export function eq(a: Value, b: Value): bool {
  if (a === b) return true;
  if (a instanceof Num && b instanceof Num) return changetype<Num>(a).v == changetype<Num>(b).v;
  if (a instanceof Str && b instanceof Str) return changetype<Str>(a).v == changetype<Str>(b).v;
  if (a instanceof Kw && b instanceof Kw) {
    const x = changetype<Kw>(a);
    const y = changetype<Kw>(b);
    return x.ns == y.ns && x.name == y.name;
  }
  return false;
}

// -- Printing ----------------------------------------------------------------

function fmtNum(n: f64): string {
  if (n != n) return "NaN";
  if (n == Infinity) return "Infinity";
  if (n == -Infinity) return "-Infinity";
  if (n == Math.floor(n) && Math.abs(n) < 1e15) return (<i64>n).toString();
  return n.toString();
}

export function toStr(v: Value, readable: bool): string {
  if (v === NIL) return readable ? "nil" : "";
  if (v === TRUE) return "true";
  if (v === FALSE) return "false";
  if (v instanceof Num) return fmtNum(changetype<Num>(v).v);
  if (v instanceof Str) {
    const s = changetype<Str>(v).v;
    return readable ? '"' + s + '"' : s;
  }
  if (v instanceof Kw) {
    const k = changetype<Kw>(v);
    return k.ns.length > 0 ? ":" + k.ns + "/" + k.name : ":" + k.name;
  }
  if (v instanceof Fn) return "#<fn>";
  return "#<object>";
}

export function println(args: Array<Value>): Value {
  let out = "";
  for (let i = 0; i < args.length; i++) {
    if (i > 0) out += " ";
    out += toStr(args[i], false);
  }
  hostWrite(out + "\n");
  return NIL;
}

export function str(args: Array<Value>): Value {
  let out = "";
  for (let i = 0; i < args.length; i++) out += toStr(args[i], false);
  return new Str(out);
}
