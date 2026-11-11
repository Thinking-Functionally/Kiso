var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};

// dist/runtime/vector.js
function newPath(level, leaf) {
  if (level === 0)
    return leaf;
  return [newPath(level - BITS, leaf)];
}
function pushTail(count3, level, parent, tail) {
  const subIdx = count3 - 1 >>> level & MASK;
  const result = parent.slice();
  if (level === BITS) {
    result[subIdx] = tail;
  } else {
    const child = parent[subIdx];
    if (child) {
      result[subIdx] = pushTail(count3, level - BITS, child, tail);
    } else {
      result[subIdx] = newPath(level - BITS, tail);
    }
  }
  return result;
}
function assocPath(level, node, index, val) {
  const result = node.slice();
  if (level === 0) {
    result[index & MASK] = val;
  } else {
    const subIdx = index >>> level & MASK;
    result[subIdx] = assocPath(level - BITS, node[subIdx], index, val);
  }
  return result;
}
function popTail(count3, level, node) {
  const subIdx = count3 - 2 >>> level & MASK;
  if (level > BITS) {
    const newChild = popTail(count3, level - BITS, node[subIdx]);
    if (newChild.length === 0 && subIdx === 0) {
      return [];
    }
    const result2 = node.slice();
    result2[subIdx] = newChild.length === 0 ? void 0 : newChild;
    return result2;
  }
  if (subIdx === 0) {
    return [];
  }
  const result = node.slice();
  result[subIdx] = void 0;
  return result;
}
function vector(...args) {
  let v = EMPTY_VECTOR;
  for (let i = 0; i < args.length; i++) {
    v = v.conj(args[i]);
  }
  return v;
}
function isVector(x) {
  return x instanceof PersistentVector;
}
var BITS, WIDTH, MASK, EMPTY_NODE, VEC_TAG, PersistentVector, EMPTY_VECTOR;
var init_vector = __esm({
  "dist/runtime/vector.js"() {
    "use strict";
    BITS = 5;
    WIDTH = 1 << BITS;
    MASK = WIDTH - 1;
    EMPTY_NODE = [];
    VEC_TAG = /* @__PURE__ */ Symbol.for("kiso.vector");
    PersistentVector = class _PersistentVector {
      _tag = VEC_TAG;
      count;
      shift;
      root;
      tail;
      constructor(count3, shift, root, tail) {
        this.count = count3;
        this.shift = shift;
        this.root = root;
        this.tail = tail;
      }
      nth(index) {
        if (index < 0 || index >= this.count)
          return void 0;
        if (index >= this.tailOffset()) {
          return this.tail[index - this.tailOffset()];
        }
        let node = this.root;
        for (let level = this.shift; level > 0; level -= BITS) {
          node = node[index >>> level & MASK];
        }
        return node[index & MASK];
      }
      conj(val) {
        if (this.count - this.tailOffset() < WIDTH) {
          const newTail = this.tail.slice();
          newTail.push(val);
          return new _PersistentVector(this.count + 1, this.shift, this.root, newTail);
        }
        let newRoot;
        let newShift = this.shift;
        if (this.count >>> BITS > 1 << this.shift) {
          newRoot = [this.root, newPath(this.shift, this.tail)];
          newShift += BITS;
        } else {
          newRoot = pushTail(this.count, this.shift, this.root, this.tail);
        }
        return new _PersistentVector(this.count + 1, newShift, newRoot, [val]);
      }
      assocN(index, val) {
        if (index < 0 || index >= this.count) {
          throw new RangeError(`Index ${index} out of bounds for vector of size ${this.count}`);
        }
        if (index >= this.tailOffset()) {
          const newTail = this.tail.slice();
          newTail[index - this.tailOffset()] = val;
          return new _PersistentVector(this.count, this.shift, this.root, newTail);
        }
        const newRoot = assocPath(this.shift, this.root, index, val);
        return new _PersistentVector(this.count, this.shift, newRoot, this.tail);
      }
      pop() {
        if (this.count === 0) {
          throw new Error("Cannot pop empty vector");
        }
        if (this.count === 1) {
          return EMPTY_VECTOR;
        }
        if (this.count - this.tailOffset() > 1) {
          const newTail2 = this.tail.slice(0, -1);
          return new _PersistentVector(this.count - 1, this.shift, this.root, newTail2);
        }
        const newTail = this.getLeaf(this.count - 2);
        let newRoot = popTail(this.count, this.shift, this.root);
        let newShift = this.shift;
        if (this.shift > BITS && newRoot[1] === void 0) {
          newRoot = newRoot[0];
          newShift -= BITS;
        }
        return new _PersistentVector(this.count - 1, newShift, newRoot, newTail);
      }
      tailOffset() {
        if (this.count < WIDTH)
          return 0;
        return this.count - 1 >>> BITS << BITS;
      }
      getLeaf(index) {
        let node = this.root;
        for (let level = this.shift; level > 0; level -= BITS) {
          node = node[index >>> level & MASK];
        }
        return node;
      }
    };
    EMPTY_VECTOR = new PersistentVector(0, BITS, EMPTY_NODE, []);
  }
});

// dist/runtime/hash.js
function imul(a, b) {
  return Math.imul(a, b);
}
function hashNull() {
  return 0;
}
function hashBoolean(v) {
  return v ? 1231 : 1237;
}
function hashInt(n) {
  return n | 0;
}
function hashFloat(n) {
  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  view.setFloat64(0, n);
  const lo = view.getInt32(4, false);
  const hi = view.getInt32(0, false);
  return lo ^ hi | 0;
}
function hashString(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = imul(h, 31) + s.charCodeAt(i) | 0;
  }
  return h;
}
var init_hash = __esm({
  "dist/runtime/hash.js"() {
    "use strict";
  }
});

