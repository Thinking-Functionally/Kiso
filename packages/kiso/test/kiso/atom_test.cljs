;; Atom behaviour (ported from test/runtime/atom.test.ts; hooks/labels/internal callbacks stay in TS).
(ns kiso.atom-test
  (:require [clojure.test :refer [deftest is]]))

(deftest atom-creation
  (is (= 42 @(atom 42)))
  (is (nil? @(atom nil)))
  (is (= 42 (deref (atom 42)))))

(deftest reset-bang
  (let [a (atom 1)]
    (reset! a 2)
    (is (= 2 @a)))
  (is (= 99 (reset! (atom 1) 99))))

(deftest swap-bang
  (let [a (atom 1)]
    (swap! a inc)
    (is (= 2 @a)))
  (let [a (atom 10)]
    (swap! a + 5)
    (is (= 15 @a)))
  (is (= 10 (swap! (atom 1) * 10)))
  (let [a (atom {:n 0})]
    (swap! a update :n inc)
    (is (= {:n 1} @a))))
