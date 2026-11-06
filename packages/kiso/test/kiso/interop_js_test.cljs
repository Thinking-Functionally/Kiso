;; targets: js
;; Ported from conformance/interop.test.ts: JS host interop (method calls, .., .-, new, js*).
(ns kiso.interop-js-test
  (:require [clojure.test :refer [deftest is]]))

(deftest method-calls
  (is (= "HELLO" (.toUpperCase "hello")))
  (is (= "world" (.slice "hello world" 6 11)))
  (is (= "2a" (-> 42 (.toString 16))))
  (is (= "HELLO" (-> "  hello  " .trim .toUpperCase)))
  (let [arr (js* "[3,1,2]")]
    (.sort arr)
    (is (= 1 (js* "arr[0]")))))

(deftest double-dot
  (is (= 42 (.. (js* "{ a: { b: { c: 42 } } }") -a -b -c)))
  (is (= "hello-world" (.. "hello world" (.split " ") (.join "-"))))
  (is (= 5 (.. "hello" .toUpperCase -length)))
  (is (= "HELLO" (.. "hello" .toUpperCase)))
  (is (= 99 (.. (js* "{ a: { b: 99 } }") -a -b))))

(deftest property-access
  (is (= 10 (.-x (js* "{ x: 10 }"))))
  (is (= 5 (.-length "hello")))
  (is (= 3 (.-length (js* "[1,2,3]"))))
  (let [obj (js* "{ x: 0 }")]
    (set! (.-x obj) 42)
    (is (= 42 (.-x obj)))))

(deftest constructors
  (is (= "oops" (.-message (new js/Error "oops"))))
  (is (= 2024 (.getFullYear (new js/Date 2024 0 1))))
  (is (true? (.test (new js/RegExp "^hello") "hello world"))))

(deftest raw-js
  (is (= 3 (js* "1 + 2")))
  (is (< 3.14 (js* "Math.PI") 3.15))
  (is (= 3 (let [x (js* "Math.floor(3.7)")] x)))
  (is (= :yes (if (js* "1 > 0") :yes :no)))
  (is (nil? (js* "undefined")))
  (is (string? (str [1 2 3])))
  (let [arr (js* "[10, 20, 30]")]
    (is (= 20 (js* "arr[1]")))))
