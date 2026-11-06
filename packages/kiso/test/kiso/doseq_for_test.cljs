;; doseq and for with modifiers (ported from test/e2e/for-doseq.test.ts).
(ns kiso.doseq-for-test
  (:require [clojure.test :refer [deftest is]]))

(deftest doseq-side-effects
  (let [acc (atom [])]
    (doseq [x [1 2 3]] (swap! acc conj x))
    (is (= [1 2 3] @acc)))
  (is (nil? (doseq [x [1 2 3]] x)))
  (let [acc (atom [])]
    (doseq [x [1 2] y [3 4]] (swap! acc conj [x y]))
    (is (= [[1 3] [1 4] [2 3] [2 4]] @acc)))
  (let [acc (atom [])]
    (doseq [x [1 2 3 4 5] :when (odd? x)] (swap! acc conj x))
    (is (= [1 3 5] @acc)))
  (let [acc (atom [])]
    (doseq [x [1 2 3] :let [y (+ x 10)]] (swap! acc conj y))
    (is (= [11 12 13] @acc)))
  (let [acc (atom [])]
    (doseq [x [1 2 3 4 5] :while (< x 4)] (swap! acc conj x))
    (is (= [1 2 3] @acc)))
  (let [acc (atom :init)]
    (doseq [x []] (reset! acc :changed))
    (is (= :init @acc))))

(deftest for-comprehensions
  (is (= '(11 12 13) (for [x [1 2 3]] (+ x 10))))
  (is (= '(4 5 5 6) (for [x [1 2] y [3 4]] (+ x y))))
  (is (= '(1 3 5) (for [x [1 2 3 4 5] :when (odd? x)] x)))
  (is (= '(1 4 9) (for [x [1 2 3] :let [y (* x x)]] y)))
  (is (= '(1 2 3) (for [x [1 2 3 4 5] :while (< x 4)] x)))
  (is (nil? (seq (for [x []] x)))))

(deftest doseq-while-stops-the-loop
  (let [acc (atom [])]
    (doseq [x [1 2 3 1 2] :while (< x 3)] (swap! acc conj x))
    (is (= [1 2] @acc)))
  (let [acc (atom [])]
    (doseq [x [1 2] y [1 5 1] :while (< y 3)] (swap! acc conj [x y]))
    (is (= [[1 1] [2 1]] @acc))))
