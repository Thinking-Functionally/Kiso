;; Small maps keep insertion order (ClojureScript array-map); beyond 8 entries only the contents are guaranteed.
(ns kiso.map-order-test
  (:require [clojure.test :refer [deftest is]]))

(deftest literal-order
  (is (= [:b :a :c] (vec (keys {:b 1 :a 2 :c 3}))))
  (is (= "{:z 1, :a 2, :m 3}" (pr-str {:z 1 :a 2 :m 3}))))

(deftest assoc-appends-and-replaces-in-place
  (let [m (assoc {:b 1 :a 2} :c 3)]
    (is (= [:b :a :c] (vec (keys m))))
    (is (= [:b :a :c] (vec (keys (assoc m :a 99)))))
    (is (= 99 (get (assoc m :a 99) :a)))))

(deftest dissoc-keeps-the-rest-in-order
  (is (= [:b :c] (vec (keys (dissoc {:b 1 :a 2 :c 3} :a)))))
  (is (= {} (dissoc {:a 1} :a))))

(deftest equality-ignores-order
  (is (= {:a 1 :b 2} {:b 2 :a 1}))
  (is (= (hash {:a 1 :b 2}) (hash {:b 2 :a 1}))))

(deftest ordered-vals-and-seq
  (is (= [1 2 3] (vec (vals {:x 1 :y 2 :z 3}))))
  (is (= [[:x 1] [:y 2]] (vec (seq {:x 1 :y 2})))))

(deftest growing-past-eight-entries-stays-correct
  (let [m (reduce (fn [acc i] (assoc acc i (* i i))) {} (range 20))]
    (is (= 20 (count m)))
    (is (= 361 (get m 19)))
    (is (= 0 (get m 0)))
    (is (= (set (range 20)) (set (keys m))))
    (is (= 19 (count (dissoc m 7))))
    (is (nil? (get (dissoc m 7) 7)))))
