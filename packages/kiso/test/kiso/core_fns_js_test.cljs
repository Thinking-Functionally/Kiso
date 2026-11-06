;; core functions the AS backend does not implement yet (see tracker D38).
;; targets: js
(ns kiso.core-fns-js-test
  (:require [clojure.test :refer [deftest is]]))

(deftest predicates
  (is (true? (nil? nil)))
  (is (false? (nil? false)))
  (is (false? (nil? 0)))
  (is (true? (some? 1)))
  (is (false? (some? nil)))
  (is (= [true true false false] [(not false) (not nil) (not true) (not 0)]))
  (is (true? (zero? 0)))
  (is (true? (pos? 1)))
  (is (true? (neg? -1)))
  (is (true? (number? 42)))
  (is (true? (string? "hi")))
  (is (true? (boolean? true)))
  (is (true? (fn? (fn [] 1))))
  (is (false? (fn? 42)))
  (is (true? (integer? 42)))
  (is (false? (integer? 3.14)))
  (is (true? (coll? [1])))
  (is (true? (coll? {})))
  (is (false? (coll? 42)))
  (is (true? (sequential? [1])))
  (is (true? (sequential? '(1))))
  (is (false? (sequential? {})))
  (is (true? (associative? {})))
  (is (true? (associative? [1])))
  (is (false? (associative? '(1))))
  (is (true? (even? 2)))
  (is (false? (even? 3)))
  (is (true? (odd? 3)))
  (is (false? (odd? 2))))

(deftest memoize-caches
  (let [calls (atom 0)
        f (memoize (fn [x] (swap! calls inc) (* x 2)))]
    (is (= 10 (f 5)))
    (is (= 10 (f 5)))
    (is (= 1 @calls))))

(deftest keys-vals-merge-select
  (is (= #{:a :b} (set (keys {:a 1 :b 2}))))
  (is (nil? (keys nil)))
  (is (= #{1 2} (set (vals {:a 1 :b 2}))))
  (is (= {:a 1 :b 3 :c 4} (merge {:a 1 :b 2} {:b 3 :c 4})))
  (is (= {:a 1} (merge nil {:a 1})))
  (is (= {:a 1} (merge {:a 1} nil)))
  (is (= {:a 1 :c 3} (select-keys {:a 1 :b 2 :c 3} [:a :c])))
  (is (= [:a 1] (find {:a 1} :a)))
  (is (nil? (find {:a 1} :x)))
  (is (= {"x" 1 "y" 5 "z" 4} (merge-with + {"x" 1 "y" 2} {"y" 3 "z" 4})))
  (is (= {"a" 1 "b" 2} (zipmap ["a" "b" "c"] [1 2])))
  (is (= 3 (reduce-kv (fn [acc k v] (+ acc v)) 0 {:a 1 :b 2}))))

(deftest positional-access
  (is (= [2 nil] [(second [1 2 3]) (second [1])]))
  (is (= [3 nil] [(last [1 2 3]) (last [])]))
  (is (= [1 2] (butlast [1 2 3])))
  (is (nil? (butlast [1])))
  (is (= [3 1] [(peek [1 2 3]) (peek (list 1 2 3))]))
  (is (= [1 2] (pop [1 2 3])))
  (is (= 1 (ffirst [[1 2] [3 4]])))
  (is (= 2 (fnext [1 2 3])))
  (is (= [2 3] (nfirst [[1 2 3]])))
  (is (= [3 4] (nnext [1 2 3 4]))))

(deftest trampoline-bounces
  (let [bounce (fn bounce [x acc] (if (<= x 0) acc (fn [] (bounce (dec x) (+ acc x)))))]
    (is (= 6 (trampoline bounce 3 0)))))

(deftest printing-to-strings
  (is (= "\"hello\"" (pr-str "hello")))
  (is (= "42" (pr-str 42)))
  (is (= "nil" (pr-str nil)))
  (is (= "hello" (print-str "hello")))
  (is (= "42" (print-str 42))))