// dist/runtime/hash-map.js
function hashKey(key) {
  if (key === null || key === void 0)
    return hashNull();
  if (typeof key === "number")
    return Number.isInteger(key) ? hashInt(key) : hashFloat(key);
  if (typeof key === "string")
    return hashString(key);
  if (typeof key === "boolean")
    return hashBoolean(key);
  if (typeof key === "object" && key !== null && "hash" in key) {
    return key.hash;
  }
  if (hooks !== null && (typeof key === "object" || typeof key === "function")) {
    const h = hooks.hash(key);
    if (h !== void 0)
      return h;
  }
  return hashString(String(key));
}
function setStructuralHooks(h) {
  hooks = h;
}
function keysEqual(a, b) {
  return a === b || hooks !== null && typeof a === "object" && a !== null && hooks.eq(a, b);
}
function bitpos(hash2, shift) {
  return 1 << (hash2 >>> shift & MASK2);
}
function popcount(x) {
  x = x - (x >>> 1 & 1431655765);
  x = (x & 858993459) + (x >>> 2 & 858993459);
  return (x + (x >>> 4) & 252645135) * 16843009 >>> 24;
}
function arrayInsert(arr, idx, val) {
  const result = arr.slice();
  result.splice(idx, 0, val);
  return result;
}
function arrayRemove(arr, idx) {
  const result = arr.slice();
  result.splice(idx, 1);
  return result;
}
function createTwoNode(hash1, key1, val1, hash2, key2, val2, shift) {
  if (hash1 === hash2) {
    return new CollisionNode(hash1, [{ key: key1, val: val1 }, { key: key2, val: val2 }]);
  }
  const bit1 = bitpos(hash1, shift);
  const bit2 = bitpos(hash2, shift);
  if (bit1 !== bit2) {
    const kv1 = { key: key1, val: val1 };
    const kv2 = { key: key2, val: val2 };
    const idx1 = popcount((bit1 | bit2) & bit1 - 1);
    const kvs = idx1 === 0 ? [kv1, kv2] : [kv2, kv1];
    return new BitmapNode(bit1 | bit2, 0, kvs, []);
  }
  const child = createTwoNode(hash1, key1, val1, hash2, key2, val2, shift + BITS2);
  return new BitmapNode(0, bit1, [], [child]);
}
function hashMap(...kvs) {
  let m = EMPTY_MAP;
  for (let i = 0; i < kvs.length; i += 2) {
    m = m.assoc(kvs[i], kvs[i + 1]);
  }
  return m;
}
function isHashMap(x) {
  return x instanceof PersistentHashMap;
}
var BITS2, MASK2, MAP_TAG, hooks, BitmapNode, CollisionNode, ARRAY_MAP_MAX, ArrayNode, EMPTY_ROOT, PersistentHashMap, EMPTY_MAP;
var init_hash_map = __esm({
  "dist/runtime/hash-map.js"() {
    "use strict";
    init_hash();
    BITS2 = 5;
    MASK2 = (1 << BITS2) - 1;
    MAP_TAG = /* @__PURE__ */ Symbol.for("kiso.hashmap");
    hooks = null;
    BitmapNode = class _BitmapNode {
      dataMap;
      nodeMap;
      kvs;
      nodes;
      constructor(dataMap, nodeMap, kvs, nodes) {
        this.dataMap = dataMap;
        this.nodeMap = nodeMap;
        this.kvs = kvs;
        this.nodes = nodes;
      }
      get(hash2, shift, key) {
        const bit = bitpos(hash2, shift);
        if (this.dataMap & bit) {
          const idx = popcount(this.dataMap & bit - 1);
          const kv = this.kvs[idx];
          if (keysEqual(kv.key, key))
            return kv.val;
          return void 0;
        }
        if (this.nodeMap & bit) {
          const idx = popcount(this.nodeMap & bit - 1);
          return this.nodes[idx].get(hash2, shift + BITS2, key);
        }
        return void 0;
      }
      assoc(hash2, shift, key, val) {
        const bit = bitpos(hash2, shift);
        if (this.dataMap & bit) {
          const idx2 = popcount(this.dataMap & bit - 1);
          const existing = this.kvs[idx2];
          if (keysEqual(existing.key, key)) {
            if (existing.val === val)
              return { node: this, added: false };
            const newKvs3 = this.kvs.slice();
            newKvs3[idx2] = { key, val };
            return { node: new _BitmapNode(this.dataMap, this.nodeMap, newKvs3, this.nodes), added: false };
          }
          const existingHash = hashKey(existing.key);
          const child = createTwoNode(existingHash, existing.key, existing.val, hash2, key, val, shift + BITS2);
          const newKvs2 = arrayRemove(this.kvs, idx2);
          const nodeIdx = popcount(this.nodeMap & bit - 1);
          const newNodes = arrayInsert(this.nodes, nodeIdx, child);
          return {
            node: new _BitmapNode(this.dataMap ^ bit, this.nodeMap | bit, newKvs2, newNodes),
            added: true
          };
        }
        if (this.nodeMap & bit) {
          const idx2 = popcount(this.nodeMap & bit - 1);
          const child = this.nodes[idx2];
          const result = child.assoc(hash2, shift + BITS2, key, val);
          if (result.node === child)
            return { node: this, added: false };
          const newNodes = this.nodes.slice();
          newNodes[idx2] = result.node;
          return { node: new _BitmapNode(this.dataMap, this.nodeMap, this.kvs, newNodes), added: result.added };
        }
        const idx = popcount(this.dataMap & bit - 1);
        const newKvs = arrayInsert(this.kvs, idx, { key, val });
        return {
          node: new _BitmapNode(this.dataMap | bit, this.nodeMap, newKvs, this.nodes),
          added: true
        };
      }
      dissoc(hash2, shift, key) {
        const bit = bitpos(hash2, shift);
        if (this.dataMap & bit) {
          const idx = popcount(this.dataMap & bit - 1);
          if (!keysEqual(this.kvs[idx].key, key))
            return this;
          if (this.kvs.length === 1 && this.nodes.length === 0)
            return null;
          const newKvs = arrayRemove(this.kvs, idx);
          return new _BitmapNode(this.dataMap ^ bit, this.nodeMap, newKvs, this.nodes);
        }
        if (this.nodeMap & bit) {
          const idx = popcount(this.nodeMap & bit - 1);
          const child = this.nodes[idx];
          const newChild = child.dissoc(hash2, shift + BITS2, key);
          if (newChild === child)
            return this;
          if (newChild === null) {
            if (this.kvs.length === 0 && this.nodes.length === 1)
              return null;
            const newNodes2 = arrayRemove(this.nodes, idx);
            return new _BitmapNode(this.dataMap, this.nodeMap ^ bit, this.kvs, newNodes2);
          }
          if (newChild instanceof _BitmapNode && newChild.kvs.length === 1 && newChild.nodes.length === 0) {
            const kv = newChild.kvs[0];
            const kvIdx = popcount(this.dataMap & bit - 1);
            const newKvs = arrayInsert(this.kvs, kvIdx, kv);
            const newNodes2 = arrayRemove(this.nodes, idx);
            return new _BitmapNode(this.dataMap | bit, this.nodeMap ^ bit, newKvs, newNodes2);
          }
          const newNodes = this.nodes.slice();
          newNodes[idx] = newChild;
          return new _BitmapNode(this.dataMap, this.nodeMap, this.kvs, newNodes);
        }
        return this;
      }
      forEach(fn) {
        for (const kv of this.kvs)
          fn(kv.key, kv.val);
        for (const node of this.nodes)
          node.forEach(fn);
      }
    };
    CollisionNode = class _CollisionNode {
      collHash;
      kvs;
      constructor(collHash, kvs) {
        this.collHash = collHash;
        this.kvs = kvs;
      }
      get(_hash, _shift, key) {
        for (const kv of this.kvs) {
          if (keysEqual(kv.key, key))
            return kv.val;
        }
        return void 0;
      }
      assoc(hash2, shift, key, val) {
        if (hash2 !== this.collHash) {
          const newNode = new BitmapNode(0, 0, [], []);
          const r1 = newNode.assoc(this.collHash, shift, this.kvs[0].key, this.kvs[0].val);
          let current = r1.node;
          for (let i = 1; i < this.kvs.length; i++) {
            current = current.assoc(this.collHash, shift, this.kvs[i].key, this.kvs[i].val).node;
          }
          return current.assoc(hash2, shift, key, val);
        }
        for (let i = 0; i < this.kvs.length; i++) {
          if (keysEqual(this.kvs[i].key, key)) {
            if (this.kvs[i].val === val)
              return { node: this, added: false };
            const newKvs = this.kvs.slice();
            newKvs[i] = { key, val };
            return { node: new _CollisionNode(this.collHash, newKvs), added: false };
          }
        }
        return { node: new _CollisionNode(this.collHash, [...this.kvs, { key, val }]), added: true };
      }
      dissoc(_hash, _shift, key) {
        for (let i = 0; i < this.kvs.length; i++) {
          if (keysEqual(this.kvs[i].key, key)) {
            if (this.kvs.length === 1)
              return null;
            if (this.kvs.length === 2) {
              const other = this.kvs[1 - i];
              return new BitmapNode(bitpos(this.collHash, 0), 0, [other], []);
            }
            return new _CollisionNode(this.collHash, arrayRemove(this.kvs, i));
          }
        }
        return this;
      }
      forEach(fn) {
        for (const kv of this.kvs)
          fn(kv.key, kv.val);
      }
    };
    ARRAY_MAP_MAX = 8;
    ArrayNode = class _ArrayNode {
      kvs;
      constructor(kvs) {
        this.kvs = kvs;
      }
      indexOf(key) {
        for (let i = 0; i < this.kvs.length; i++)
          if (keysEqual(this.kvs[i].key, key))
            return i;
        return -1;
      }
      get(_hash, _shift, key) {
        const i = this.indexOf(key);
        return i < 0 ? void 0 : this.kvs[i].val;
      }
      assoc(_hash, _shift, key, val) {
        const i = this.indexOf(key);
        if (i >= 0) {
          if (this.kvs[i].val === val)
            return { node: this, added: false };
          const kvs = this.kvs.slice();
          kvs[i] = { key: this.kvs[i].key, val };
          return { node: new _ArrayNode(kvs), added: false };
        }
        if (this.kvs.length < ARRAY_MAP_MAX)
          return { node: new _ArrayNode([...this.kvs, { key, val }]), added: true };
        let node = new BitmapNode(0, 0, [], []);
        for (const kv of this.kvs)
          node = node.assoc(hashKey(kv.key), 0, kv.key, kv.val).node;
        return { node: node.assoc(hashKey(key), 0, key, val).node, added: true };
      }
      dissoc(_hash, _shift, key) {
        const i = this.indexOf(key);
        if (i < 0)
          return this;
        return this.kvs.length === 1 ? null : new _ArrayNode(arrayRemove(this.kvs, i));
      }
      forEach(fn) {
        for (const kv of this.kvs)
          fn(kv.key, kv.val);
      }
    };
    EMPTY_ROOT = new ArrayNode([]);
    PersistentHashMap = class _PersistentHashMap {
      root;
      hasNull;
      nullVal;
      _tag = MAP_TAG;
      count;
      constructor(count3, root, hasNull, nullVal) {
        this.root = root;
        this.hasNull = hasNull;
        this.nullVal = nullVal;
        this.count = count3;
      }
      get(key) {
        if (key === null || key === void 0) {
          return this.hasNull ? this.nullVal : void 0;
        }
        return this.root.get(hashKey(key), 0, key);
      }
      has(key) {
        if (key === null || key === void 0)
          return this.hasNull;
        return this.root.get(hashKey(key), 0, key) !== void 0;
      }
      assoc(key, val) {
        if (key === null || key === void 0) {
          if (this.hasNull && this.nullVal === val)
            return this;
          return new _PersistentHashMap(this.count + (this.hasNull ? 0 : 1), this.root, true, val);
        }
        const result = this.root.assoc(hashKey(key), 0, key, val);
        if (result.node === this.root)
          return this;
        return new _PersistentHashMap(this.count + (result.added ? 1 : 0), result.node, this.hasNull, this.nullVal);
      }
      forEach(fn) {
        if (this.hasNull)
          fn(null, this.nullVal);
        this.root.forEach(fn);
      }
      dissoc(key) {
        if (key === null || key === void 0) {
          if (!this.hasNull)
            return this;
          return new _PersistentHashMap(this.count - 1, this.root, false, void 0);
        }
        const newRoot = this.root.dissoc(hashKey(key), 0, key);
        if (newRoot === this.root)
          return this;
        return new _PersistentHashMap(this.count - 1, newRoot ?? EMPTY_ROOT, this.hasNull, this.nullVal);
      }
    };
    EMPTY_MAP = new PersistentHashMap(0, EMPTY_ROOT, false, void 0);
  }
});

