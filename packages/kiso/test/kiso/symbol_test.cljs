;; Symbols as seen from Kiso code (complements test/runtime/symbol.test.ts, which keeps JS internals).
(ns kiso.symbol-test
  (:require [clojure.test :refer [deftest is]]))

(deftest symbol-construction
  (is (= "foo" (name (symbol "foo"))))
  (is (nil? (namespace (symbol "foo"))))
  (is (= "foo" (name (symbol "my.ns" "foo"))))
  (is (= "my.ns" (namespace (symbol "my.ns" "foo")))))

(deftest symbol-printing
  (is (= "foo" (str (symbol "foo"))))
  (is (= "ns/bar" (str (symbol "ns" "bar")))))

(deftest symbol-predicate-and-equality
  (is (true? (symbol? 'foo)))
  (is (false? (symbol? "foo")))
  (is (false? (symbol? :foo)))
  (is (false? (symbol? nil)))
  (is (= 'foo (symbol "foo")))
  (is (not= 'foo 'bar))
  (is (not= 'foo :foo))
  (is (= 1 (get {'foo 1} (symbol "foo")))))
