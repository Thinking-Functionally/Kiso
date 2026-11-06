// Small backtracking regex engine for the AssemblyScript backend (D49).
// Supported: literals, `.`, classes (ranges, negation, \d \w \s and their negations), anchors ^ $ \b \B,
// groups (capturing and (?:...)), alternation, quantifiers * + ? {n} {n,} {n,m} with lazy `?`,
// leading inline flags (?i) (?s) (?m). Unsupported syntax (lookaround, backreferences, named groups,
// possessive quantifiers) aborts at construction. Matching is bounded by STEP_LIMIT to stop runaway backtracking.

const STEP_LIMIT: i32 = 5000000;
const MAX_PROG: i32 = 20000;

const OP_CHAR: i32 = 0;
const OP_ANY: i32 = 1;
const OP_CLASS: i32 = 2;
const OP_SPLIT: i32 = 3;
const OP_JMP: i32 = 4;
const OP_SAVE: i32 = 5;
const OP_BOL: i32 = 6;
const OP_EOL: i32 = 7;
const OP_WORDB: i32 = 8;
const OP_NWORDB: i32 = 9;
const OP_MATCH: i32 = 10;
const OP_PROGRESS: i32 = 11;

const N_EMPTY: i32 = 0;
const N_CHAR: i32 = 1;
const N_ANY: i32 = 2;
const N_CLASS: i32 = 3;
const N_CAT: i32 = 4;
const N_ALT: i32 = 5;
const N_GROUP: i32 = 6;
const N_REP: i32 = 7;
const N_ASSERT: i32 = 8;

class CharClass {
  ranges: Array<i32> = new Array<i32>();
  negated: bool = false;
  addRange(lo: i32, hi: i32): void {
    this.ranges.push(lo);
    this.ranges.push(hi);
  }
  // Adds the complement of the ranges in `src` (over 0..0xFFFF).
  addComplement(src: Array<i32>): void {
    let next: i32 = 0;
    for (let i = 0; i < src.length; i += 2) {
      if (src[i] > next) this.addRange(next, src[i] - 1);
      next = src[i + 1] + 1;
    }
    if (next <= 0xffff) this.addRange(next, 0xffff);
  }
  rawTest(c: i32): bool {
    for (let i = 0; i < this.ranges.length; i += 2) {
      if (c >= this.ranges[i] && c <= this.ranges[i + 1]) return true;
    }
    return false;
  }
  test(c: i32, fold: bool): bool {
    let r = this.rawTest(c);
    if (!r && fold) {
      const lo = lower(c);
      const up = upper(c);
      r = (lo != c && this.rawTest(lo)) || (up != c && this.rawTest(up));
    }
    return r != this.negated;
  }
}