// dist/runtime/hash-set.js
function isHashSet(x) {
  return x instanceof PersistentHashSet;
}
var SET_TAG, PRESENT, PersistentHashSet, EMPTY_SET;
var init_hash_set = __esm({
  "dist/runtime/hash-set.js"() {
    "use strict";
    init_hash_map();
    SET_TAG = /* @__PURE__ */ Symbol.for("kiso.hashset");
    PRESENT = true;
    PersistentHashSet = class _PersistentHashSet {
      impl;
      _tag = SET_TAG;
      count;
      constructor(impl) {
        this.impl = impl;
        this.count = impl.count;
      }
      has(key) {
        return this.impl.has(key);
      }
      conj(key) {
        const newImpl = this.impl.assoc(key, PRESENT);
        if (newImpl === this.impl)
          return this;
        return new _PersistentHashSet(newImpl);
      }
      forEach(fn) {
        this.impl.forEach((key) => fn(key));
      }
      disj(key) {
        const newImpl = this.impl.dissoc(key);
        if (newImpl === this.impl)
          return this;
        return new _PersistentHashSet(newImpl);
      }
    };
    EMPTY_SET = new PersistentHashSet(EMPTY_MAP);
  }
});

// dist/runtime/keyword.js
function computeKeywordHash(name2, ns) {
  let h = KW_HASH_SEED;
  if (ns !== null) {
    h = Math.imul(h, 31) + hashString(ns) | 0;
  }
  h = Math.imul(h, 31) + hashString(name2) | 0;
  return h;
}
function internKey(name2, ns) {
  return ns ? `${ns}/${name2}` : name2;
}
function setKeywordLookup(f) {
  keywordLookup = f;
}
function keyword(name2, ns) {
  const nsVal = ns ?? null;
  const key = internKey(name2, nsVal);
  const existing = INTERN.get(key);
  if (existing)
    return existing;
  const hash2 = computeKeywordHash(name2, nsVal);
  const fn = function kwFn(coll, notFound) {
    const defaultVal = notFound !== void 0 ? notFound : null;
    if (coll === null || coll === void 0)
      return defaultVal;
    if (isHashMap(coll)) {
      const v = coll.get(fn);
      return v !== void 0 ? v : defaultVal;
    }
    return keywordLookup ? keywordLookup(coll, fn, defaultVal) : defaultVal;
  };
  Object.defineProperty(fn, "_tag", { value: KW_TAG });
  Object.defineProperty(fn, "ns", { value: nsVal });
  Object.defineProperty(fn, "name", { value: name2, configurable: true });
  Object.defineProperty(fn, "hash", { value: hash2 });
  fn.toString = () => nsVal ? `:${nsVal}/${name2}` : `:${name2}`;
  INTERN.set(key, fn);
  return fn;
}
function isKeyword(x) {
  return typeof x === "function" && x._tag === KW_TAG;
}
var KW_HASH_SEED, KW_TAG, INTERN, keywordLookup;
var init_keyword = __esm({
  "dist/runtime/keyword.js"() {
    "use strict";
    init_hash();
    init_hash_map();
    KW_HASH_SEED = 2654435769;
    KW_TAG = /* @__PURE__ */ Symbol.for("kiso.keyword");
    INTERN = /* @__PURE__ */ new Map();
    keywordLookup = null;
  }
});

// dist/runtime/symbol.js
function computeSymbolHash(name2, ns) {
  let h = SYM_HASH_SEED;
  if (ns !== null) {
    h = Math.imul(h, 31) + hashString(ns) | 0;
  }
  h = Math.imul(h, 31) + hashString(name2) | 0;
  return h;
}
function isSymbol(x) {
  return x instanceof Sym;
}
var SYM_HASH_SEED, SYM_TAG, Sym;
var init_symbol = __esm({
  "dist/runtime/symbol.js"() {
    "use strict";
    init_hash();
    SYM_HASH_SEED = 1367130551;
    SYM_TAG = /* @__PURE__ */ Symbol.for("kiso.symbol");
    Sym = class {
      _tag = SYM_TAG;
      ns;
      name;
      hash;
      constructor(name2, ns) {
        this.name = name2;
        this.ns = ns;
        this.hash = computeSymbolHash(name2, ns);
      }
      toString() {
        return this.ns ? `${this.ns}/${this.name}` : this.name;
      }
    };
  }
});

// dist/runtime/list.js
function cons(x, coll) {
  return new Cons(x, coll);
}
function first(l) {
  if (l instanceof Cons)
    return l._first;
  return null;
}
function rest(l) {
  if (l instanceof Cons)
    return l._rest;
  return EMPTY_LIST;
}
function count(l) {
  return l._count;
}
function listOf(items) {
  let result = EMPTY_LIST;
  for (let i = items.length - 1; i >= 0; i--)
    result = new Cons(items[i], result);
  return result;
}
function isList(x) {
  return x instanceof Cons || x instanceof EmptyList;
}
var LIST_TAG, Cons, EmptyList, EMPTY_LIST;
var init_list = __esm({
  "dist/runtime/list.js"() {
    "use strict";
    LIST_TAG = /* @__PURE__ */ Symbol.for("kiso.list");
    Cons = class {
      _tag = LIST_TAG;
      _first;
      _rest;
      _count;
      constructor(first3, rest3) {
        this._first = first3;
        this._rest = rest3;
        const rc = rest3._count;
        this._count = typeof rc === "number" && rc >= 0 ? rc + 1 : -1;
      }
    };
    EmptyList = class {
      _tag = LIST_TAG;
      _count = 0;
    };
    EMPTY_LIST = new EmptyList();
  }
});

