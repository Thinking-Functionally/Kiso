(ns kiso.loop-dup-test
  (:require [clojure.test :refer [deftest is]]))

(deftest loop-duplicate-underscore
  (is (= 3 (loop [_ 1 _ 2 n 3] n)))
  (is (= 5 (loop [_ 0 _ 0 n 0] (if (< n 5) (recur 1 1 (inc n)) n)))))
