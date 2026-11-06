// JSON <-> Value (D24). Objects become maps with keyword keys, arrays vectors, null nil.
import {
  Value, Num, Str, Kw, Vec, MapV, SetV, Rec, NIL, TRUE, FALSE, mkNum, mkVec, mkMap, fmtNum, toStr, LazySeq, items, Sym, klist, mkSet,
} from "./kiso-runtime";

class Parser {
  i: i32 = 0;
  constructor(public s: string) {}

  fail(msg: string): void {
    abort("Invalid JSON: " + msg + " at " + this.i.toString());
  }
  ws(): void {
    while (this.i < this.s.length) {
      const c = this.s.charCodeAt(this.i);
      if (c == 32 || c == 9 || c == 10 || c == 13) this.i++;
      else break;
    }
  }
  expect(c: i32): void {
    if (this.i >= this.s.length || this.s.charCodeAt(this.i) != c) this.fail("expected " + String.fromCharCode(c));
    this.i++;
  }
  lit(word: string, v: Value): Value {
    if (this.s.substr(this.i, word.length) != word) this.fail("unexpected token");
    this.i += word.length;
    return v;
  }
  value(): Value {
    this.ws();
    if (this.i >= this.s.length) {
      this.fail("unexpected end");
      return NIL;
    }
    const c = this.s.charCodeAt(this.i);
    if (c == 123) return this.object();
    if (c == 91) return this.array();
    if (c == 34) return new Str(this.str());
    if (c == 116) return this.lit("true", TRUE);
    if (c == 102) return this.lit("false", FALSE);
    if (c == 110) return this.lit("null", NIL);
    return this.number();
  }
  number(): Value {
    const start = this.i;
    while (this.i < this.s.length) {
      const c = this.s.charCodeAt(this.i);
      if ((c >= 48 && c <= 57) || c == 45 || c == 43 || c == 46 || c == 101 || c == 69) this.i++;
      else break;
    }
    if (this.i == start) this.fail("unexpected character");
    return mkNum(parseFloat(this.s.substring(start, this.i)));
  }
  str(): string {
    this.expect(34);
    const parts = new Array<string>();
    let from = this.i;
    while (true) {
      if (this.i >= this.s.length) {
        this.fail("unterminated string");
        return "";
      }
      const c = this.s.charCodeAt(this.i);
      if (c == 34) break;
      if (c == 92) {
        parts.push(this.s.substring(from, this.i));
        this.i++;
        const e = this.s.charCodeAt(this.i);
        if (e == 110) parts.push("\n");
        else if (e == 116) parts.push("\t");
        else if (e == 114) parts.push("\r");
        else if (e == 98) parts.push("\b");
        else if (e == 102) parts.push("\f");
        else if (e == 117) {
          parts.push(String.fromCharCode(<i32>parseInt("0x" + this.s.substr(this.i + 1, 4))));
          this.i += 4;
        } else parts.push(String.fromCharCode(e));
        this.i++;
        from = this.i;
      } else this.i++;
    }
    parts.push(this.s.substring(from, this.i));
    this.i++;
    return parts.join("");
  }
  array(): Value {
    this.expect(91);
    const out = new Array<Value>();
    this.ws();
    if (this.s.charCodeAt(this.i) == 93) {
      this.i++;
      return mkVec(out);
    }
    while (true) {
      out.push(this.value());
      this.ws();
      const c = this.s.charCodeAt(this.i);
      this.i++;
      if (c == 93) break;
      if (c != 44) this.fail("expected , or ]");
    }
    return mkVec(out);
  }
  object(): Value {
    this.expect(123);
    const kv = new Array<Value>();
    this.ws();
    if (this.s.charCodeAt(this.i) == 125) {
      this.i++;
      return mkMap(kv);
    }
    while (true) {
      this.ws();
      kv.push(new Kw("", this.str()));
      this.ws();
      this.expect(58);
      kv.push(this.value());
      this.ws();
      const c = this.s.charCodeAt(this.i);
      this.i++;
      if (c == 125) break;
      if (c != 44) this.fail("expected , or }");
    }
    return mkMap(kv);
  }
}

