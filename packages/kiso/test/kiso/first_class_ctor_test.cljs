(ns kiso.first-class-ctor-test
  (:require [clojure.test :refer [deftest is]]))

(deftest vector-as-value
  (is (= [[0 :a] [1 :b]] (vec (map-indexed vector [:a :b]))))
  (is (= [[1 3] [2 4]] (vec (map vector [1 2] [3 4]))))
  (is (= [1 2 3] (apply vector [1 2 3]))))

(deftest strings-as-seqs
  (is (= ["a" "b"] (vec "ab")))
  (is (= [[0 "a"] [1 "b"]] (vec (map-indexed vector "ab"))))
  (is (= [["a" "c"] ["b" "d"]] (vec (map vector "ab" "cd")))))
