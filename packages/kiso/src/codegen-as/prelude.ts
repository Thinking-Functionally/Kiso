// AS prelude: clojure.core / clojure.set functions written in Kiso itself. Only the definitions a
// program actually references (transitively) are linked in, and a program's own top-level
// definitions always win. Everything here must stay inside the AS-supported subset.

import { readAllStr } from '../reader/reader.js';
import type { Form } from '../reader/form.js';

const PRELUDE = `
(defn nnext [xs] (next (next xs)))
(defn ffirst [xs] (first (first xs)))
(defn fnext [xs] (first (next xs)))
(defn not-empty [c] (if (seq c) c nil))
(defn constantly [x] (fn [& _] x))
(defn complement [f] (fn [& args] (not (apply f args))))
(defn comp
  ([] identity)
  ([f] f)
  ([f g] (fn [& args] (f (apply g args))))
  ([f g & more] (reduce comp (comp f g) more)))
(defn partial
  ([f] f)
  ([f a] (fn [& args] (apply f a args)))
  ([f a b] (fn [& args] (apply f a b args)))
  ([f a b c] (fn [& args] (apply f a b c args))))
(defn juxt
  ([f] (fn [& args] [(apply f args)]))
  ([f g] (fn [& args] [(apply f args) (apply g args)]))
  ([f g h] (fn [& args] [(apply f args) (apply g args) (apply h args)])))
(defn fnil
  ([f x] (fn [a & more] (apply f (if (nil? a) x a) more)))
  ([f x y] (fn [a b & more] (apply f (if (nil? a) x a) (if (nil? b) y b) more))))
(defn min-key [f x & more]
  (reduce (fn [best y] (if (< (f best) (f y)) best y)) x more))
(defn max-key [f x & more]
  (reduce (fn [best y] (if (> (f best) (f y)) best y)) x more))
(defn distinct [coll]
  (loop [xs (seq coll) seen #{} out []]
    (if xs
      (let [x (first xs)]
        (if (contains? seen x)
          (recur (next xs) seen out)
          (recur (next xs) (conj seen x) (conj out x))))
      out)))
(defn dedupe [coll]
  (loop [xs (seq coll) prev :kiso/none out []]
    (if xs
      (let [x (first xs)]
        (if (= x prev) (recur (next xs) prev out) (recur (next xs) x (conj out x))))
      out)))
(defn group-by [f coll]
  (reduce (fn [m x] (let [k (f x)] (assoc m k (conj (get m k []) x)))) {} coll))
(defn frequencies [coll]
  (reduce (fn [m x] (assoc m x (inc (get m x 0)))) {} coll))
(defn zipmap [ks vs]
  (loop [m {} ks (seq ks) vs (seq vs)]
    (if (and ks vs)
      (recur (assoc m (first ks) (first vs)) (next ks) (next vs))
      m)))
(defn butlast [coll] (let [v (vec coll)] (if (> (count v) 1) (subvec v 0 (dec (count v))) nil)))
(defn drop-last
  ([coll] (drop-last 1 coll))
  ([n coll] (let [v (vec coll)] (take (max 0 (- (count v) n)) v))))
(defn take-last [n coll] (let [v (vec coll)] (drop (max 0 (- (count v) n)) v)))
(defn take-nth [n coll]
  (loop [xs (seq coll) out []]
    (if xs (recur (nthnext xs n) (conj out (first xs))) out)))
(defn nthnext [coll n]
  (loop [xs (seq coll) n n] (if (and xs (pos? n)) (recur (next xs) (dec n)) xs)))
(defn split-at [n coll] [(vec (take n coll)) (vec (drop n coll))])
(defn split-with [pred coll] [(vec (take-while pred coll)) (vec (drop-while pred coll))])
(defn partition
  ([n coll] (partition n n coll))
  ([n step coll]
   (loop [xs (seq coll) out []]
     (let [chunk (vec (take n xs))]
       (if (= (count chunk) n) (recur (nthnext xs step) (conj out chunk)) out)))))
(defn partition-all
  ([n coll] (partition-all n n coll))
  ([n step coll]
   (loop [xs (seq coll) out []]
     (if xs (recur (nthnext xs step) (conj out (vec (take n xs)))) out))))
(defn partition-by [f coll]
  (loop [xs (seq coll) out []]
    (if xs
      (let [k (f (first xs))
            run (vec (take-while (fn [y] (= (f y) k)) xs))]
        (recur (nthnext xs (count run)) (conj out run)))
      out)))
(defn reductions
  ([f coll] (if (seq coll) (reductions f (first coll) (rest coll)) [(f)]))
  ([f init coll]
   (loop [xs (seq coll) acc init out [init]]
     (if xs (let [a (f acc (first xs))] (recur (next xs) a (conj out a))) out))))
(defn map-indexed [f coll]
  (loop [xs (seq coll) i 0 out []]
    (if xs (recur (next xs) (inc i) (conj out (f i (first xs)))) out)))
(defn keep [f coll]
  (loop [xs (seq coll) out []]
    (if xs (let [v (f (first xs))] (recur (next xs) (if (nil? v) out (conj out v)))) out)))
(defn interleave [a b]
  (loop [xs (seq a) ys (seq b) out []]
    (if (and xs ys) (recur (next xs) (next ys) (conj (conj out (first xs)) (first ys))) out)))
(defn interpose [sep coll]
  (loop [xs (seq coll) out [] first? true]
    (if xs (recur (next xs) (if first? (conj out (first xs)) (conj (conj out sep) (first xs))) false) out)))
(defn flatten [x]
  (if (sequential? x) (vec (mapcat flatten x)) [x]))
(defn merge [& maps]
  (reduce (fn [acc m] (reduce (fn [a k] (assoc a k (get m k))) (or acc {}) (keys m))) nil (filter some? maps)))
(defn select-keys [m ks]
  (reduce (fn [acc k] (if (contains? m k) (assoc acc k (get m k)) acc)) {} ks))
(defn assoc-in [m ks v]
  (if (next ks) (assoc m (first ks) (assoc-in (get m (first ks)) (rest ks) v)) (assoc m (first ks) v)))
(defn update-in [m ks f & args]
  (assoc-in m ks (apply f (get-in m ks) args)))
(defn reduce-kv [f init m]
  (reduce (fn [acc k] (f acc k (get m k))) init (keys m)))
(defn repeatedly [n f] (vec (map (fn [_] (f)) (range n))))
(defn every-pred [p & ps] (fn [x] (and (p x) (every? (fn [q] (q x)) ps))))
(defn some-fn [p & ps] (fn [x] (or (p x) (some (fn [q] (q x)) ps))))
(defn not-any? [pred coll] (not (some pred coll)))
(defn not-every? [pred coll] (not (every? pred coll)))
(def __rng (atom 2463534242))
(defn rand-int [n]
  (let [x (mod (+ (* (deref __rng) 1103515245) 12345) 2147483648)]
    (reset! __rng x)
    (mod (quot x 65536) n)))
(defn shuffle [coll]
  (loop [v (vec coll) i (dec (count v))]
    (if (pos? i)
      (let [j (rand-int (inc i)) a (nth v i) b (nth v j)]
        (recur (assoc (assoc v i b) j a) (dec i)))
      v)))
(defn rand-nth [coll] (nth coll (rand-int (count coll))))
(defn keep-indexed [f coll]
  (loop [xs (seq coll) i 0 out []]
    (if xs (let [v (f i (first xs))] (recur (next xs) (inc i) (if (nil? v) out (conj out v)))) out)))
(defn run! [f coll] (doseq [x coll] (f x)) nil)
(defn subvec
  ([v start] (subvec v start (count v)))
  ([v start end] (vec (take (- end start) (drop start v)))))
(defn coll? [x] (or (vector? x) (map? x) (set? x) (seq? x) (list? x)))
(defn find [m k] (if (contains? m k) [k (get m k)] nil))
(defn nfirst [xs] (next (first xs)))
(defn trampoline [f & args]
  (loop [r (apply f args)] (if (fn? r) (recur (r)) r)))
(defn memoize [f]
  (let [cache (atom {})]
    (fn [& args]
      (let [hit (get (deref cache) args :kiso/none)]
        (if (= hit :kiso/none)
          (let [v (apply f args)] (swap! cache assoc args v) v)
          hit)))))
(defn print-str [& xs] (apply str (interpose " " (map str xs))))
(defn associative? [x] (or (map? x) (vector? x)))
(defn ifn? [x] (or (fn? x) (keyword? x) (symbol? x) (map? x) (set? x) (vector? x)))
(defn counted? [x] (or (vector? x) (map? x) (set? x) (list? x)))
(defn reversible? [x] (vector? x))
(defn comparator [pred] (fn [a b] (cond (pred a b) -1 (pred b a) 1 :else 0)))
(defn rand ([] (/ (rand-int 1073741824) 1073741824)) ([n] (* n (rand))))
(defn distinct? [& xs] (= (count xs) (count (set xs))))
(defn sequence
  ([coll] (or (seq coll) ()))
  ([xf coll] (or (seq (into [] xf coll)) ())))
(defn rseq [v] (seq (reverse v)))
(defn bit-not [x] (- -1 x))
(defn vary-meta [obj f & args] (with-meta obj (apply f (meta obj) args)))
(defn alter-meta! [a f & args] (reset-meta! a (apply f (meta a) args)))
(defn sorted-map-by [cmp & kvs]
  (reduce (fn [m p] (assoc m (first p) (second p))) (sorted-map-empty-by cmp) (partition 2 kvs)))
(defn sorted-set-by [cmp & xs]
  (reduce conj (sorted-set-empty-by cmp) xs))
(defn prn-str [& xs] (str (apply pr-str xs) "\n"))
(defn println-str [& xs] (str (apply print-str xs) "\n"))
(defn merge-with [f & maps]
  (reduce (fn [acc m]
            (reduce (fn [a k] (if (contains? a k) (assoc a k (f (get a k) (get m k))) (assoc a k (get m k))))
                    (or acc {}) (keys m)))
          nil maps))
(defn map-xf [f]
  (fn [rf] (fn ([] (rf)) ([acc] (rf acc)) ([acc x] (rf acc (f x))))))
(defn filter-xf [pred]
  (fn [rf] (fn ([] (rf)) ([acc] (rf acc)) ([acc x] (if (pred x) (rf acc x) acc)))))
(defn take-xf [n]
  (fn [rf]
    (let [left (atom n)]
      (fn ([] (rf)) ([acc] (rf acc))
        ([acc x]
         (let [k (deref left)]
           (swap! left dec)
           (if (> k 1) (rf acc x) (if (= k 1) (ensure-reduced (rf acc x)) (ensure-reduced acc)))))))))
(defn completing
  ([f] (completing f identity))
  ([f cf] (fn ([] (f)) ([x] (cf x)) ([x y] (f x y)))))
(defn transduce
  ([xf f coll] (transduce xf f (f) coll))
  ([xf f init coll] (let [rf (xf f)] (rf (reduce rf init coll)))))
(defn into-xf [to xf from]
  (transduce xf (fn ([acc] acc) ([acc x] (conj acc x))) to from))
(defn cljset-rename-keys [m kmap]
  (reduce (fn [acc k]
            (if (contains? m k) (assoc acc (get kmap k) (get m k)) acc))
          (reduce dissoc m (keys kmap))
          (keys kmap)))
(defn cljset-map-invert [m] (reduce (fn [acc k] (assoc acc (get m k) k)) {} (keys m)))
(defn cljset-project [xrel ks] (set (map (fn [m] (select-keys m ks)) xrel)))
(defn cljset-rename [xrel kmap] (set (map (fn [m] (cljset-rename-keys m kmap)) xrel)))
(defn cljset-index [xrel ks]
  (reduce (fn [acc m] (let [k (select-keys m ks)] (assoc acc k (conj (get acc k #{}) m)))) {} xrel))
(defn cljwalk-walk [inner outer form]
  (if (list? form)
    (outer (apply list (map inner form)))
    (if (map? form)
      (outer (reduce (fn [m e] (let [r (inner e)] (assoc m (first r) (second r)))) {} form))
      (if (vector? form)
        (outer (mapv inner form))
        (if (set? form)
          (outer (set (map inner form)))
          (if (seq? form) (outer (doall (map inner form))) (outer form)))))))
(defn cljwalk-postwalk [f form] (cljwalk-walk (fn [x] (cljwalk-postwalk f x)) f form))
(defn cljwalk-prewalk [f form] (cljwalk-walk (fn [x] (cljwalk-prewalk f x)) identity (f form)))
(defn cljwalk-postwalk-replace [smap form]
  (cljwalk-postwalk (fn [x] (if (contains? smap x) (get smap x) x)) form))
(defn cljwalk-prewalk-replace [smap form]
  (cljwalk-prewalk (fn [x] (if (contains? smap x) (get smap x) x)) form))
(defn cljwalk-keywordize-keys [m]
  (cljwalk-postwalk
    (fn [x] (if (map? x) (reduce (fn [acc k] (assoc acc (if (string? k) (keyword k) k) (get x k))) {} (keys x)) x))
    m))
(defn cljwalk-stringify-keys [m]
  (cljwalk-postwalk
    (fn [x] (if (map? x) (reduce (fn [acc k] (assoc acc (if (keyword? k) (name k) k) (get x k))) {} (keys x)) x))
    m))
(defn cljset-union [& sets] (reduce (fn [acc s] (reduce conj acc s)) #{} sets))
(defn cljset-intersection [a & more]
  (reduce (fn [acc s] (reduce (fn [r x] (if (contains? s x) (conj r x) r)) #{} acc)) a more))
(defn cljset-difference [a & more]
  (reduce (fn [acc s] (reduce disj acc s)) a more))
(defn cljset-subset? [a b] (every? (fn [x] (contains? b x)) a))
(defn cljset-superset? [a b] (cljset-subset? b a))
(defn cljset-select [pred s] (reduce (fn [acc x] (if (pred x) acc (disj acc x))) s s))
`;