export function jsonParse(s: string): Value {
  const p = new Parser(s);
  const v = p.value();
  p.ws();
  if (p.i != s.length) p.fail("trailing characters");
  return v;
}

function jsonQuote(s: string, out: Array<string>): void {
  const parts = new Array<string>();
  parts.push('"');
  let from = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    let esc: string | null = null;
    if (c == 34) esc = '\\"';
    else if (c == 92) esc = "\\\\";
    else if (c == 10) esc = "\\n";
    else if (c == 13) esc = "\\r";
    else if (c == 9) esc = "\\t";
    else if (c < 32) esc = "\\u" + (c < 16 ? "000" : "00") + c.toString(16);
    if (esc !== null) {
      parts.push(s.substring(from, i));
      parts.push(esc);
      from = i + 1;
    }
  }
  parts.push(s.substring(from));
  parts.push('"');
  out.push(parts.join(""));
}

function keyName(k: Value): string {
  if (k instanceof Kw) {
    const kw = changetype<Kw>(k);
    return kw.ns.length > 0 ? kw.ns + "/" + kw.name : kw.name;
  }
  return toStr(k, false);
}

function write(v: Value, out: Array<string>): void {
  if (v === NIL) out.push("null");
  else if (v === TRUE) out.push("true");
  else if (v === FALSE) out.push("false");
  else if (v instanceof Num) {
    const n = changetype<Num>(v).v;
    out.push(isFinite(n) ? fmtNum(n) : "null");
  } else if (v instanceof Str) jsonQuote(changetype<Str>(v).v, out);
  else if (v instanceof Kw) jsonQuote(keyName(v), out);
  else if (v instanceof Vec) {
    const x = changetype<Vec>(v);
    out.push("[");
    for (let i = 0; i < x.n; i++) {
      if (i > 0) out.push(",");
      write(unchecked(x.a[i]), out);
    }
    out.push("]");
  } else if (v instanceof LazySeq) {
    const a = items(v);
    out.push("[");
    for (let i = 0; i < a.length; i++) {
      if (i > 0) out.push(",");
      write(a[i], out);
    }
    out.push("]");
  } else if (v instanceof SetV) {
    const m = changetype<SetV>(v).m;
    out.push("[");
    for (let i = 0; i < m.n; i++) {
      if (i > 0) out.push(",");
      write(unchecked(m.keys[i]), out);
    }
    out.push("]");
  } else if (v instanceof MapV) {
    const m = changetype<MapV>(v);
    out.push("{");
    for (let i = 0; i < m.n; i++) {
      if (i > 0) out.push(",");
      jsonQuote(keyName(unchecked(m.keys[i])), out);
      out.push(":");
      write(unchecked(m.vals[i]), out);
    }
    out.push("}");
  } else if (v instanceof Rec) {
    const r = changetype<Rec>(v);
    out.push("{");
    for (let i = 0; i < r.nFields(); i++) {
      if (i > 0) out.push(",");
      jsonQuote(r.fieldName(i), out);
      out.push(":");
      write(r.fieldAt(i), out);
    }
    out.push("}");
  } else jsonQuote(toStr(v, false), out);
}

export function jsonStringify(v: Value): string {
  const out = new Array<string>();
  write(v, out);
  return out.join("");
}

export function jsonParseV(s: Value): Value {
  return jsonParse(toStr(s, false));
}
export function jsonStringifyV(v: Value): Value {
  return new Str(jsonStringify(v));
}

// clojure.edn / read-string: numbers, strings, chars, keywords, symbols, lists, vectors, maps, sets, nil/true/false.
class EdnReader {
  i: i32 = 0;
  constructor(public s: string) {}