function lower(c: i32): i32 {
  return c >= 65 && c <= 90 ? c + 32 : c;
}
function upper(c: i32): i32 {
  return c >= 97 && c <= 122 ? c - 32 : c;
}
function isWord(c: i32): bool {
  return (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c == 95;
}

function digitRanges(): Array<i32> {
  return [48, 57];
}
function wordRanges(): Array<i32> {
  return [48, 57, 65, 90, 95, 95, 97, 122];
}
function spaceRanges(): Array<i32> {
  return [9, 13, 32, 32, 160, 160, 0x2000, 0x200a, 0x2028, 0x2029, 0x3000, 0x3000, 0xfeff, 0xfeff];
}

class Node {
  kind: i32;
  ch: i32 = 0;
  cls: CharClass | null = null;
  kids: Array<Node> = new Array<Node>();
  min: i32 = 0;
  max: i32 = 0;
  greedy: bool = true;
  idx: i32 = -1;
  constructor(kind: i32) {
    this.kind = kind;
  }
}

class Parser {
  pos: i32 = 0;
  ngroups: i32 = 0;
  icase: bool = false;
  dotall: bool = false;
  multiline: bool = false;
  constructor(public src: string) {}

  fail(msg: string): void {
    abort("regex /" + this.src + "/: " + msg);
  }
  more(): bool {
    return this.pos < this.src.length;
  }
  peek(): i32 {
    return this.src.charCodeAt(this.pos);
  }
  eat(c: i32): bool {
    if (this.more() && this.peek() == c) {
      this.pos++;
      return true;
    }
    return false;
  }

  parseTop(): Node {
    while (this.src.startsWith("(?", this.pos) && this.pos + 3 < this.src.length) {
      const f = this.src.charCodeAt(this.pos + 2);
      if (f != 105 && f != 115 && f != 109) break;
      let j = this.pos + 2;
      while (j < this.src.length && this.src.charCodeAt(j) != 41) {
        const c = this.src.charCodeAt(j);
        if (c == 105) this.icase = true;
        else if (c == 115) this.dotall = true;
        else if (c == 109) this.multiline = true;
        else this.fail("unsupported inline flag");
        j++;
      }
      if (j >= this.src.length) this.fail("unterminated inline flags");
      this.pos = j + 1;
    }
    const n = this.parseAlt();
    if (this.more()) this.fail("unmatched ')'");
    return n;
  }

  parseAlt(): Node {
    const first = this.parseCat();
    if (!this.more() || this.peek() != 124) return first;
    const alt = new Node(N_ALT);
    alt.kids.push(first);
    while (this.eat(124)) alt.kids.push(this.parseCat());
    return alt;
  }

  parseCat(): Node {
    const cat = new Node(N_CAT);
    while (this.more()) {
      const c = this.peek();
      if (c == 124 || c == 41) break;
      cat.kids.push(this.parseQuant());
    }
    return cat.kids.length == 1 ? cat.kids[0] : cat;
  }

  parseQuant(): Node {
    let atom = this.parseAtom();
    while (this.more()) {
      const c = this.peek();
      let min: i32 = 0;
      let max: i32 = -1;
      if (c == 42) {
        this.pos++;
      } else if (c == 43) {
        this.pos++;
        min = 1;
      } else if (c == 63) {
        this.pos++;
        max = 1;
      } else if (c == 123) {
        const save = this.pos;
        this.pos++;
        const a = this.readInt();
        if (a < 0) {
          this.pos = save;
          break;
        }
        min = a;
        max = a;
        if (this.eat(44)) {
          max = this.readInt();
        }
        if (!this.eat(125)) {
          this.pos = save;
          break;
        }
        if (max >= 0 && max < min) this.fail("bad repetition range");
        if (min > 1000 || max > 1000) this.fail("repetition count too large");
      } else break;
      const rep = new Node(N_REP);
      rep.min = min;
      rep.max = max;
      rep.kids.push(atom);
      if (this.eat(63)) rep.greedy = false;
      else if (this.more() && this.peek() == 43) this.fail("possessive quantifiers are not supported");
      atom = rep;
    }
    return atom;
  }

  readInt(): i32 {
    let n: i32 = -1;
    while (this.more()) {
      const c = this.peek();
      if (c < 48 || c > 57) break;
      n = (n < 0 ? 0 : n) * 10 + (c - 48);
      this.pos++;
    }
    return n;
  }

  charNode(c: i32): Node {
    const n = new Node(N_CHAR);
    n.ch = c;
    return n;
  }

  classNode(ranges: Array<i32>, negate: bool): Node {
    const cc = new CharClass();
    for (let i = 0; i < ranges.length; i += 2) cc.addRange(ranges[i], ranges[i + 1]);
    if (negate) {
      const inv = new CharClass();
      inv.addComplement(cc.ranges);
      const n = new Node(N_CLASS);
      n.cls = inv;
      return n;
    }
    const n = new Node(N_CLASS);
    n.cls = cc;
    return n;
  }

  parseAtom(): Node {
    const c = this.peek();
    this.pos++;
    if (c == 46) return new Node(N_ANY);
    if (c == 94) {
      const n = new Node(N_ASSERT);
      n.ch = OP_BOL;
      return n;
    }
    if (c == 36) {
      const n = new Node(N_ASSERT);
      n.ch = OP_EOL;
      return n;
    }
    if (c == 40) return this.parseGroup();
    if (c == 91) return this.parseClass();
    if (c == 92) return this.parseEscape(false, null);
    if (c == 42 || c == 43 || c == 63) this.fail("dangling quantifier");
    return this.charNode(c);
  }

  parseGroup(): Node {
    let cap = true;
    if (this.eat(63)) {
      if (this.eat(58)) cap = false;
      else this.fail("unsupported group syntax (lookaround and named groups are not supported)");
    }
    const g = new Node(N_GROUP);
    if (cap) {
      this.ngroups++;
      g.idx = this.ngroups;
    }
    g.kids.push(this.parseAlt());
    if (!this.eat(41)) this.fail("unterminated group");
    return g;
  }

  // Parses the escape after a backslash. Inside a class (cc != null) ranges are added to cc and null is returned.
  parseEscape(inClass: bool, cc: CharClass | null): Node {
    if (!this.more()) this.fail("trailing backslash");
    const c = this.peek();
    this.pos++;
    let set: Array<i32> | null = null;
    let neg = false;
    if (c == 100) set = digitRanges();
    else if (c == 68) {
      set = digitRanges();
      neg = true;
    } else if (c == 119) set = wordRanges();
    else if (c == 87) {
      set = wordRanges();
      neg = true;
    } else if (c == 115) set = spaceRanges();
    else if (c == 83) {
      set = spaceRanges();
      neg = true;
    }
    if (set !== null) {
      if (inClass) {
        const target = cc!;
        if (neg) target.addComplement(set);
        else for (let i = 0; i < set.length; i += 2) target.addRange(set[i], set[i + 1]);
        return new Node(N_EMPTY);
      }
      return this.classNode(set, neg);
    }
    if (!inClass && (c == 98 || c == 66)) {
      const n = new Node(N_ASSERT);
      n.ch = c == 98 ? OP_WORDB : OP_NWORDB;
      return n;
    }
    if (c >= 49 && c <= 57) this.fail("backreferences are not supported");
    let lit: i32 = c;
    if (c == 110) lit = 10;
    else if (c == 114) lit = 13;
    else if (c == 116) lit = 9;
    else if (c == 102) lit = 12;
    else if (c == 118) lit = 11;
    else if (c == 48) lit = 0;
    else if (c == 120) lit = this.readHex(2);
    else if (c == 117) lit = this.readHex(4);
    else if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122)) this.fail("unsupported escape \\" + String.fromCharCode(c));
    if (inClass) {
      cc!.addRange(lit, lit);
      return new Node(N_EMPTY);
    }
    return this.charNode(lit);
  }

  readHex(n: i32): i32 {
    let v: i32 = 0;
    for (let i = 0; i < n; i++) {
      if (!this.more()) this.fail("bad hex escape");
      const d = this.peek();
      this.pos++;
      let x: i32 = -1;
      if (d >= 48 && d <= 57) x = d - 48;
      else if (d >= 97 && d <= 102) x = d - 87;
      else if (d >= 65 && d <= 70) x = d - 55;
      if (x < 0) this.fail("bad hex escape");
      v = v * 16 + x;
    }
    return v;
  }

  parseClass(): Node {
    const cc = new CharClass();
    if (this.eat(94)) cc.negated = true;
    let first = true;
    while (true) {
      if (!this.more()) this.fail("unterminated character class");
      let c = this.peek();
      if (c == 93 && !first) {
        this.pos++;
        break;
      }
      first = false;
      this.pos++;
      let lo: i32 = c;
      let isSet = false;
      if (c == 92) {
        const save = cc.ranges.length;
        this.parseEscape(true, cc);
        if (cc.ranges.length != save) {
          // a literal escape adds exactly one single-char range; sets add more or are complements
          const last = cc.ranges.length - 2;
          if (cc.ranges.length - save == 2 && cc.ranges[last] == cc.ranges[last + 1]) {
            lo = cc.ranges[last];
            cc.ranges.length = save;
          } else isSet = true;
        } else isSet = true;
      }
      if (isSet) continue;
      if (this.more() && this.peek() == 45 && this.pos + 1 < this.src.length && this.src.charCodeAt(this.pos + 1) != 93) {
        this.pos++;
        let hi = this.peek();
        this.pos++;
        if (hi == 92) {
          const save2 = cc.ranges.length;
          this.parseEscape(true, cc);
          if (cc.ranges.length - save2 != 2) this.fail("bad range in character class");
          hi = cc.ranges[save2];
          cc.ranges.length = save2;
        }
        if (hi < lo) this.fail("bad range in character class");
        cc.addRange(lo, hi);
      } else {
        cc.addRange(lo, lo);
      }
    }
    const n = new Node(N_CLASS);
    n.cls = cc;
    return n;
  }
}

