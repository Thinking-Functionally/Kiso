;; Reduced, completing, transduce, 1-arity transducers, 3-arity into (ported from test/runtime/transducer.test.ts).
(ns kiso.transducer-test
  (:require [clojure.test :refer [deftest is]]))

(deftest reduced-basics
  (is (= 42 (unreduced (reduced 42))))
  (is (= 99 (unreduced 99)))
  (is (true? (reduced? (reduced 1))))
  (is (false? (reduced? 1)))
  (is (false? (reduced? nil)))
  (is (= 20 (unreduced (ensure-reduced 20))))
  (is (true? (reduced? (ensure-reduced 20)))))

(deftest reduce-early-termination
  (let [f (fn [acc x] (let [s (+ acc x)] (if (>= s 6) (reduced s) s)))]
    (is (= 6 (reduce f 0 (list 1 2 3 4 5))))
    (is (= 6 (reduce f 0 [1 2 3 4 5])))))

(deftest completing-fn
  (is (= 7 ((completing +) 3 4)))
  (is (= 42 ((completing +) 42)))
  (is (= 50 ((completing + #(* % 10)) 5))))

(deftest transduce-basics
  (is (= 12 (transduce (map #(* % 2)) + 0 (list 1 2 3))))
  (is (= 12 (transduce (map #(* % 2)) + (list 1 2 3))))
  (is (= 6 (transduce (filter even?) + 0 (list 1 2 3 4 5))))
  (is (= 30 (transduce (take 2) + 0 (list 10 20 30 40))))
  (is (= 0 (transduce (take 0) + 0 (list 1 2 3)))))

(deftest eager-arities-still-work
  (is (= [2 3 4] (map inc (list 1 2 3))))
  (is (= [3 4] (filter #(> % 2) (list 1 2 3 4))))
  (is (= [1 2] (take 2 (list 1 2 3 4)))))

(deftest into-with-xform
  (is (= [10 20 30] (into [] (map #(* % 10)) (list 1 2 3))))
  (is (= [3 4] (into [] (filter #(> % 2)) (list 1 2 3 4))))
  (is (= [:div 2 3 4] (into [:div] (map inc) (list 1 2 3))))
  (is (= [1 2 3] (into [1] (list 2 3)))))

(deftest xform-composition
  (is (= 18 (transduce (comp (map #(* % 2)) (filter #(> % 2))) + 0 (list 1 2 3 4))))
  (is (= [10 20] (into [] (comp (take 2) (map #(* % 10))) (list 1 2 3 4)))))
