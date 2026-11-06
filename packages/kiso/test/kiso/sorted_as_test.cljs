;; Core functions that were missing on AS: sorted collections, metadata, identity, misc (both backends).
(ns kiso.sorted-as-test
  (:require [clojure.test :refer [deftest is]]))

(deftest sorted-map-basics
  (let [m (sorted-map 3 :c 1 :a 2 :b)]
    (is (= [1 2 3] (vec (keys m))))
    (is (= [:a :b :c] (vec (vals m))))
    (is (= :b (get m 2)))
    (is (= 3 (count m)))
    (is (= [1 2 3 4] (vec (keys (assoc m 4 :d)))))
    (is (= [2 3] (vec (keys (dissoc m 1)))))
    (is (= [0 1 2 3] (vec (keys (assoc m 0 :z)))))
    (is (= :bb (get (assoc m 2 :bb) 2)))
    (is (true? (sorted-map? m)))
    (is (true? (sorted? m)))
    (is (false? (sorted? {})))))

(deftest sorted-map-by-comparator
  (let [m (sorted-map-by > 1 :a 3 :c 2 :b)]
    (is (= [3 2 1] (vec (keys m))))
    (is (= [4 3 2 1] (vec (keys (assoc m 4 :d)))))))

(deftest sorted-set-basics
  (let [s (sorted-set 3 1 2 2)]
    (is (= [1 2 3] (vec s)))
    (is (= [0 1 2 3] (vec (conj s 0))))
    (is (= [1 3] (vec (disj s 2))))
    (is (true? (contains? s 2)))
    (is (true? (sorted-set? s)))
    (is (= [3 2 1] (vec (sorted-set-by > 1 2 3))))))

(deftest subseq-forms
  (let [m (sorted-map 1 :a 2 :b 3 :c 4 :d)
        s (sorted-set 1 2 3 4 5)]
    (is (= [[3 :c] [4 :d]] (vec (subseq m >= 3))))
    (is (= [[1 :a] [2 :b]] (vec (subseq m < 3))))
    (is (= [2 3 4] (vec (subseq s > 1 < 5))))
    (is (= [[4 :d] [3 :c]] (vec (rsubseq m >= 3))))
    (is (= [4 3 2] (vec (rsubseq s > 1 < 5))))
    (is (nil? (subseq m > 10)))))

(deftest metadata-forms
  (let [v (with-meta [1 2] {:tag :x})]
    (is (= {:tag :x} (meta v)))
    (is (= [1 2] v))
    (is (nil? (meta [1 2])))
    (is (= {:tag :y} (meta (vary-meta v assoc :tag :y)))))
  (is (= {:a 1} (meta (with-meta {:k 1} {:a 1}))))
  (is (= {:a 1} (meta (with-meta #{1} {:a 1})))))

(deftest atom-meta
  (let [a (atom 0)]
    (is (nil? (meta a)))
    (reset-meta! a {:doc "x"})
    (is (= {:doc "x"} (meta a)))
    (alter-meta! a assoc :n 1)
    (is (= {:doc "x" :n 1} (meta a)))))

(deftest misc-core
  (is (true? (identical? :a :a)))
  (is (true? (identical? 1 1)))
  (is (false? (identical? [1] [1])))
  (let [v [1]] (is (true? (identical? v v))))
  (is (= (hash "a") (hash "a")))
  (is (number? (hash :k)))
  (is (true? (realized? [1 2])))
  (let [s (map inc [1 2 3])]
    (is (false? (realized? s)))
    (doall s)
    (is (true? (realized? s))))
  (is (= [-1 1 0] (map (comparator <) [1 2 3] [2 1 3])))
  (is (= [3 2 1] (sort (comparator >) [1 2 3])))
  (is (true? (distinct? 1 2 3)))
  (is (false? (distinct? 1 2 1)))
  (is (= [2 3] (sequence (map inc) [1 2])))
  (is (= '(1 2) (sequence [1 2])))
  (is (= [3 2 1] (vec (rseq [1 2 3]))))
  (is (nil? (rseq [])))
  (is (= [-1 -2 -6] (map bit-not [0 1 5])))
  (let [r (rand)] (is (and (>= r 0) (< r 1))))
  (let [r (rand 10)] (is (and (>= r 0) (< r 10)))))
