;; Persistent vector behaviour (ported from test/runtime/vector.test.ts).
(ns kiso.vector-test
  (:require [clojure.test :refer [deftest is]]))

(defn build [n] (loop [v [] i 0] (if (< i n) (recur (conj v i) (inc i)) v)))
(defn all-at-index? [v n] (loop [i 0] (cond (= i n) true (= (nth v i) i) (recur (inc i)) :else false)))

(deftest empty-vector
  (is (= 0 (count [])))
  (is (nil? (get [] 0)))
  (is (vector? []))
  (is (= 0 (count (vector)))))

(deftest creation
  (let [v (vector 1 2 3)]
    (is (= 3 (count v)))
    (is (= [1 2 3] [(nth v 0) (nth v 1) (nth v 2)]))))

(deftest conj-appends
  (is (= [42] (conj [] 42)))
  (let [v (build 10)]
    (is (= 10 (count v)))
    (is (all-at-index? v 10)))
  (let [v1 [1 2 3] v2 (conj v1 4)]
    (is (= 3 (count v1)))
    (is (= 4 (count v2)))
    (is (= 4 (nth v2 3)))))

(deftest tail-overflow-and-root-growth
  (doseq [n [33 64 100 1025]]
    (let [v (build n)]
      (is (= n (count v)))
      (is (all-at-index? v n))))
  (let [v (build 10000)]
    (is (= 10000 (count v)))
    (is (= [0 999 5000 9999] [(nth v 0) (nth v 999) (nth v 5000) (nth v 9999)]))))

(deftest nth-out-of-range
  (is (nil? (get [1 2 3] -1)))
  (is (nil? (get [1 2 3] 3)))
  (is (= :nf (nth [1 2 3] 3 :nf)))
  (is (= [1 3] [(nth [1 2 3] 0) (nth [1 2 3] 2)])))

(deftest assoc-index
  (let [v1 [1 2 3] v2 (assoc v1 1 99)]
    (is (= 99 (nth v2 1)))
    (is (= 2 (nth v1 1))))
  (let [v (build 64) v2 (assoc v 5 999)]
    (is (= 999 (nth v2 5)))
    (is (= 5 (nth v 5))))
  (is (= [1 2 7] (assoc [1 2] 2 7)))
  (is (thrown? js/Error (assoc [1 2] 5 0)))
  (is (thrown? js/Error (assoc [1 2] -1 0))))

(deftest pop-vector
  (is (= [1 2] (pop [1 2 3])))
  (is (= [] (pop [1])))
  (is (thrown? js/Error (pop [])))
  (let [v (pop (build 33))]
    (is (= 32 (count v)))
    (is (all-at-index? v 32))))

(deftest structural-sharing-keeps-originals
  (let [v1 (build 100) v2 (conj v1 100)]
    (is (= 100 (count v1)))
    (is (= 101 (count v2)))
    (is (all-at-index? v1 100))
    (is (all-at-index? v2 101))))

(deftest vector-predicate
  (is (vector? [1 2]))
  (is (not (vector? nil)))
  (is (not (vector? '(1 2))))
  (is (not (vector? 42))))
