;; Lazy seqs, sort and `for` (ported from test/codegen-as/lazy.test.ts; now also run on the JS backend).
(ns kiso.lazy-seq-test
  (:require [clojure.test :refer [deftest is]]))

(defn fibs [a b] (lazy-seq (cons a (fibs b (+ a b)))))

(deftest infinite-sources
  (is (= 15 (reduce + 0 (take 5 (iterate inc 1)))))
  (is (= 100 (first (drop 100 (range)))))
  (is (= 7 (count (take 7 (cycle [1 2 3])))))
  (is (= 12 (reduce + 0 (take 3 (repeat 4)))))
  (is (= 88 (reduce + 0 (take 10 (fibs 0 1))))))

(deftest lazy-pipelines
  (is (= 12 (reduce + 0 (take 3 (filter even? (map inc (range)))))))
  (is (= 5 (count (take-while #(< % 5) (range)))))
  (is (= 5 (first (drop-while #(< % 5) (range)))))
  (is (= 6 (count (mapcat (fn [x] [x x]) [1 2 3]))))
  (is (= 4 (some #(when (> % 3) %) (range)))))

(deftest lazy-seqs-are-realized-once
  (let [n (atom 0)
        s (map (fn [x] (swap! n inc) x) [1 2])]
    (doall s)
    (doall s)
    (is (= 2 @n))
    (is (= 2 (count s)))))

(deftest rest-next-and-equality
  (is (= 3 (first (rest (map inc [1 2 3])))))
  (is (nil? (next (map inc [1]))))
  (is (= [2 3] (map inc [1 2])))
  (is (= (map inc [1]) (list 2))))

(deftest sorting
  (is (= 1 (first (sort [3 1 2]))))
  (is (= 3 (first (sort > [3 1 2]))))
  (is (= {:a 1} (first (sort-by :a [{:a 2} {:a 1}]))))
  (is (= '(:b :a :c) (map first (sort-by second [[:a 1] [:b 0] [:c 1]]))))
  (is (= -1 (compare 1 2)))
  (is (= 1 (compare "b" "a"))))

(deftest for-comprehensions
  (is (= 3 (count (for [x [1 2 3] y [1 2 3] :when (< x y)] [x y]))))
  (is (= 20 (reduce + 0 (for [x (range 5) :let [y (* x x)] :when (even? x)] y))))
  (is (= 4 (count (for [x (range) :while (< x 4)] x))))
  (is (= '(2 4) (for [x [1 2]] (* x 2)))))

(deftest lazy-seq-edge-cases
  (let [realized (atom false)
        ls (lazy-seq (reset! realized true) [1 2 3])]
    (is (false? @realized))
    (is (= 1 (first ls)))
    (is (true? @realized)))
  (is (= 20 (first (rest (lazy-seq [10 20 30])))))
  (is (= 20 (first (next (lazy-seq [10 20 30])))))
  (is (nil? (first (lazy-seq []))))
  (is (nil? (first (lazy-seq nil))))
  (is (nil? (seq (lazy-seq nil))))
  (is (= [1 2 3] (lazy-seq (lazy-seq [1 2 3])))))
