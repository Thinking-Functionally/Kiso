;; Remaining clojure.core behaviour from test/runtime/core.test.ts (both backends).
(ns kiso.core-more-test
  (:require [clojure.test :refer [deftest is]]))

(deftest numeric-misc
  (is (= [5 3] [(abs -5) (abs 3)]))
  (is (true? (float? 3.14)))
  (is (false? (float? 3)))
  (is (true? (== 1.0 1))))

(deftest collection-predicates
  (is (true? (ifn? (fn [] 1))))
  (is (true? (ifn? :a)))
  (is (false? (ifn? 42)))
  (is (true? (counted? [1])))
  (is (true? (counted? {})))
  (is (false? (counted? 42)))
  (is (true? (reversible? [1 2])))
  (is (false? (reversible? '(1 2))))
  (is (false? (reversible? nil)))
  (is (false? (sorted? {})))
  (is (false? (sorted? nil))))

(deftest string-printing
  (is (= "\"hello\"\n" (prn-str "hello")))
  (is (= "hello\n" (println-str "hello")))
  (is (= "1 2" (print-str 1 2)))
  (is (= "[1 \"a\"]" (pr-str [1 "a"]))))
