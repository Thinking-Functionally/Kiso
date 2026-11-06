;; Destructuring (ported from test/conformance/destructuring.test.ts).
(ns kiso.destructuring-test
  (:require [clojure.test :refer [deftest is]]))

(deftest keys-or-as
  (is (= [1 10 20] (let [{:keys [a b c] :or {b 10 c 20} :as m} {:a 1}] [a b c])))
  (is (= 3 (let [{:keys [a b] :or {a 99 b 99}} {:a 1 :b 2}] (+ a b))))
  (is (nil? (let [{:keys [a] :or {a 42}} {:a nil}] a)))
  (is (= 2 (let [{:keys [x] :as m} {:x 1 :y 2}] (count m)))))

(deftest nested-sequential
  (is (= 10 (let [[[a [b c]] d] [[1 [2 3]] 4]] (+ a b c d))))
  (is (= 42 (let [[[[x]]] [[[42]]]] x)))
  (is (= 1 (let [[[a b] & more] [[1 2] 3 4]] a))))

(deftest nested-associative
  (is (= 42 (let [{{:keys [x]} :inner} {:inner {:x 42}}] x)))
  (is (= 30 (let [[{:keys [a]} b] [{:a 10} 20]] (+ a b))))
  (is (= 30 (let [{[a b] :pair} {:pair [10 20]}] (+ a b)))))

(deftest rest-edge-cases
  (is (true? (let [[a b & more] [1 2]] (nil? more))))
  (is (= 3 (let [[a & more :as all] [1 2 3]] (count all))))
  (is (= 2 (let [[a & more] [1 2 3 4]] (first more)))))

(deftest fn-param-destructuring
  (is (= 6 ((fn [[a b c]] (+ a b c)) [1 2 3])))
  (is (= 101 ((fn [{:keys [x y] :or {y 100}}] (+ x y)) {:x 1})))
  (is (= 6 ((fn [[a [b c]]] (+ a b c)) [1 [2 3]])))
  (is (= 11 (let [f (fn ([x] x) ([x [a b]] (+ x a b)))] (+ (f 10) (f 0 [0 1]))))))

(deftest let-destructuring
  (is (= 6 (let [[a b] [1 2] {:keys [x]} {:x 3}] (+ a b x))))
  (is (= 15 (let [[a b] [(+ 1 2) (* 3 4)]] (+ a b))))
  (is (= :ok (let [[] []] :ok))))

(deftest sequential-basics
  (is (= [1 2] (let [[a b] [1 2]] [a b])))
  (is (nil? (let [[a b c] [1 2]] c)))
  (is (= [2 3] (vec (let [[a & more] [1 2 3]] more))))
  (is (= [3 4] (vec (let [[a b & more] [1 2 3 4]] more))))
  (is (= 2 (count (let [[a b :as all] [10 20]] all))))
  (is (= [1 3] (let [[[a b] c] [[1 2] 3]] [a c]))))

(deftest associative-basics
  (is (= [1 2] (let [{:keys [a b]} {:a 1 :b 2}] [a b])))
  (is (= 99 (let [{:keys [a b] :or {b 99}} {:a 1}] b)))
  (is (= 2 (count (let [{:keys [a] :as m} {:a 1 :b 2}] m))))
  (is (= 1 (let [{x :x y :y} {:x 1 :y 2}] x)))
  (is (= 10 ((fn [[a b]] a) [10 20])))
  (is (= 42 ((fn [{:keys [x]}] x) {:x 42}))))
