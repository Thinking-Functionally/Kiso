(ns kiso.array-test
  (:require [clojure.test :refer [deftest is]]))

(deftest basic-array
  (let [a (array 1 2 3)]
    (is (= 3 (alength a)))
    (is (= 2 (aget a 1)))
    (aset a 1 20)
    (is (= 20 (aget a 1)))
    (is (= 3 (count a)))))

(deftest array-conversion
  (let [a (into-array [1 2 3])]
    (is (= [1 2 3] (vec a)))
    (is (= [1 2 3] (vec (to-array '(1 2 3)))))
    (is (= 6 (reduce + a)))))

(deftest clone-is-independent
  (let [a (array 1 2)
        b (aclone a)]
    (aset b 0 99)
    (is (= 1 (aget a 0)))
    (is (= 99 (aget b 0)))))

(deftest array-seq-ops
  (let [a (array 3 1 2)]
    (is (= [4 2 3] (mapv inc a)))
    (is (= [1 2 3] (vec (sort a))))
    (is (= 3 (first a)))))
