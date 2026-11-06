;; Scoping, defs, recur and IFn call positions (ported from test/codegen/js-semantics.test.ts).
(ns kiso.scoping-test
  (:require [clojure.test :refer [deftest is]]))

(deftest let-shadowing-does-not-hit-the-tdz
  (is (= 2 (let [x 1] (let [x (inc x)] x))))
  (is (= 3 (let [count (count [1 2 3])] count))))

(deftest loop-rebinding-of-a-seq-parameter
  (is (= 6 (loop [xs (seq [1 2 3]) acc 0]
             (if xs (recur (next xs) (+ acc (first xs))) acc)))))

(declare decl-f)
(defn decl-g [] (decl-f))
(defn decl-f [] 7)

(deftest declare-followed-by-defn
  (is (= 7 (decl-g))))

(defn count-up [n acc] (if (zero? n) acc (recur (dec n) (+ acc 1))))

(deftest fn-level-recur-does-not-grow-the-stack
  (is (= 100000 (count-up 100000 0))))

(deftest reserved-js-words-as-parameter-names
  (is (= 2 ((fn [in] (inc in)) 1))))

(defn rest-arity ([] 0) ([a & args] (count args)))

(deftest rest-param-in-a-multi-arity-fn
  (is (= 2 (rest-arity 1 2 3))))

(deftest math-static-calls
  (is (= 3 (Math/abs -3))))

(def ifn-v [10 20])

(deftest ifn-call-positions
  (is (= 2 (let [m {1 2}] (m 1))))
  (is (= 20 (ifn-v 1)))
  (is (= 1 ((hash-map :a 1) :a))))