export class Regex {
  source: string;
  ngroups: i32 = 0;
  icase: bool = false;
  dotall: bool = false;
  multiline: bool = false;
  ops: Array<i32> = new Array<i32>();
  xs: Array<i32> = new Array<i32>();
  ys: Array<i32> = new Array<i32>();
  classes: Array<CharClass> = new Array<CharClass>();
  nslots: i32 = 0;
  regs: Array<i32> = new Array<i32>();
  stack: Array<i32> = new Array<i32>();

  constructor(source: string) {
    this.source = source;
    const p = new Parser(source);
    const ast = p.parseTop();
    this.ngroups = p.ngroups;
    this.icase = p.icase;
    this.dotall = p.dotall;
    this.multiline = p.multiline;
    this.nslots = 2 * (p.ngroups + 1);
    this.emitI(OP_SAVE, 0, 0);
    this.compile(ast);
    this.emitI(OP_SAVE, 1, 0);
    this.emitI(OP_MATCH, 0, 0);
    for (let i = 0; i < this.nslots; i++) this.regs.push(-1);
    for (let i = this.regs.length; i < this.nslots; i++) this.regs.push(-1);
  }

  emitI(op: i32, x: i32, y: i32): i32 {
    if (this.ops.length >= MAX_PROG) abort("regex /" + this.source + "/: pattern too large");
    this.ops.push(op);
    this.xs.push(x);
    this.ys.push(y);
    return this.ops.length - 1;
  }

