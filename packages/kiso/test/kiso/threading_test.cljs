;; Threading macros (ported from test/conformance/threading.test.ts; interop cases are in threading_interop_test.cljs).
(ns kiso.threading-test
  (:require [clojure.test :refer [deftest is]]))

(deftest thread-first
  (is (= 42 (-> 42)))
  (is (= 10 (-> 1 (+ 2) (+ 3) (+ 4))))
  (is (= "" (-> nil str)))
  (is (= 6 (-> (-> 1 (+ 2)) (+ 3)))))

(deftest thread-last
  (is (= 42 (->> 42)))
  (is (= 5 (->> 5 (- 10))))
  (is (= 6 (->> 1 (+ 2) (+ 3)))))

(deftest as-thread
  (is (= 6 (as-> 1 x (+ x 2) (+ x 3))))
  (is (= 93 (as-> 10 $ (- $ 3) (- 100 $))))
  (is (= 15 (as-> 5 x (+ x 10))))
  (is (= 42 (as-> 42 x))))

(deftest some-thread
  (is (= 6 (some-> 1 (+ 2) (+ 3))))
  (is (nil? (some-> nil (+ 1))))
  (is (= 10 (some-> 5 (- 5) (+ 10))))
  (is (true? (some-> true not not)))
  (is (nil? (some-> nil str)))
  (is (= 42 (some-> 42))))

(deftest some-thread-last
  (is (= 5 (some->> 5 (- 10))))
  (is (nil? (some->> nil (+ 1))))
  (is (= 5 (some->> 10 (- 10) (+ 5))))
  (is (= 99 (some->> 99))))

(deftest cond-thread
  (is (= 11 (cond-> 1 true (+ 10))))
  (is (= 1 (cond-> 1 false (+ 10))))
  (is (= 101 (cond-> 0 true (+ 1) false (+ 10) true (+ 100))))
  (is (= 7 (cond-> 10 true (- 3))))
  (is (= 42 (cond-> 42)))
  (is (= 1 (cond-> 1 nil (+ 10))))
  (is (= 11 (cond-> 1 0 (+ 10)))))

(deftest cond-thread-last
  (is (= 5 (cond->> 5 true (- 10))))
  (is (= 5 (cond->> 5 false (- 10))))
  (is (= 6 (cond->> 1 true (+ 2) false (+ 100) true (+ 3))))
  (is (= 42 (cond->> 42))))

(deftest combined-threading
  (is (= 13 (->> (-> 1 (+ 2)) (+ 10))))
  (is (= 13 (-> (->> 1 (+ 2)) (+ 10))))
  (is (= 15 (let [x (cond-> 10 true (+ 5) false (* 2))] x))))