// dist/runtime/array-map.js
function isArrayMap(x) {
  return x instanceof PersistentArrayMap;
}
var ARRAY_MAP_TAG, THRESHOLD, PersistentArrayMap;
var init_array_map = __esm({
  "dist/runtime/array-map.js"() {
    "use strict";
    init_hash_map();
    ARRAY_MAP_TAG = /* @__PURE__ */ Symbol.for("kiso.arraymap");
    THRESHOLD = 8;
    PersistentArrayMap = class _PersistentArrayMap {
      _tag = ARRAY_MAP_TAG;
      count;
      // Flat array: [k0, v0, k1, v1, ...]
      arr;
      constructor(arr) {
        this.arr = arr;
        this.count = arr.length >>> 1;
      }
      indexOf(key) {
        for (let i = 0; i < this.arr.length; i += 2) {
          if (this.arr[i] === key)
            return i;
        }
        return -1;
      }
      get(key, notFound) {
        const idx = this.indexOf(key);
        if (idx === -1)
          return notFound;
        return this.arr[idx + 1];
      }
      has(key) {
        return this.indexOf(key) !== -1;
      }
      assoc(key, val) {
        const idx = this.indexOf(key);
        if (idx !== -1) {
          if (this.arr[idx + 1] === val)
            return this;
          const newArr2 = this.arr.slice();
          newArr2[idx + 1] = val;
          return new _PersistentArrayMap(newArr2);
        }
        if (this.count >= THRESHOLD) {
          let m = hashMap(...this.arr);
          m = m.assoc(key, val);
          return m;
        }
        const newArr = [...this.arr, key, val];
        return new _PersistentArrayMap(newArr);
      }
      dissoc(key) {
        const idx = this.indexOf(key);
        if (idx === -1)
          return this;
        const newArr = [];
        for (let i = 0; i < this.arr.length; i += 2) {
          if (i !== idx) {
            newArr.push(this.arr[i], this.arr[i + 1]);
          }
        }
        return new _PersistentArrayMap(newArr);
      }
      forEach(fn) {
        for (let i = 0; i < this.arr.length; i += 2) {
          fn(this.arr[i], this.arr[i + 1]);
        }
      }
    };
  }
});

// dist/runtime/sorted-map.js
function defaultCompare(a, b) {
  if (a === b)
    return 0;
  if (a === null)
    return -1;
  if (b === null)
    return 1;
  if (typeof a === "number" && typeof b === "number")
    return a < b ? -1 : a > b ? 1 : 0;
  if (typeof a === "string" && typeof b === "string")
    return a < b ? -1 : a > b ? 1 : 0;
  if (isKeyword(a) && isKeyword(b)) {
    const sa = a.toString(), sb = b.toString();
    return sa < sb ? -1 : sa > sb ? 1 : 0;
  }
  if (isSymbol(a) && isSymbol(b)) {
    const sa = a.toString(), sb = b.toString();
    return sa < sb ? -1 : sa > sb ? 1 : 0;
  }
  return 0;
}
function isRed(node) {
  return node !== null && node.color === RED;
}
function rotateLeft(h) {
  const x = h.right;
  return new RBNode(x.key, x.val, new RBNode(h.key, h.val, h.left, x.left, RED), x.right, h.color);
}
function rotateRight(h) {
  const x = h.left;
  return new RBNode(x.key, x.val, x.left, new RBNode(h.key, h.val, x.right, h.right, RED), h.color);
}
function flipColors(h) {
  return new RBNode(h.key, h.val, new RBNode(h.left.key, h.left.val, h.left.left, h.left.right, !h.left.color), new RBNode(h.right.key, h.right.val, h.right.left, h.right.right, !h.right.color), !h.color);
}
function balance(h) {
  let node = h;
  if (isRed(node.right) && !isRed(node.left))
    node = rotateLeft(node);
  if (isRed(node.left) && isRed(node.left.left))
    node = rotateRight(node);
  if (isRed(node.left) && isRed(node.right))
    node = flipColors(node);
  return node;
}
function insert(node, key, val, cmp) {
  if (node === null) {
    return { root: new RBNode(key, val, null, null, RED), added: true, replaced: false };
  }
  const c = cmp(key, node.key);
  if (c === 0) {
    if (node.val === val)
      return { root: node, added: false, replaced: false };
    return { root: new RBNode(node.key, val, node.left, node.right, node.color), added: false, replaced: true };
  }
  let left = node.left;
  let right = node.right;
  let added = false;
  let replaced = false;
  if (c < 0) {
    const result = insert(left, key, val, cmp);
    left = result.root;
    added = result.added;
    replaced = result.replaced;
  } else {
    const result = insert(right, key, val, cmp);
    right = result.root;
    added = result.added;
    replaced = result.replaced;
  }
  let h = new RBNode(node.key, node.val, left, right, node.color);
  h = balance(h);
  return { root: h, added, replaced };
}
function moveRedLeft(h) {
  let node = flipColors(h);
  if (isRed(node.right.left)) {
    node = new RBNode(node.key, node.val, node.left, rotateRight(node.right), node.color);
    node = rotateLeft(node);
    node = flipColors(node);
  }
  return node;
}
function moveRedRight(h) {
  let node = flipColors(h);
  if (isRed(node.left.left)) {
    node = rotateRight(node);
    node = flipColors(node);
  }
  return node;
}
function minNode(h) {
  let node = h;
  while (node.left !== null)
    node = node.left;
  return node;
}
function deleteMin(h) {
  if (h.left === null)
    return null;
  let node = h;
  if (!isRed(node.left) && !isRed(node.left.left)) {
    node = moveRedLeft(node);
  }
  const newLeft = deleteMin(node.left);
  node = new RBNode(node.key, node.val, newLeft, node.right, node.color);
  return balance(node);
}
function remove(h, key, cmp) {
  if (h === null)
    return { root: null, found: false };
  let node = h;
  let found = false;
  if (cmp(key, node.key) < 0) {
    if (node.left === null)
      return { root: node, found: false };
    if (!isRed(node.left) && !isRed(node.left.left)) {
      node = moveRedLeft(node);
    }
    const result = remove(node.left, key, cmp);
    found = result.found;
    node = new RBNode(node.key, node.val, result.root, node.right, node.color);
  } else {
    if (isRed(node.left)) {
      node = rotateRight(node);
    }
    if (cmp(key, node.key) === 0 && node.right === null) {
      return { root: null, found: true };
    }
    if (node.right !== null && !isRed(node.right) && !isRed(node.right.left)) {
      node = moveRedRight(node);
    }
    if (cmp(key, node.key) === 0) {
      const successor = minNode(node.right);
      const newRight = deleteMin(node.right);
      node = new RBNode(successor.key, successor.val, node.left, newRight, node.color);
      found = true;
    } else {
      const result = remove(node.right, key, cmp);
      found = result.found;
      node = new RBNode(node.key, node.val, node.left, result.root, node.color);
    }
  }
  return { root: balance(node), found };
}
function treeGet(node, key, cmp) {
  let n = node;
  while (n !== null) {
    const c = cmp(key, n.key);
    if (c === 0)
      return n.val;
    n = c < 0 ? n.left : n.right;
  }
  return void 0;
}
function treeHas(node, key, cmp) {
  let n = node;
  while (n !== null) {
    const c = cmp(key, n.key);
    if (c === 0)
      return true;
    n = c < 0 ? n.left : n.right;
  }
  return false;
}
function inOrder(node, fn) {
  if (node === null)
    return;
  inOrder(node.left, fn);
  fn(node.key, node.val);
  inOrder(node.right, fn);
}
function collectGte(node, key, cmp, result) {
  if (node === null)
    return;
  const c = cmp(node.key, key);
  if (c >= 0) {
    collectGte(node.left, key, cmp, result);
    result.push([node.key, node.val]);
    collectGte(node.right, key, cmp, result);
  } else {
    collectGte(node.right, key, cmp, result);
  }
}
function collectGt(node, key, cmp, result) {
  if (node === null)
    return;
  const c = cmp(node.key, key);
  if (c > 0) {
    collectGt(node.left, key, cmp, result);
    result.push([node.key, node.val]);
    collectGt(node.right, key, cmp, result);
  } else {
    collectGt(node.right, key, cmp, result);
  }
}
function collectLte(node, key, cmp, result) {
  if (node === null)
    return;
  const c = cmp(node.key, key);
  if (c <= 0) {
    collectLte(node.left, key, cmp, result);
    result.push([node.key, node.val]);
    collectLte(node.right, key, cmp, result);
  } else {
    collectLte(node.left, key, cmp, result);
  }
}
function collectLt(node, key, cmp, result) {
  if (node === null)
    return;
  const c = cmp(node.key, key);
  if (c < 0) {
    collectLt(node.left, key, cmp, result);
    result.push([node.key, node.val]);
    collectLt(node.right, key, cmp, result);
  } else {
    collectLt(node.left, key, cmp, result);
  }
}
function isSortedMap(x) {
  return x instanceof PersistentTreeMap;
}
var TREE_MAP_TAG, RED, BLACK, RBNode, PersistentTreeMap, EMPTY_SORTED_MAP;
var init_sorted_map = __esm({
  "dist/runtime/sorted-map.js"() {
    "use strict";
    init_keyword();
    init_symbol();
    TREE_MAP_TAG = /* @__PURE__ */ Symbol.for("kiso.treemap");
    RED = true;
    BLACK = false;
    RBNode = class {
      key;
      val;
      left;
      right;
      color;
      constructor(key, val, left, right, color) {
        this.key = key;
        this.val = val;
        this.left = left;
        this.right = right;
        this.color = color;
      }
    };
    PersistentTreeMap = class _PersistentTreeMap {
      _tag = TREE_MAP_TAG;
      count;
      root;
      cmp;
      constructor(root, count3, cmp) {
        this.root = root;
        this.count = count3;
        this.cmp = cmp;
      }
      get(key) {
        return treeGet(this.root, key, this.cmp);
      }
      has(key) {
        return treeHas(this.root, key, this.cmp);
      }
      assoc(key, val) {
        const result = insert(this.root, key, val, this.cmp);
        if (!result.added && !result.replaced)
          return this;
        const newRoot = new RBNode(result.root.key, result.root.val, result.root.left, result.root.right, BLACK);
        return new _PersistentTreeMap(newRoot, this.count + (result.added ? 1 : 0), this.cmp);
      }
      dissoc(key) {
        const result = remove(this.root, key, this.cmp);
        if (!result.found)
          return this;
        if (result.root === null)
          return new _PersistentTreeMap(null, 0, this.cmp);
        const newRoot = new RBNode(result.root.key, result.root.val, result.root.left, result.root.right, BLACK);
        return new _PersistentTreeMap(newRoot, this.count - 1, this.cmp);
      }
      forEach(fn) {
        inOrder(this.root, fn);
      }
      keys() {
        const result = [];
        inOrder(this.root, (k) => result.push(k));
        return result;
      }
      vals() {
        const result = [];
        inOrder(this.root, (_k, v) => result.push(v));
        return result;
      }
      /** Returns entries where key >= fromKey (inclusive=true) or key > fromKey (inclusive=false). */
      subseq(fromKey, inclusive = true) {
        const result = [];
        if (inclusive) {
          collectGte(this.root, fromKey, this.cmp, result);
        } else {
          collectGt(this.root, fromKey, this.cmp, result);
        }
        return result;
      }
      /** Returns entries where key <= toKey (inclusive=true) or key < toKey (inclusive=false), in reverse order. */
      rsubseq(toKey, inclusive = true) {
        const result = [];
        if (inclusive) {
          collectLte(this.root, toKey, this.cmp, result);
        } else {
          collectLt(this.root, toKey, this.cmp, result);
        }
        result.reverse();
        return result;
      }
      comparator() {
        return this.cmp;
      }
    };
    EMPTY_SORTED_MAP = new PersistentTreeMap(null, 0, defaultCompare);
  }
});

