;; clojure.core behaviour specific to the JS backend (regex, JS arrays/objects, host types).
;; targets: js
(ns kiso.core-js-test
  (:require [clojure.test :refer [deftest is]]))

(deftest regex-functions
  (is (= "123" (re-find #"\d+" "abc123def")))
  (is (nil? (re-find #"\d+" "abcdef")))
  (is (= "123" (re-matches #"\d+" "123")))
  (is (nil? (re-matches #"\d+" "abc123")))
  (is (= ["1" "2" "3"] (re-seq #"\d+" "a1b2c3")))
  (is (true? (.test (re-pattern "\\d+") "123"))))

(deftest js-arrays-and-objects
  (let [arr (array 10 20 30)]
    (is (= 20 (aget arr 1)))
    (aset arr 1 99)
    (is (= 99 (aget arr 1)))
    (is (= 3 (alength arr))))
  (let [original (array 1 2 3)
        cloned (aclone original)]
    (is (= 3 (alength cloned)))
    (is (false? (identical? original cloned))))
  (is (= ["a" "b"] (vec (js-keys (js-obj "a" 1 "b" 2)))))
  (let [o (js-obj "a" 1 "b" 2)]
    (js-delete o "a")
    (is (nil? (aget o "a")))
    (is (= 2 (aget o "b")))))

(deftest hash-type-instance
  (is (number? (hash 42)))
  (is (number? (hash "hello")))
  (is (number? (hash nil)))
  (is (= (hash "test") (hash "test")))
  (is (true? (instance? js/RegExp #"abc")))
  (is (false? (instance? js/RegExp "abc")))
  (is (= js/Number (type 42)))
  (is (= js/String (type "hi")))
  (is (nil? (type nil))))

(defprotocol Unimplemented (frob [x]))

(deftest satisfies-without-impl
  (is (false? (satisfies? Unimplemented 42)))
  (is (false? (satisfies? Unimplemented nil)))
  (is (false? (satisfies? Unimplemented {:a 1}))))

(deftest meta-on-nil
  (is (nil? (alter-meta! nil identity)))
  (is (nil? (reset-meta! nil {}))))

(defrecord Impl [n] Unimplemented (frob [_] n))

(deftest satisfies-with-impl
  (is (true? (satisfies? Unimplemented (->Impl 1))))
  (is (= 1 (frob (->Impl 1)))))
