;; Ported from conformance/interop.test.ts: truthiness / nil semantics (both backends).
(ns kiso.truthiness-test
  (:require [clojure.test :refer [deftest is]]))

(deftest truthiness
  (is (= :truthy (if "" :truthy :falsy)))
  (is (= :truthy (if 0 :truthy :falsy)))
  (is (= :falsy (if false :truthy :falsy)))
  (is (= :falsy (if nil :truthy :falsy)))
  (is (nil? nil)))