// dist/runtime/sorted-set.js
function isSortedSet(x) {
  return x instanceof PersistentTreeSet;
}
var TREE_SET_TAG, PRESENT2, PersistentTreeSet, EMPTY_SORTED_SET;
var init_sorted_set = __esm({
  "dist/runtime/sorted-set.js"() {
    "use strict";
    init_sorted_map();
    TREE_SET_TAG = /* @__PURE__ */ Symbol.for("kiso.treeset");
    PRESENT2 = true;
    PersistentTreeSet = class _PersistentTreeSet {
      impl;
      _tag = TREE_SET_TAG;
      count;
      constructor(impl) {
        this.impl = impl;
        this.count = impl.count;
      }
      has(key) {
        return this.impl.has(key);
      }
      conj(key) {
        const newImpl = this.impl.assoc(key, PRESENT2);
        if (newImpl === this.impl)
          return this;
        return new _PersistentTreeSet(newImpl);
      }
      disj(key) {
        const newImpl = this.impl.dissoc(key);
        if (newImpl === this.impl)
          return this;
        return new _PersistentTreeSet(newImpl);
      }
      comparator() {
        return this.impl.comparator();
      }
      keys() {
        return this.impl.keys();
      }
      forEach(fn) {
        this.impl.forEach((key) => fn(key));
      }
    };
    EMPTY_SORTED_SET = new PersistentTreeSet(EMPTY_SORTED_MAP);
  }
});

// dist/runtime/lazy-seq.js
var LazySeq;
var init_lazy_seq = __esm({
  "dist/runtime/lazy-seq.js"() {
    "use strict";
    LazySeq = class _LazySeq {
      fn;
      sv = null;
      realized = false;
      constructor(fn) {
        this.fn = fn;
      }
      sval() {
        if (this.fn !== null) {
          this.sv = this.fn();
          this.fn = null;
        }
        return this.sv;
      }
      realize() {
        if (!this.realized) {
          this.sval();
          let ls = this.sv;
          while (ls instanceof _LazySeq) {
            ls = ls.sval();
          }
          this.sv = ls;
          this.realized = true;
        }
        return this.sv;
      }
    };
  }
});