  nullable(n: Node): bool {
    switch (n.kind) {
      case N_CHAR:
      case N_ANY:
      case N_CLASS:
        return false;
      case N_CAT: {
        for (let i = 0; i < n.kids.length; i++) if (!this.nullable(n.kids[i])) return false;
        return true;
      }
      case N_ALT: {
        for (let i = 0; i < n.kids.length; i++) if (this.nullable(n.kids[i])) return true;
        return false;
      }
      case N_GROUP:
        return this.nullable(n.kids[0]);
      case N_REP:
        return n.min == 0 || this.nullable(n.kids[0]);
      default:
        return true;
    }
  }

  compile(n: Node): void {
    switch (n.kind) {
      case N_EMPTY:
        return;
      case N_CHAR:
        this.emitI(OP_CHAR, n.ch, 0);
        return;
      case N_ANY:
        this.emitI(OP_ANY, 0, 0);
        return;
      case N_CLASS: {
        this.classes.push(n.cls!);
        this.emitI(OP_CLASS, this.classes.length - 1, 0);
        return;
      }
      case N_ASSERT:
        this.emitI(n.ch, 0, 0);
        return;
      case N_CAT: {
        for (let i = 0; i < n.kids.length; i++) this.compile(n.kids[i]);
        return;
      }
      case N_ALT: {
        const jumps = new Array<i32>();
        for (let i = 0; i < n.kids.length; i++) {
          if (i < n.kids.length - 1) {
            const sp = this.emitI(OP_SPLIT, 0, 0);
            this.xs[sp] = this.ops.length;
            this.compile(n.kids[i]);
            jumps.push(this.emitI(OP_JMP, 0, 0));
            this.ys[sp] = this.ops.length;
          } else {
            this.compile(n.kids[i]);
          }
        }
        for (let i = 0; i < jumps.length; i++) this.xs[jumps[i]] = this.ops.length;
        return;
      }
      case N_GROUP: {
        if (n.idx >= 0) this.emitI(OP_SAVE, 2 * n.idx, 0);
        this.compile(n.kids[0]);
        if (n.idx >= 0) this.emitI(OP_SAVE, 2 * n.idx + 1, 0);
        return;
      }
      case N_REP: {
        const body = n.kids[0];
        for (let i = 0; i < n.min; i++) this.compile(body);
        if (n.max < 0) {
          const nul = this.nullable(body);
          let slot: i32 = 0;
          if (nul) {
            slot = this.nslots;
            this.nslots++;
          }
          const l1 = this.emitI(OP_SPLIT, 0, 0);
          const bodyStart = this.ops.length;
          if (nul) this.emitI(OP_SAVE, slot, 0);
          this.compile(body);
          if (nul) this.emitI(OP_PROGRESS, slot, 0);
          this.emitI(OP_JMP, l1, 0);
          const end = this.ops.length;
          if (n.greedy) {
            this.xs[l1] = bodyStart;
            this.ys[l1] = end;
          } else {
            this.xs[l1] = end;
            this.ys[l1] = bodyStart;
          }
        } else {
          const splits = new Array<i32>();
          for (let i = n.min; i < n.max; i++) {
            const sp = this.emitI(OP_SPLIT, 0, 0);
            splits.push(sp);
            this.compile(body);
          }
          const end = this.ops.length;
          for (let i = 0; i < splits.length; i++) {
            const sp = splits[i];
            if (n.greedy) {
              this.xs[sp] = sp + 1;
              this.ys[sp] = end;
            } else {
              this.xs[sp] = end;
              this.ys[sp] = sp + 1;
            }
          }
        }
        return;
      }
    }
  }

