;; Keyword behaviour (ported from test/runtime/keyword.test.ts; interning/hash internals stay in TS).
(ns kiso.keyword-test
  (:require [clojure.test :refer [deftest is]]))

(deftest keyword-parts
  (is (= "foo" (name :foo)))
  (is (nil? (namespace :foo)))
  (is (= "bar" (name :ns/bar)))
  (is (= "ns" (namespace :ns/bar))))

(deftest keyword-equality
  (is (= :bar :bar))
  (is (= :ns/baz :ns/baz))
  (is (not= :x :y))
  (is (not= :foo/a :foo/b))
  (is (not= :foo :ns/foo)))

(deftest keyword-printing
  (is (= ":foo" (str :foo)))
  (is (= ":ns/bar" (str :ns/bar))))

(deftest keyword-predicate
  (is (keyword? :foo))
  (is (not (keyword? "foo")))
  (is (not (keyword? 42)))
  (is (not (keyword? nil))))

(deftest keyword-as-function
  (is (= 42 (:foo {:foo 42})))
  (is (nil? (:foo {:bar 99})))
  (is (= "default" (:foo {:bar 99} "default")))
  (is (nil? (:foo nil)))
  (is (= 1 (:a {:a 1} :nf))))

(deftest symbol-predicate
  (is (symbol? 'a))
  (is (not (symbol? :a)))
  (is (not (symbol? "a")))
  (is (= "a" (name 'a))))

(deftest keyword-identity
  (is (identical? :a :a))
  (is (identical? :a/b :a/b))
  (is (not (identical? :a :b)))
  (is (identical? (keyword "x") :x)))