// dist/runtime/seq.js
function seq(coll) {
  if (coll === null || coll === void 0)
    return null;
  if (coll instanceof IndexedSeq)
    return coll;
  if (coll instanceof LazySeq) {
    const realized = coll.realize();
    return realized === null ? null : seq(realized);
  }
  if (isList(coll)) {
    return count(coll) === 0 ? null : coll;
  }
  if (isVector(coll)) {
    return coll.count === 0 ? null : new IndexedSeq(coll, 0);
  }
  if (typeof coll === "string") {
    return coll.length === 0 ? null : new IndexedSeq(Array.from(coll), 0);
  }
  if (Array.isArray(coll)) {
    return coll.length === 0 ? null : new IndexedSeq(coll, 0);
  }
  if (isHashMap(coll) || isArrayMap(coll) || isSortedMap(coll)) {
    const m = coll;
    if (m.count === 0)
      return null;
    const entries = [];
    m.forEach((k, v) => entries.push(vector(k, v)));
    return new IndexedSeq(entries, 0);
  }
  if (isHashSet(coll) || isSortedSet(coll)) {
    const s = coll;
    if (s.count === 0)
      return null;
    const items = [];
    s.forEach((k) => items.push(k));
    return new IndexedSeq(items, 0);
  }
  return null;
}
function first2(coll) {
  if (coll === null || coll === void 0)
    return null;
  if (isList(coll))
    return first(coll);
  if (coll instanceof IndexedSeq)
    return coll.first();
  if (coll instanceof LazySeq) {
    const s2 = seq(coll);
    return s2 === null ? null : first2(s2);
  }
  const s = seq(coll);
  if (s === null)
    return null;
  return first2(s);
}
function next(coll) {
  if (coll === null || coll === void 0)
    return null;
  if (isList(coll)) {
    const r = rest(coll);
    if (!isList(r))
      return seq(r);
    return count(r) === 0 ? null : r;
  }
  if (coll instanceof IndexedSeq) {
    return coll.rest();
  }
  if (coll instanceof LazySeq) {
    const s2 = seq(coll);
    if (s2 === null)
      return null;
    return next(s2);
  }
  const s = seq(coll);
  if (s === null)
    return null;
  return next(s);
}
function toArray(coll) {
  const result = [];
  let s = seq(coll);
  while (s !== null) {
    result.push(first2(s));
    s = next(s);
  }
  return result;
}
var IndexedSeq;
var init_seq = __esm({
  "dist/runtime/seq.js"() {
    "use strict";
    init_list();
    init_vector();
    init_hash_map();
    init_array_map();
    init_hash_set();
    init_core();
    init_sorted_map();
    init_sorted_set();
    init_lazy_seq();
    IndexedSeq = class _IndexedSeq {
      coll;
      index;
      constructor(coll, index) {
        this.coll = coll;
        this.index = index;
      }
      first() {
        if (this.coll instanceof PersistentVector) {
          return this.coll.nth(this.index);
        }
        return this.coll[this.index];
      }
      rest() {
        const len = this.coll instanceof PersistentVector ? this.coll.count : this.coll.length;
        if (this.index + 1 < len) {
          return new _IndexedSeq(this.coll, this.index + 1);
        }
        return null;
      }
    };
  }
});

// dist/runtime/record.js
function isRecord(x) {
  return typeof x === "object" && x !== null && Array.isArray(x.constructor?.__kiso_fields);
}
function fieldOf(r, key) {
  if (!isKeyword(key) || key.ns !== null)
    return null;
  return r.constructor.__kiso_fields.includes(key.name) ? key.name : null;
}
function recordGet(r, key) {
  const f = fieldOf(r, key);
  return f === null ? void 0 : r[f];
}
function recordEquiv(a, b, eq2) {
  if (!isRecord(b) || a.constructor !== b.constructor)
    return false;
  return a.constructor.__kiso_fields.every((n) => eq2(a[n], b[n]));
}
var init_record = __esm({
  "dist/runtime/record.js"() {
    "use strict";
    init_keyword();
  }
});

// dist/runtime/equiv.js
function mapEquiv(a, b) {
  let na = 0;
  let nb = 0;
  b.forEach(() => {
    nb++;
  });
  let same = true;
  a.forEach((k, v) => {
    na++;
    if (same && !(b.has(k) && equiv(v, b.get(k))))
      same = false;
  });
  return same && na === nb;
}
function setEquiv(a, b) {
  let na = 0;
  let nb = 0;
  b.forEach(() => {
    nb++;
  });
  let same = true;
  a.forEach((k) => {
    na++;
    if (same && !b.has(k))
      same = false;
  });
  return same && na === nb;
}
function seqEquiv(a, b) {
  let sa = seq(a);
  let sb = seq(b);
  while (sa !== null && sb !== null) {
    if (!equiv(first2(sa), first2(sb)))
      return false;
    sa = next(sa);
    sb = next(sb);
  }
  return sa === null && sb === null;
}
function equiv(a, b) {
  if (a == null && b == null)
    return true;
  if (a == null || b == null)
    return false;
  if (a === b)
    return true;
  if (typeof a === "number" && typeof b === "number") {
    return a === b;
  }
  if (typeof a === "boolean" || typeof b === "boolean") {
    return false;
  }
  if (typeof a === "string" && typeof b === "string") {
    return a === b;
  }
  if (typeof a !== typeof b)
    return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length)
      return false;
    for (let i = 0; i < a.length; i++) {
      if (!equiv(a[i], b[i]))
        return false;
    }
    return true;
  }
  if (isSequentialColl(a))
    return isSequentialColl(b) && seqEquiv(a, b);
  if (isMapColl(a))
    return isMapColl(b) && mapEquiv(a, b);
  if (isSetColl(a))
    return isSetColl(b) && setEquiv(a, b);
  const ao = a;
  const bo = b;
  if (typeof ao.nth === "function" && typeof ao.count === "number" && typeof bo.nth === "function" && typeof bo.count === "number") {
    if (ao.count !== bo.count)
      return false;
    for (let i = 0; i < ao.count; i++) {
      if (!equiv(ao.nth(i), bo.nth(i)))
        return false;
    }
    return true;
  }
  if (isRecord(a))
    return recordEquiv(a, b, equiv);
  if (typeof ao._tag === "symbol" && typeof bo._tag === "symbol" && ao._tag === bo._tag && "name" in ao && "name" in bo) {
    return ao.name === bo.name && ao.ns === bo.ns;
  }
  return false;
}
var isSequentialColl, isMapColl, isSetColl;
var init_equiv = __esm({
  "dist/runtime/equiv.js"() {
    "use strict";
    init_list();
    init_vector();
    init_hash_map();
    init_array_map();
    init_sorted_map();
    init_hash_set();
    init_sorted_set();
    init_lazy_seq();
    init_seq();
    init_record();
    isSequentialColl = (x) => isVector(x) || isList(x) || x instanceof IndexedSeq || x instanceof LazySeq;
    isMapColl = (x) => isHashMap(x) || isArrayMap(x) || isSortedMap(x);
    isSetColl = (x) => isHashSet(x) || isSortedSet(x);
  }
});

// dist/runtime/printer.js
var init_printer = __esm({
  "dist/runtime/printer.js"() {
    "use strict";
    init_list();
    init_vector();
    init_hash_map();
    init_array_map();
    init_sorted_map();
    init_hash_set();
    init_sorted_set();
    init_lazy_seq();
    init_seq();
    init_keyword();
    init_symbol();
  }
});

