;; Persistent set behaviour (ported from test/runtime/hash-set.test.ts).
(ns kiso.hash-set-test
  (:require [clojure.test :refer [deftest is]]))

(deftest empty-set
  (is (= 0 (count #{})))
  (is (false? (contains? #{} "a")))
  (is (= 0 (count (hash-set)))))

(deftest conj-adds
  (let [s (conj #{} "a")]
    (is (= 1 (count s)))
    (is (true? (contains? s "a"))))
  (let [s (-> #{} (conj "a") (conj "b") (conj "c"))]
    (is (= 3 (count s)))
    (is (every? #(contains? s %) ["a" "b" "c"])))
  (is (= 1 (count (-> #{} (conj "a") (conj "a")))))
  (let [s1 (conj #{} "a") s2 (conj s1 "b")]
    (is (= 1 (count s1)))
    (is (false? (contains? s1 "b")))
    (is (= 2 (count s2)))))

(deftest disj-removes
  (let [s (disj (-> #{} (conj "a") (conj "b")) "a")]
    (is (= 1 (count s)))
    (is (false? (contains? s "a")))
    (is (true? (contains? s "b"))))
  (is (= 1 (count (disj (conj #{} "a") "b"))))
  (is (= 0 (count (disj (conj #{} "a") "a")))))

(deftest membership
  (let [s (hash-set 1 2 3)]
    (is (every? #(contains? s %) [1 2 3]))
    (is (false? (contains? s 4))))
  (let [s (conj #{} nil)]
    (is (true? (contains? s nil)))
    (is (= 1 (count s)))))

(deftest hash-set-constructor
  (is (= 3 (count (hash-set "a" "b" "c"))))
  (is (= 3 (count (hash-set 1 1 2 2 3))))
  (is (= 0 (count (hash-set)))))

(deftest set-predicate
  (is (set? #{}))
  (is (set? (hash-set 1)))
  (is (not (set? nil)))
  (is (not (set? [1]))))

(deftest large-set
  (let [s (loop [s #{} i 0] (if (< i 100) (recur (conj s i) (inc i)) s))]
    (is (= 100 (count s)))
    (is (every? #(contains? s %) (range 100)))
    (is (false? (contains? s 100)))))