  /** Try to match starting exactly at `start`. With `full`, the match must reach the end of `s`. */
  matchAt(s: string, start: i32, full: bool): bool {
    const len = s.length;
    while (this.regs.length < this.nslots) this.regs.push(-1);
    for (let i = 0; i < this.regs.length; i++) this.regs[i] = -1;
    const st = this.stack;
    st.length = 0;
    let pc: i32 = 0;
    let pos: i32 = start;
    let steps: i32 = 0;
    while (true) {
      if (++steps > STEP_LIMIT) abort("regex /" + this.source + "/: step limit exceeded");
      let ok = true;
      const op = this.ops[pc];
      if (op == OP_CHAR) {
        if (pos < len) {
          const c = s.charCodeAt(pos);
          const want = this.xs[pc];
          if (c == want || (this.icase && lower(c) == lower(want))) {
            pos++;
            pc++;
          } else ok = false;
        } else ok = false;
      } else if (op == OP_ANY) {
        if (pos < len) {
          const c = s.charCodeAt(pos);
          if (this.dotall || (c != 10 && c != 13 && c != 0x2028 && c != 0x2029)) {
            pos++;
            pc++;
          } else ok = false;
        } else ok = false;
      } else if (op == OP_CLASS) {
        if (pos < len && this.classes[this.xs[pc]].test(s.charCodeAt(pos), this.icase)) {
          pos++;
          pc++;
        } else ok = false;
      } else if (op == OP_SPLIT) {
        st.push(0);
        st.push(this.ys[pc]);
        st.push(pos);
        pc = this.xs[pc];
      } else if (op == OP_JMP) {
        pc = this.xs[pc];
      } else if (op == OP_SAVE) {
        const slot = this.xs[pc];
        st.push(1);
        st.push(slot);
        st.push(this.regs[slot]);
        this.regs[slot] = pos;
        pc++;
      } else if (op == OP_BOL) {
        if (pos == 0 || (this.multiline && s.charCodeAt(pos - 1) == 10)) pc++;
        else ok = false;
      } else if (op == OP_EOL) {
        if (pos == len || (this.multiline && s.charCodeAt(pos) == 10)) pc++;
        else ok = false;
      } else if (op == OP_WORDB || op == OP_NWORDB) {
        const a = pos > 0 && isWord(s.charCodeAt(pos - 1));
        const b = pos < len && isWord(s.charCodeAt(pos));
        if ((a != b) == (op == OP_WORDB)) pc++;
        else ok = false;
      } else if (op == OP_PROGRESS) {
        if (this.regs[this.xs[pc]] == pos) ok = false;
        else pc++;
      } else {
        // OP_MATCH
        if (full && pos != len) ok = false;
        else return true;
      }
      if (!ok) {
        let resumed = false;
        while (st.length > 0) {
          const e = st.pop();
          const a = st.pop();
          const kind = st.pop();
          if (kind == 0) {
            pc = a;
            pos = e;
            resumed = true;
            break;
          }
          this.regs[a] = e;
        }
        if (!resumed) return false;
      }
    }
    return false;
  }

  /** Find the first match at or after `from`. */
  search(s: string, from: i32): bool {
    for (let i = from; i <= s.length; i++) {
      if (this.matchAt(s, i, false)) return true;
    }
    return false;
  }

  groupStart(i: i32): i32 {
    return this.regs[2 * i];
  }
  groupEnd(i: i32): i32 {
    return this.regs[2 * i + 1];
  }
}
