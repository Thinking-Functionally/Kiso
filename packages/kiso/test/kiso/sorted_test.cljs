;; sorted-map / sorted-set (ported from test/runtime/sorted-{map,set}.test.ts).
;; targets: js
(ns kiso.sorted-test
  (:require [clojure.test :refer [deftest is]]))

(deftest sorted-map-basics
  (is (= 0 (count (sorted-map))))
  (let [m (sorted-map "b" 2 "a" 1 "c" 3)]
    (is (= 3 (count m)))
    (is (= [1 2 3] [(get m "a") (get m "b") (get m "c")]))
    (is (nil? (get m "z")))
    (is (true? (contains? m "a")))
    (is (false? (contains? m "z"))))
  (is (= 99 (get (assoc (sorted-map "a" 1) "a" 99) "a")))
  (is (= 1 (count (assoc (sorted-map "a" 1) "a" 99)))))

(deftest sorted-map-dissoc
  (let [m (dissoc (sorted-map "a" 1 "b" 2 "c" 3) "b")]
    (is (= 2 (count m)))
    (is (false? (contains? m "b"))))
  (is (= 0 (count (dissoc (sorted-map "a" 1) "a"))))
  (is (= 1 (count (dissoc (sorted-map "a" 1) "z")))))

(deftest sorted-map-order
  (is (= ["a" "b" "c"] (keys (sorted-map "c" 3 "a" 1 "b" 2))))
  (is (= [1 2 3] (vals (sorted-map "c" 3 "a" 1 "b" 2))))
  (is (= [1 2 3] (keys (sorted-map 3 "c" 1 "a" 2 "b"))))
  (is (= [:a :b :c] (keys (sorted-map :c 3 :a 1 :b 2))))
  (is (= [nil "a"] (keys (sorted-map nil "nil-val" "a" 1))))
  (is (= "nil-val" (get (sorted-map nil "nil-val" "a" 1) nil))))

(deftest sorted-map-by-comparator
  (is (= [3 2 1] (keys (sorted-map-by > 1 "a" 3 "c" 2 "b")))))

(deftest sorted-map-many
  (let [m (reduce (fn [acc i] (assoc acc i (* i 10))) (sorted-map) (range 100 0 -1))]
    (is (= 100 (count m)))
    (is (= [10 500 1000] [(get m 1) (get m 50) (get m 100)]))
    (is (= (range 1 101) (keys m))))
  (let [m (reduce dissoc (reduce #(assoc %1 %2 %2) (sorted-map) (range 1 51)) (range 2 51 2))]
    (is (= 25 (count m)))
    (is (= (range 1 51 2) (keys m)))))

(deftest sorted-map-subseq
  (let [m (sorted-map 1 "a" 2 "b" 3 "c" 4 "d" 5 "e")]
    (is (= [3 4 5] (map first (subseq m >= 3))))
    (is (= [4 5] (map first (subseq m > 3))))
    (is (= [3 2 1] (map first (rsubseq m <= 3))))
    (is (= [2 1] (map first (rsubseq m < 3))))))

(deftest sorted-set-basics
  (is (= 0 (count (sorted-set))))
  (let [s (sorted-set 3 1 2)]
    (is (= 3 (count s)))
    (is (true? (contains? s 1)))
    (is (false? (contains? s 99)))
    (is (= 3 (count (conj s 2))))
    (is (= 4 (count (conj s 4)))))
  (is (= 3 (count (sorted-set 1 2 3 2 1))))
  (let [s (disj (sorted-set 1 2 3) 2)]
    (is (= 2 (count s)))
    (is (false? (contains? s 2))))
  (is (= 3 (count (disj (sorted-set 1 2 3) 99)))))

(deftest sorted-set-order
  (is (= [1 2 3 4 5 6 9] (seq (sorted-set 3 1 4 1 5 9 2 6))))
  (is (= [:a :b :c] (seq (sorted-set :c :a :b))))
  (is (= (range 1 101) (seq (reduce conj (sorted-set) (range 100 0 -1))))))
