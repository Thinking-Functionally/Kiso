(ns kiso.dup-params-test
  (:require [clojure.test :refer [deftest is]]))

(def f (fn [_ _] 1))
(defn g [_ _ x] x)
(defn h
  ([_ _] :two)
  ([_ _ _ z] z))
(defn r [_ _ n]
  (if (pos? n) (recur 0 0 (dec n)) :done))

(deftest duplicate-underscore-params
  (is (= 1 (f 1 2)))
  (is (= 3 (g 1 2 3)))
  (is (= :two (h 1 2)))
  (is (= 9 (h 1 2 3 9)))
  (is (= :done (r 0 0 3))))

(deftest duplicate-underscore-in-letfn-and-anon
  (is (= 4 ((fn [_ _ x] x) 1 2 4)))
  (is (= [1] (map (fn [_ _] 1) [1] [2]))))