// Calls shaped like a transducer use (they may be threading forms, which is harmless over-linking).
const XF_SHAPES: Record<string, { len: number; fn: string }> = {
  map: { len: 2, fn: 'map-xf' },
  filter: { len: 2, fn: 'filter-xf' },
  take: { len: 2, fn: 'take-xf' },
  into: { len: 4, fn: 'into-xf' },
};

let parsed: Map<string, Form> | null = null;
let deps: Map<string, Set<string>> | null = null;

const symName = (f: Form): string | null => (f.data.type === 'symbol' ? (f.data.ns ? `${f.data.ns}/${f.data.name}` : f.data.name) : null);

function collect(f: Form, out: Set<string>): void {
  const n = symName(f);
  if (n) out.add(n);
  const d = f.data;
  if (d.type === 'list' && d.items.length > 1) {
    const head = symName(d.items[0]!);
    const xf = head && XF_SHAPES[head];
    if (xf && d.items.length === xf.len) out.add(xf.fn);
  }
  if ('items' in d) for (const x of d.items as Form[]) collect(x, out);
  else if (d.type === 'tagged') collect(d.form, out);
}

function load(): void {
  if (parsed) return;
  parsed = new Map();
  deps = new Map();
  for (const f of readAllStr(PRELUDE, ['as', 'cljs'])) {
    const it = (f.data as { items: Form[] }).items;
    const name = symName(it[1]!)!;
    parsed.set(name, f);
    const used = new Set<string>();
    for (const x of it.slice(2)) collect(x, used);
    deps.set(name, used);
  }
}

/** Prepend the prelude definitions `forms` need (transitively) and does not define itself. */
export function injectPrelude(forms: Form[], defined: Set<string>): Form[] {
  load();
  const used = new Set<string>();
  for (const f of forms) collect(f, used);
  const need: string[] = [];
  const seen = new Set<string>();
  const visit = (n: string): void => {
    if (seen.has(n) || defined.has(n) || !parsed!.has(n)) return;
    seen.add(n);
    for (const d of deps!.get(n)!) visit(d);
    need.push(n);
  };
  for (const n of used) visit(n);
  if (need.length === 0) return forms;
  const nsIdx = forms.findIndex((f) => f.data.type === 'list' && symName((f.data.items as Form[])[0]!) === 'ns');
  const pre = need.map((n) => parsed!.get(n)!);
  // Linked library forms precede the main ns; the prelude must come before all of them.
  return nsIdx === 0 ? [...forms.slice(0, 1), ...pre, ...forms.slice(1)] : [...pre, ...forms];
}
