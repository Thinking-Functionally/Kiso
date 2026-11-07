(ns kiso.json-test
  (:require [clojure.test :refer [deftest is testing]]))

(deftest parse-basic
  (is (= {:a 1 :b [1 2 {:c nil}] :d "x" :e true} (host/json-parse "{\"a\":1,\"b\":[1,2,{\"c\":null}],\"d\":\"x\",\"e\":true}")))
  (is (= [] (host/json-parse "[]")))
  (is (= {} (host/json-parse "{}")))
  (is (= 1.5 (host/json-parse "1.5")))
  (is (nil? (host/json-parse "null"))))

(deftest parse-unicode
  (is (= "é😀" (host/json-parse "\"\\u00e9\\ud83d\\ude00\"")))
  (is (= "a\nb\t\"q\"" (host/json-parse "\"a\\nb\\t\\\"q\\\"\""))))

(deftest stringify-basic
  (is (= "{\"a\":1,\"b\":[1,2,null]}" (host/json-stringify {:a 1 :b [1 2 nil]})))
  (is (= "[1]" (host/json-stringify #{1})))
  (is (= "[1,2,3]" (host/json-stringify '(1 2 3))))
  (is (= "null" (host/json-stringify nil)))
  (is (= "\"a/b\"" (host/json-stringify :a/b)))
  (is (= "{\"a/b\":1}" (host/json-stringify {:a/b 1})))
  (is (= "{\"3\":1}" (host/json-stringify {3 1}))))

(deftest round-trip
  (let [m {:name "Kiso" :tags ["a" "b"] :n {:x 1.5 :y [true false nil]}}]
    (is (= m (host/json-parse (host/json-stringify m))))))

(deftest edn-round-trip
  (let [m {:a 1 :b [1 2 3] :c #{:x} :d "s" :e nil :f '(1 2)}]
    (is (= m (read-string (pr-str m))))))