// dist/runtime/core.js
function truthy(x) {
  return x !== null && x !== void 0 && x !== false;
}
function get(coll, key, notFound) {
  const defaultVal = notFound !== void 0 ? notFound : null;
  if (coll === null || coll === void 0)
    return defaultVal;
  if (isHashMap(coll)) {
    const v = coll.get(key);
    return v !== void 0 ? v : defaultVal;
  }
  if (isVector(coll) && typeof key === "number") {
    const v = coll.nth(key);
    return v !== void 0 ? v : defaultVal;
  }
  if (isHashSet(coll)) {
    return coll.has(key) ? key : defaultVal;
  }
  if (isSortedMap(coll)) {
    const v = coll.get(key);
    return v !== void 0 ? v : defaultVal;
  }
  if (isSortedSet(coll)) {
    return coll.has(key) ? key : defaultVal;
  }
  if (isRecord(coll)) {
    const v = recordGet(coll, key);
    return v !== void 0 ? v : defaultVal;
  }
  return defaultVal;
}
function range(...args) {
  let start = 0, end, step = 1;
  if (args.length === 0 || args.length >= 2 && args[1] === Infinity) {
    const from = args.length === 0 ? 0 : args[0];
    const by = args.length === 3 ? args[2] : 1;
    const gen = (i) => new LazySeq(() => cons(i, gen(i + by)));
    return gen(from);
  }
  if (args.length === 1) {
    end = args[0];
  } else if (args.length === 2) {
    start = args[0];
    end = args[1];
  } else {
    start = args[0];
    end = args[1];
    step = args[2];
  }
  const result = [];
  if (step > 0) {
    for (let i = start; i < end; i += step)
      result.push(i);
  } else if (step < 0) {
    for (let i = start; i > end; i += step)
      result.push(i);
  }
  return listOf(result);
}
function nth(coll, index, notFound) {
  if (coll == null) {
    if (notFound !== void 0)
      return notFound;
    return null;
  }
  if (isVector(coll)) {
    const v = coll;
    if (index >= 0 && index < v.count)
      return v.nth(index);
    if (notFound !== void 0)
      return notFound;
    throw new Error("Index out of bounds");
  }
  if (Array.isArray(coll)) {
    if (index >= 0 && index < coll.length)
      return coll[index];
    if (notFound !== void 0)
      return notFound;
    throw new Error("Index out of bounds");
  }
  if (typeof coll === "string") {
    if (index >= 0 && index < coll.length)
      return coll.charAt(index);
    if (notFound !== void 0)
      return notFound;
    throw new Error("Index out of bounds");
  }
  let s = seq(coll);
  for (let i = 0; i < index; i++) {
    if (s === null) {
      if (notFound !== void 0)
        return notFound;
      throw new Error("Index out of bounds");
    }
    s = next(s);
  }
  if (s === null) {
    if (notFound !== void 0)
      return notFound;
    throw new Error("Index out of bounds");
  }
  return first2(s);
}
function invoke(f, ...args) {
  if (typeof f === "function")
    return f(...args);
  if (isHashMap(f))
    return get(f, args[0], args[1] !== void 0 ? args[1] : null);
  if (isHashSet(f))
    return f.has(args[0]) ? args[0] : args[1] !== void 0 ? args[1] : null;
  if (isVector(f) && typeof args[0] === "number")
    return nth(f, args[0]);
  if (isSortedMap(f))
    return get(f, args[0], args[1] !== void 0 ? args[1] : null);
  if (isSortedSet(f))
    return f.has(args[0]) ? args[0] : null;
  throw new Error(`${f} is not IFn`);
}
function structuralHash(key) {
  const coll = isVector(key) || isList(key) || key instanceof LazySeq || isHashMap(key) || isSortedMap(key) || isHashSet(key) || isSortedSet(key) || isArrayMap(key) || key instanceof IndexedSeq;
  if (!coll)
    return void 0;
  const unordered = isHashMap(key) || isSortedMap(key) || isHashSet(key) || isSortedSet(key) || isArrayMap(key);
  let h = unordered ? 0 : 1;
  for (let q = seq(key); q !== null; q = next(q)) {
    const eh = hashKey(first2(q));
    h = unordered ? h + eh | 0 : Math.imul(31, h) + eh | 0;
  }
  return h;
}
var init_core = __esm({
  "dist/runtime/core.js"() {
    "use strict";
    init_list();
    init_vector();
    init_hash_map();
    init_hash_map();
    init_array_map();
    init_hash_set();
    init_keyword();
    init_symbol();
    init_equiv();
    init_record();
    init_lazy_seq();
    init_seq();
    init_sorted_map();
    init_sorted_set();
    init_printer();
    init_sorted_map();
    init_sorted_set();
    init_hash_map();
    setKeywordLookup((coll, key, notFound) => get(coll, key, notFound));
    setStructuralHooks({ hash: structuralHash, eq: equiv });
  }
});

// dist/runtime/atom.js
var init_atom = __esm({
  "dist/runtime/atom.js"() {
    "use strict";
    init_core();
  }
});

// dist/runtime/protocols.js
var init_protocols = __esm({
  "dist/runtime/protocols.js"() {
    "use strict";
  }
});

// dist/runtime/interop.js
var init_interop = __esm({
  "dist/runtime/interop.js"() {
    "use strict";
    init_keyword();
    init_vector();
    init_hash_map();
    init_hash_set();
    init_list();
    init_keyword();
    init_seq();
    init_lazy_seq();
  }
});

// dist/runtime/wasm-link.js
function parseSig(sig) {
  const known = sigCache.get(sig);
  if (known)
    return known;
  const m = /^([a-zA-Z]*)>([a-zA-Z])$/.exec(sig);
  if (!m)
    throw new Error(`wasm: invalid signature "${sig}"`);
  const args = [...m[1]];
  for (const c of args)
    if (!SIG_CHARS.has(c))
      throw new Error(`wasm: unsupported argument type '${c}' in "${sig}"`);
  const ret = m[2];
  if (!SIG_CHARS.has(ret) && ret !== "v")
    throw new Error(`wasm: unsupported return type '${ret}' in "${sig}"`);
  const parsed = { args, ret };
  sigCache.set(sig, parsed);
  return parsed;
}
function toInstance(source) {
  if (source instanceof WebAssembly.Instance)
    return source;
  const module = source instanceof WebAssembly.Module ? source : new WebAssembly.Module(source);
  return new WebAssembly.Instance(module, {});
}
function asNumber(v, what, module, exportName) {
  if (typeof v !== "number")
    throw new Error(`wasm: ${module}/${exportName} expects a number for ${what}`);
  return v;
}
var ARRAYS, SIG_CHARS, sigCache, encoder, decoder, WasmLinker, defaultLinker;
var init_wasm_link = __esm({
  "dist/runtime/wasm-link.js"() {
    "use strict";
    ARRAYS = { D: Float64Array, I: Int32Array, B: Uint8Array };
    SIG_CHARS = /* @__PURE__ */ new Set(["i", "d", "b", "s", "D", "I", "B"]);
    sigCache = /* @__PURE__ */ new Map();
    encoder = new TextEncoder();
    decoder = new TextDecoder();
    WasmLinker = class {
      modules = /* @__PURE__ */ new Map();
      /** Links a module synchronously (bytes are compiled in place; browsers limit this on the main thread). */
      register(name2, source) {
        this.modules.set(name2, toInstance(source).exports);
      }
      /** Links a module with asynchronous compilation (also accepts a `fetch` Response). */
      async registerAsync(name2, source) {
        const resolved = await source;
        if (resolved instanceof Response) {
          this.modules.set(name2, (await WebAssembly.instantiateStreaming(resolved, {})).instance.exports);
        } else if (resolved instanceof WebAssembly.Instance || resolved instanceof WebAssembly.Module) {
          this.register(name2, resolved);
        } else {
          this.modules.set(name2, (await WebAssembly.instantiate(resolved, {})).instance.exports);
        }
      }
      has(name2) {
        return this.modules.has(name2);
      }
      clear() {
        this.modules.clear();
      }
      call(module, exportName, sig, args) {
        const mod3 = this.modules.get(module);
        if (!mod3)
          throw new Error(`wasm: module "${module}" is not registered`);
        const fn = mod3[exportName];
        if (typeof fn !== "function")
          throw new Error(`wasm: module "${module}" has no export "${exportName}"`);
        const { args: argTypes, ret } = parseSig(sig);
        if (args.length !== argTypes.length) {
          throw new Error(`wasm: ${module}/${exportName} expects ${argTypes.length} argument(s), got ${args.length}`);
        }
        const borrowed = [];
        const flat = [];
        try {
          for (let i = 0; i < argTypes.length; i++) {
            const v = args[i];
            switch (argTypes[i]) {
              case "i":
                flat.push(asNumber(v, "i32", module, exportName));
                break;
              case "d":
                flat.push(asNumber(v, "f64", module, exportName));
                break;
              case "D":
              case "I":
              case "B": {
                const ctor = ARRAYS[argTypes[i]];
                if (v === null || v === void 0 || typeof v === "string" || typeof v.length !== "number") {
                  throw new Error(`wasm: ${module}/${exportName} argument ${i} must be an array of numbers`);
                }
                const typed = ctor.from(v);
                const bytes = new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength);
                const ptr = this.writeBytes(mod3, bytes);
                borrowed.push([ptr, bytes.length]);
                flat.push(ptr, typed.length);
                break;
              }
              case "b":
                flat.push(v === null || v === void 0 || v === false ? 0 : 1);
                break;
              case "s": {
                if (typeof v !== "string")
                  throw new Error(`wasm: ${module}/${exportName} argument ${i} must be a string`);
                const bytes = encoder.encode(v);
                const ptr = this.writeBytes(mod3, bytes);
                borrowed.push([ptr, bytes.length]);
                flat.push(ptr, bytes.length);
                break;
              }
            }
          }
          const result = fn(...flat);
          switch (ret) {
            case "v":
              return void 0;
            case "i":
              return result;
            case "d":
              return result;
            case "b":
              return result !== 0;
            case "s":
              return decoder.decode(this.readPacked(mod3, result, module, exportName));
            default: {
              const bytes = this.readPacked(mod3, result, module, exportName);
              const ctor = ARRAYS[ret];
              return new ctor(bytes.slice().buffer);
            }
          }
        } finally {
          for (const [ptr, len] of borrowed)
            mod3.kiso_free?.(ptr, len);
        }
      }
      writeBytes(mod3, bytes) {
        if (!mod3.kiso_alloc)
          throw new Error("wasm: module does not export kiso_alloc");
        const ptr = mod3.kiso_alloc(bytes.length);
        new Uint8Array(mod3.memory.buffer, ptr, bytes.length).set(bytes);
        return ptr;
      }
      readPacked(mod3, packed, module, exportName) {
        if (packed === 0n)
          throw new Error(`wasm: ${module}/${exportName} failed: ${this.lastError(mod3)}`);
        const ptr = Number(packed & 0xffffffffn);
        const len = Number(packed >> 32n);
        const bytes = new Uint8Array(mod3.memory.buffer, ptr, len).slice();
        mod3.kiso_free?.(ptr, len);
        return bytes;
      }
      lastError(mod3) {
        const packed = mod3.kiso_last_error?.() ?? 0n;
        if (packed === 0n)
          return "unknown error";
        const ptr = Number(packed & 0xffffffffn);
        const len = Number(packed >> 32n);
        const text = decoder.decode(new Uint8Array(mod3.memory.buffer, ptr, len));
        mod3.kiso_free?.(ptr, len);
        return text;
      }
    };
    defaultLinker = new WasmLinker();
  }
});

