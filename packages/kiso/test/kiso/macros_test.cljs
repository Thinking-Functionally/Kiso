;; Macro and fn edge cases (ported from test/conformance/macros.test.ts).
(ns kiso.macros-test
  (:require [clojure.test :refer [deftest is]]))


(deftest multi-arity
  (let [f (fn ([] 0) ([x] x) ([x y] (+ x y)))]
    (is (= [0 1 5] [(f) (f 1) (f 2 3)])))
  (is (= 42 ((fn ([] 42)))))
  (let [f (fn ([x] (str "one: " x)) ([x y] (str "two: " x y)))]
    (is (= "one: hello" (f "hello")))
    (is (= "two: ab" (f "a" "b")))))

(deftest variadic
  (let [f (fn [x & rest] (first rest))]
    (is (= 2 (f 1 2 3))))
  (let [f (fn [x & rest] (nil? rest))]
    (is (true? (f 1))))
  (let [f (fn ([x] (str "one: " x)) ([x & more] (str "many: " x (count more))))]
    (is (= "one: a" (f "a")))
    (is (= "many: b2" (f "b" 1 2)))))

(deftest case-forms
  (is (= 2 (case :b :a 1 :b 2 :c 3 0)))
  (is (= :not-found (case :z :a 1 :b 2 :not-found)))
  (is (= :nil-match (case nil nil :nil-match :other)))
  (is (= :two (case 2 1 :one 2 :two 3 :three :default)))
  (is (= 2 (case "b" "a" 1 "b" 2 :default))))

(deftest cond-forms
  (is (= :b (cond false :a true :b :else :c)))
  (is (= :c (cond false :a false :b :else :c)))
  (is (nil? (cond false :a false :b)))
  (is (= :right (cond (= 1 2) :wrong (= 2 2) :right))))

(deftest letfn-forms
  (letfn [(ev? [n] (if (= n 0) true (od? (- n 1))))
          (od? [n] (if (= n 0) false (ev? (- n 1))))]
    (is (true? (ev? 10)))
    (is (true? (od? 7))))
  (letfn [(fact [n] (if (<= n 1) 1 (* n (fact (- n 1)))))]
    (is (= 120 (fact 5))))
  (letfn [(a [x] (if (> x 0) (b (- x 1)) :done))
          (b [x] (a x))]
    (is (= :done (a 3)))))

(deftest condp-forms
  (is (= :two (condp = 2 1 :one 2 :two :default)))
  (is (= :default (condp = 9 1 :one 2 :two :default))))

(deftest conditional-macros
  (is (= :yes (when true :yes)))
  (is (nil? (when false :yes)))
  (is (= :yes (when-not false :yes)))
  (is (= :else (if-not true :then :else)))
  (is (= 42 (if-let [x 42] x :none)))
  (is (= :none (if-let [x nil] x :none)))
  (is (= 11 (when-let [x 10] (+ x 1))))
  (is (nil? (when-let [x nil] (+ x 1)))))

(deftest dotimes-while
  (let [a (atom "")]
    (dotimes [i 3] (swap! a str i))
    (is (= "012" @a)))
  (let [a (atom "init")]
    (dotimes [i 0] (reset! a "changed"))
    (is (= "init" @a)))
  (let [n (atom 0)]
    (while (< @n 5) (swap! n inc))
    (is (= 5 @n)))
  (let [n (atom 10)]
    (while (< @n 5) (swap! n inc))
    (is (= 10 @n))))

(deftest and-or
  (is (= 42 (or nil false 42 99)))
  (is (false? (or nil false)))
  (is (= 3 (and 1 2 3)))
  (is (nil? (and 1 nil 3)))
  (is (true? (and)))
  (is (nil? (or))))