  fail(msg: string): void {
    abort("read-string: " + msg + " at " + this.i.toString());
  }
  isDelim(c: i32): bool {
    return c == 32 || c == 9 || c == 10 || c == 13 || c == 44 || c == 40 || c == 41 || c == 91 || c == 93 || c == 123 || c == 125 || c == 34 || c == 59;
  }
  ws(): void {
    while (this.i < this.s.length) {
      const c = this.s.charCodeAt(this.i);
      if (c == 32 || c == 9 || c == 10 || c == 13 || c == 44) this.i++;
      else if (c == 59) {
        while (this.i < this.s.length && this.s.charCodeAt(this.i) != 10) this.i++;
      } else break;
    }
  }
  atEnd(): bool {
    this.ws();
    return this.i >= this.s.length;
  }
  token(): string {
    const start = this.i;
    while (this.i < this.s.length && !this.isDelim(this.s.charCodeAt(this.i))) this.i++;
    return this.s.substring(start, this.i);
  }
  seqUntil(close: i32): Array<Value> {
    const out = new Array<Value>();
    while (true) {
      this.ws();
      if (this.i >= this.s.length) {
        this.fail("unexpected end of input");
        return out;
      }
      if (this.s.charCodeAt(this.i) == close) {
        this.i++;
        return out;
      }
      out.push(this.read());
    }
    return out;
  }
  read(): Value {
    this.ws();
    if (this.i >= this.s.length) {
      this.fail("unexpected end of input");
      return NIL;
    }
    const c = this.s.charCodeAt(this.i);
    if (c == 40) {
      this.i++;
      return klist(this.seqUntil(41));
    }
    if (c == 91) {
      this.i++;
      return mkVec(this.seqUntil(93));
    }
    if (c == 123) {
      this.i++;
      const kv = this.seqUntil(125);
      if (kv.length % 2 != 0) this.fail("map literal must contain an even number of forms");
      return mkMap(kv);
    }
    if (c == 35 && this.s.charCodeAt(this.i + 1) == 123) {
      this.i += 2;
      return mkSet(this.seqUntil(125));
    }
    if (c == 34) {
      const p = new Parser(this.s);
      p.i = this.i;
      const v = p.str();
      this.i = p.i;
      return new Str(v);
    }
    if (c == 92) {
      this.i++;
      const start = this.i;
      this.i++;
      while (this.i < this.s.length && !this.isDelim(this.s.charCodeAt(this.i))) this.i++;
      const t = this.s.substring(start, this.i);
      if (t == "newline") return new Str("\n");
      if (t == "space") return new Str(" ");
      if (t == "tab") return new Str("\t");
      if (t == "return") return new Str("\r");
      return new Str(t);
    }
    const t = this.token();
    if (t.length == 0) {
      this.fail("unexpected character");
      return NIL;
    }
    if (t == "nil") return NIL;
    if (t == "true") return TRUE;
    if (t == "false") return FALSE;
    const c0 = t.charCodeAt(0);
    if (c0 == 58) {
      const body = t.substring(1);
      const k = body.indexOf("/");
      return k > 0 ? new Kw(body.substring(0, k), body.substring(k + 1)) : new Kw("", body);
    }
    const c1 = t.length > 1 ? t.charCodeAt(1) : 0;
    if ((c0 >= 48 && c0 <= 57) || ((c0 == 45 || c0 == 43) && c1 >= 48 && c1 <= 57)) {
      const last = t.charCodeAt(t.length - 1);
      const n = last == 78 || last == 77 ? t.substring(0, t.length - 1) : t;
      return mkNum(parseFloat(n));
    }
    const k = t.indexOf("/");
    return k > 0 && k < t.length - 1 ? new Sym(t.substring(0, k), t.substring(k + 1)) : new Sym("", t);
  }
}

export function readStringV(s: Value): Value {
  const r = new EdnReader(toStr(s, false));
  if (r.atEnd()) return NIL;
  return r.read();
}