// dist/runtime/wasm.js
function registerWasm(name2, source) {
  return defaultLinker.registerAsync(name2, source);
}
function host_wasm_call(module, exportName, sig, ...args) {
  const gt2 = sig.indexOf(">");
  const prepared = args.map((a, i) => i < gt2 && "DIB".includes(sig[i]) && !Array.isArray(a) && !ArrayBuffer.isView(a) ? collToArray(a) : a);
  const result = defaultLinker.call(module, exportName, sig, prepared);
  return ArrayBuffer.isView(result) ? Array.from(result) : result;
}
function collToArray(a) {
  if (!isVector(a))
    return toArray(a);
  const out = new Array(a.count);
  for (let i = 0; i < out.length; i++)
    out[i] = a.nth(i);
  return out;
}
var init_wasm = __esm({
  "dist/runtime/wasm.js"() {
    "use strict";
    init_seq();
    init_vector();
    init_wasm_link();
  }
});

// dist/runtime/extras.js
function vec(coll) {
  if (isVector(coll))
    return coll;
  return vector(...toArray(coll));
}
function extremum(better) {
  return (k, x, ...more) => {
    let best = x;
    let bestK = call(k, x);
    for (const y of more) {
      const yk = call(k, y);
      if (better(yk, bestK)) {
        best = y;
        bestK = yk;
      }
    }
    return best;
  };
}
var call, min_key, max_key, Integer, Long;
var init_extras = __esm({
  "dist/runtime/extras.js"() {
    "use strict";
    init_seq();
    init_vector();
    init_list();
    init_hash_map();
    init_hash_set();
    init_sorted_map();
    init_sorted_set();
    init_keyword();
    init_symbol();
    init_equiv();
    init_core();
    call = (f, ...a) => typeof f === "function" ? f(...a) : invoke(f, ...a);
    min_key = extremum((a, b) => a <= b);
    max_key = extremum((a, b) => a >= b);
    Integer = {
      parseInt: (s, radix = 10) => parseInt(s, radix),
      valueOf: (x) => typeof x === "string" ? parseInt(x, 10) : Math.trunc(x),
      MAX_VALUE: 2147483647,
      MIN_VALUE: -2147483648
    };
    Long = { parseLong: (s) => parseInt(s, 10), valueOf: Integer.valueOf, MAX_VALUE: Number.MAX_SAFE_INTEGER, MIN_VALUE: Number.MIN_SAFE_INTEGER };
  }
});

// dist/runtime/hierarchy.js
var K_PARENTS, K_ANCESTORS, K_DESCENDANTS;
var init_hierarchy = __esm({
  "dist/runtime/hierarchy.js"() {
    "use strict";
    init_equiv();
    init_vector();
    init_hash_set();
    init_hash_map();
    init_keyword();
    init_core();
    init_extras();
    init_seq();
    K_PARENTS = keyword("parents");
    K_ANCESTORS = keyword("ancestors");
    K_DESCENDANTS = keyword("descendants");
  }
});

// dist/runtime/multifn.js
var init_multifn = __esm({
  "dist/runtime/multifn.js"() {
    "use strict";
    init_equiv();
    init_keyword();
    init_hierarchy();
  }
});

// dist/runtime/transient.js
var init_transient = __esm({
  "dist/runtime/transient.js"() {
    "use strict";
    init_vector();
    init_hash_map();
    init_hash_set();
  }
});

// dist/reader/tokenizer.js
var init_tokenizer = __esm({
  "dist/reader/tokenizer.js"() {
    "use strict";
  }
});

// dist/reader/form.js
var init_form = __esm({
  "dist/reader/form.js"() {
    "use strict";
  }
});

// dist/reader/reader.js
var init_reader = __esm({
  "dist/reader/reader.js"() {
    "use strict";
    init_tokenizer();
    init_form();
  }
});

// dist/runtime/edn.js
var init_edn = __esm({
  "dist/runtime/edn.js"() {
    "use strict";
    init_reader();
    init_vector();
    init_list();
    init_hash_map();
    init_hash_set();
    init_keyword();
    init_symbol();
  }
});

// dist/runtime/async.js
var init_async = __esm({
  "dist/runtime/async.js"() {
    "use strict";
    init_vector();
    init_seq();
  }
});

// dist/runtime/index.js
var init_runtime = __esm({
  "dist/runtime/index.js"() {
    "use strict";
    init_vector();
    init_hash_map();
    init_hash_set();
    init_keyword();
    init_symbol();
    init_list();
    init_atom();
    init_equiv();
    init_seq();
    init_protocols();
    init_array_map();
    init_interop();
    init_wasm();
    init_wasm_link();
    init_interop();
    init_multifn();
    init_hierarchy();
    init_core();
    init_sorted_map();
    init_sorted_set();
    init_transient();
    init_extras();
    init_lazy_seq();
    init_edn();
    init_async();
  }
});

// bench/.out-ffi/js-ffi_sum/ffi_sum.js
var ffi_sum_exports = {};
__export(ffi_sum_exports, {
  _main: () => _main,
  sum_f64s: () => sum_f64s,
  xs: () => xs
});
var sum_f64s, xs, _main;
var init_ffi_sum = __esm({
  "bench/.out-ffi/js-ffi_sum/ffi_sum.js"() {
    "use strict";
    init_runtime();
    sum_f64s = function sum_f64s2(wasm__a0) {
      return host_wasm_call("fixture", "sum_f64s", "D>d", wasm__a0);
    };
    xs = vec(range(1e5));
    _main = function _main2() {
      return (() => {
        let dt__limit = 20;
        return ((dt__i) => (() => {
          while (true) {
            if (truthy(dt__i < dt__limit)) {
              const _ = dt__i;
              sum_f64s(xs);
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
  }
});

// bench/.out-ffi/ffi_sum.entry.mjs
init_runtime();
import { readFileSync } from "node:fs";
await registerWasm("fixture", readFileSync("/Users/Shared/Relocated_Items/Security/eUSB/sync/zig/projects/kiso/packages/kiso/test/fixtures/ffi_fixture.wasm"));
var mod2 = await Promise.resolve().then(() => (init_ffi_sum(), ffi_sum_exports));
export {
  mod2 as mod
};
