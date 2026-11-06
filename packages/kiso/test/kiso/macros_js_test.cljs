;; binding / with-redefs on def-bound vars (JS only; ported from test/conformance/macros.test.ts).
;; targets: js
(ns kiso.macros-js-test
  (:require [clojure.test :refer [deftest is]]))

(def x 10)
(def greeting "hello")

(deftest binding-forms
  (let [during (binding [x 42] x)
        after x]
    (is (= 42 during))
    (is (= 10 after))))

(deftest with-redefs-forms
  (let [during (with-redefs [greeting "goodbye"] greeting)
        after greeting]
    (is (= "goodbye" during))
    (is (= "hello" after))))
