(ns kiso.read-string-test
  (:require [clojure.test :refer [deftest is testing]]
            [clojure.edn :as edn]))

(deftest scalars
  (is (= 42 (read-string "42")))
  (is (= -7 (read-string "-7")))
  (is (= 1.5 (read-string "1.5")))
  (is (= "a\nb" (read-string "\"a\\nb\"")))
  (is (= :a (read-string ":a")))
  (is (= :x/y (read-string ":x/y")))
  (is (= 'foo (read-string "foo")))
  (is (= 'a/b (read-string "a/b")))
  (is (nil? (read-string "nil")))
  (is (true? (read-string "true")))
  (is (false? (read-string "false"))))

(deftest collections
  (is (= [1 2 3] (read-string "[1 2 3]")))
  (is (= '(1 2 3) (read-string "(1 2 3)")))
  (is (= {:a 1 :b [2 3]} (read-string "{:a 1, :b [2 3]}")))
  (is (= #{1 2} (read-string "#{1 2}")))
  (is (= [1 [2 {:k "v"}]] (read-string "[1 [2 {:k \"v\"}]]")))
  (is (vector? (read-string "[]")))
  (is (list? (read-string "(1)"))))

(deftest whitespace-and-comments
  (is (= [1 2] (read-string "  [1 ; comment\n 2]  ")))
  (is (nil? (read-string ""))))

(deftest edn-ns
  (is (= {:a [1 2]} (edn/read-string "{:a [1 2]}")))
  (is (= :k (edn/read-string ":k"))))

(deftest round-trip
  (let [v {:a [1 2 "x"] :b #{3}}]
    (is (= v (read-string (pr-str v))))))
