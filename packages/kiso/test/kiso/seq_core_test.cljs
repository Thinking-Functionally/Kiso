;; seq / first / rest / next / nth behaviour (ported from test/runtime/seq.test.ts).
(ns kiso.seq-core-test
  (:require [clojure.test :refer [deftest is]]))

(deftest seq-on-nil
  (is (nil? (seq nil)))
  (is (nil? (first nil)))
  (is (= 0 (count (rest nil))))
  (is (nil? (next nil))))

(deftest seq-on-list
  (is (nil? (seq (list))))
  (is (= '(1 2 3) (seq (list 1 2 3))))
  (let [l (list 1 2 3)]
    (is (= 1 (first l)))
    (is (= 2 (first (rest l))))
    (is (= 2 (first (next l)))))
  (is (nil? (next (list 1)))))

(deftest seq-identity-and-non-nil
  (let [l (list 1 2 3)]
    (is (identical? l (seq l))))
  (is (some? (seq [1 2 3]))))

(deftest seq-on-vector
  (is (nil? (seq [])))
  (is (= 1 (first (seq [1 2 3]))))
  (is (= [10 20 30] (loop [s (seq [10 20 30]) acc []]
                      (if s (recur (next s) (conj acc (first s))) acc)))))

(deftest into-and-vec
  (let [v (into [] (list 1 2 3))]
    (is (= 3 (count v)))
    (is (= 1 (nth v 0)))
    (is (= 3 (nth v 2))))
  (is (= [4 5 6] (vec (seq [4 5 6])))))

(deftest seq-on-maps-and-sets
  (is (nil? (seq {})))
  (let [e (first (seq {:a 1 :b 2}))]
    (is (vector? e))
    (is (= :a (get e 0)))
    (is (= 1 (get e 1))))
  (is (= 2 (count (seq {:x 10 :y 20}))))
  (is (nil? (seq #{})))
  (is (= [1 2 3] (vec (sort (seq #{1 2 3}))))))

(deftest nth-behaviour
  (is (nil? (nth nil 0)))
  (is (nil? (nth nil 5)))
  (is (= "default" (nth nil 0 "default")))
  (is (= 10 (nth [10 20 30] 0)))
  (is (= 30 (nth [10 20 30] 2)))
  (is (= :nf (nth [10 20 30] 5 :nf)))
  (is (= 10 (nth (list 10 20 30) 0)))
  (is (= 30 (nth (list 10 20 30) 2)))
  (is (= :nf (nth (list 10 20 30) 5 :nf)))
  (is (= "h" (nth "hello" 0)))
  (is (= "o" (nth "hello" 4)))
  (is (nil? (nth "hello" 10 nil))))

(deftest nth-out-of-bounds-throws
  (is (thrown? js/Error (nth [10 20 30] 5)))
  (is (thrown? js/Error (nth (list 10 20 30) 5)))
  (is (thrown? js/Error (nth "hello" 10)))
  (is (thrown? js/Error (nth [1 2] -1))))
