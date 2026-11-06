;; Equality semantics (ported from test/runtime/equiv.test.ts; JS-array and ":foo" string cases stay in TS).
(ns kiso.equality-test
  (:require [clojure.test :refer [deftest is]]))

(deftest nil-equality
  (is (= nil nil))
  (is (not= nil false))
  (is (not= nil 0))
  (is (not= nil "")))

(deftest boolean-equality
  (is (= true true))
  (is (= false false))
  (is (not= true false))
  (is (not= true 1))
  (is (not= false 0)))

(deftest number-equality
  (is (= 42 42))
  (is (= 0 0))
  (is (= -1 -1))
  (is (not= 1 2))
  (is (= 3.14 3.14))
  (is (= 1 1.0))
  (is (not= 42 "42")))

(deftest string-equality
  (is (= "hello" "hello"))
  (is (not= "hello" "world"))
  (is (= "" ""))
  (is (not= "1" 1)))

(deftest keyword-equality
  (is (= :foo :foo))
  (is (not= :foo :bar))
  (is (not= :foo "foo")))

(deftest vector-equality
  (is (= [] []))
  (is (= [1 2 3] [1 2 3]))
  (is (not= [1 2] [1 3]))
  (is (not= [1 2] [1 2 3]))
  (is (= [1 [2 3]] [1 [2 3]]))
  (is (not= [1 [2 3]] [1 [2 4]]))
  (is (not= [1] 1))
  (is (not= [1] "1")))

(deftest sequential-equality-across-types
  (is (= [1 2 3] '(1 2 3)))
  (is (= '(1 2 3) [1 2 3]))
  (is (= [2 3] (map inc [1 2]))))

(deftest map-and-set-equality
  (is (= {:a 1 :b 2} {:b 2 :a 1}))
  (is (not= {:a 1} {:a 2}))
  (is (= {:a [1 {:b 2}]} {:a [1 {:b 2}]}))
  (is (= #{1 2} #{2 1}))
  (is (not= #{1} #{2}))
  (is (not= [1 2] #{1 2})))
