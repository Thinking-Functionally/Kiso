;; targets: js
;; Ported from conformance/protocols.test.ts: JS interop parts (extend-type on built-ins, field access, dispatch errors).
(ns kiso.protocols-js-test
  (:require [clojure.test :refer [deftest is thrown?]]))

(defprotocol ILen (len [this]))
(extend-type js/String
  ILen
  (len [this] (.-length this)))

(defprotocol ISize (size [this]))
(extend-type js/Array
  ISize
  (size [this] (.-length this)))

(defprotocol IBar (bar [this]))
(deftype Pt [x y])
(deftype Greeter [name]
  IBar
  (bar [this] (str "Hello, " (.-name this))))

(deftest extend-builtin-string (is (= 5 (len "hello"))))
(deftest extend-builtin-array (is (= 3 (size (js* "[1,2,3]")))))
(deftest deftype-field-access
  (let [p (Pt. 10 20)] (is (= 30 (+ (.-x p) (.-y p))))))
(deftest this-field-access (is (= "Hello, W" (bar (Greeter. "W")))))
(deftest dispatch-nil-throws (is (thrown? js/Error (bar nil))))
(deftest dispatch-missing-throws (is (thrown? js/Error (bar (js* "{}")))))
