;; clojure.core function behaviour (ported from test/runtime/core.test.ts).
(ns kiso.core-fns-test
  (:require [clojure.test :refer [deftest is]]))

(deftest arithmetic
  (is (= [0 5 3 6] [(+) (+ 5) (+ 1 2) (+ 1 2 3)]))
  (is (= [-5 7 5] [(- 5) (- 10 3) (- 10 3 2)]))
  (is (= [1 5 6] [(*) (* 5) (* 2 3)]))
  (is (= [5 3.5] [(/ 10 2) (/ 7 2)]))
  (is (= [1 4] [(mod 10 3) (mod -1 5)]))
  (is (= [1 -1] [(rem 10 3) (rem -10 3)]))
  (is (= [3 -3] [(quot 10 3) (quot -10 3)]))
  (is (= [2 0] [(inc 1) (dec 1)])))

(deftest comparison
  (is (true? (< 1 2)))
  (is (false? (< 2 1)))
  (is (true? (> 2 1)))
  (is (true? (<= 1 1)))
  (is (true? (>= 1 1)))
  (is (true? (= 1 1)))
  (is (false? (= 1 2)))
  (is (true? (= nil nil)))
  (is (true? (not= 1 2)))
  (is (true? (== 1.0 1)))
  (is (= [-1 1 0 -1] [(compare 1 2) (compare 2 1) (compare 1 1) (compare "a" "b")])))

(deftest str-function
  (is (= "" (str)))
  (is (= "hello" (str "hello")))
  (is (= "123" (str 1 2 3)))
  (is (= "ab" (str "a" nil "b"))))

(deftest count-conj-get-assoc
  (is (= [0 3 2 5] [(count nil) (count (list 1 2 3)) (count [1 2]) (count "hello")]))
  (is (= [1 2 3] (conj [1 2] 3)))
  (is (= '(1 2 3) (conj (list 2 3) 1)))
  (is (= [1 nil :d] [(get {:a 1} :a) (get {:a 1} :z) (get {:a 1} :z :d)]))
  (is (= [20 nil] [(get [10 20 30] 1) (get [10] 5)]))
  (is (= 2 (get (assoc {:a 1} :b 2) :b)))
  (is (= [1 99 3] (assoc [1 2 3] 1 99)))
  (is (= {:b 2} (dissoc {:a 1 :b 2} :a))))

(deftest higher-order
  (is (= [2 4 6] (map #(* % 2) [1 2 3])))
  (is (= [3 4] (filter #(> % 2) [1 2 3 4])))
  (is (= [:a :c] (filter #{:a :c} [:a :b :c :d])))
  (is (= [6 6] [(reduce + 0 [1 2 3]) (reduce + [1 2 3])]))
  (is (= 6 (apply + [1 2 3])))
  (is (= [42 nil] [(identity 42) (identity nil)]))
  (is (= [42 42] (let [f (constantly 42)] [(f) (f 1 2 3)])))
  (is (= 7 ((comp inc #(* % 2)) 3)))
  (is (= 8 ((partial + 5) 3)))
  (is (= [false true] (let [f (complement even?)] [(f 2) (f 3)])))
  (is (= [6 4] ((juxt inc dec) 5)))
  (is (= [6 1] [((fnil inc 0) 5) ((fnil inc 0) nil)])))

(deftest nested-map-operations
  (is (= 42 (get-in {:a {:b 42}} [:a :b])))
  (is (nil? (get-in {:a 1} [:x :y])))
  (is (= :default (get-in {:a 1} [:x] :default)))
  (is (= {:a 1} (get-in {:a 1} [])))
  (is (= 42 (get-in (assoc-in {:a {:b 1}} [:a :b] 42) [:a :b])))
  (is (= 42 (get-in (assoc-in {} [:a :b] 42) [:a :b])))
  (is (= 2 (:a (update {:a 1} :a inc))))
  (is (= 11 (:a (update {:a 1} :a + 10))))
  (is (= 2 (get-in (update-in {:a {:b 1}} [:a :b] inc) [:a :b]))))

(deftest numeric-functions
  (is (= [3 5] [(max 1 3 2) (max 5)]))
  (is (= [1 5] [(min 3 1 2) (min 5)])))

(deftest seq-slicing
  (is (= [1 2] (take 2 [1 2 3 4])))
  (is (= [3 4] (drop 2 [1 2 3 4])))
  (is (= [1 2] (take-while #(< % 3) [1 2 3 4])))
  (is (= [3 4] (drop-while #(< % 3) [1 2 3 4])))
  (is (true? (some #(> % 2) [1 2 3])))
  (is (nil? (some #(> % 5) [1 2 3])))
  (is (true? (every? #(> % 0) [1 2 3])))
  (is (false? (every? #(> % 1) [1 2 3])))
  (is (= [3 4] (take-last 2 [1 2 3 4])))
  (is (= [0 2 4] (take-nth 2 [0 1 2 3 4 5])))
  (is (= [1 2] (drop-last 2 [1 2 3 4]))))

(deftest sorting-and-reversing
  (is (= [1 2 3] (sort [3 1 2])))
  (is (= [3 2 1] (sort > [3 1 2])))
  (is (= 1 (:n (first (sort-by :n [{:n 3} {:n 1}])))))
  (is (= [3 2 1] (reverse [1 2 3]))))

(deftest ranges-and-repeats
  (is (= [0 1 2 3 4] (range 5)))
  (is (= [2 3 4] (range 2 5)))
  (is (= [0 3 6 9] (range 0 10 3)))
  (is (= ["x" "x" "x"] (repeat 3 "x")))
  (let [i (atom 0)]
    (is (= [1 2 3] (doall (repeatedly 3 #(swap! i inc)))))))

(deftest grouping
  (is (= {true [2 4] false [1 3]} (group-by even? [1 2 3 4])))
  (is (= {"a" 3 "b" 2 "c" 1} (frequencies ["a" "b" "a" "c" "b" "a"]))))

(deftest subvec-and-emptiness
  (is (= [2 3 4] (subvec [1 2 3 4 5] 1 4)))
  (is (= [2 3] (subvec [1 2 3] 1)))
  (is (= [1] (not-empty [1])))
  (is (nil? (not-empty [])))
  (is (nil? (not-empty nil)))
  (is (= 0 (count (empty [1 2]))))
  (is (= 3 (count (set [1 2 2 3])))))

(deftest sequence-transforms
  (is (= [1 10 2 20 3 30] (mapcat (fn [x] [x (* x 10)]) [1 2 3])))
  (is (= ["0:a" "1:b" "2:c"] (map-indexed (fn [i v] (str i ":" v)) ["a" "b" "c"])))
  (is (= [1 3] (remove even? [1 2 3 4])))
  (is (= [30 40] (keep #(when (> % 2) (* % 10)) [1 2 3 4])))
  (is (= [1 2 3 4] (flatten [1 [2 [3]] 4])))
  (is (= [1 2 3] (distinct [1 2 1 3 2])))
  (is (= [1 2 3 1] (dedupe [1 1 2 2 3 1])))
  (is (= [1 "a" 2 "b" 3 "c"] (interleave [1 2 3] ["a" "b" "c"])))
  (is (= [1 "," 2 "," 3] (interpose "," [1 2 3])))
  (is (= ["1:b" "2:c"] (keep-indexed (fn [i v] (when (> i 0) (str i ":" v))) ["a" "b" "c"])))
  (is (= [0 1 3 6] (reductions + 0 [1 2 3]))))

(deftest partitioning
  (is (= [[1 2] [3 4]] (partition 2 [1 2 3 4 5])))
  (is (= [[1 2] [3 4] [5]] (partition-all 2 [1 2 3 4 5])))
  (is (= [[1 1] [2 2] [3]] (partition-by even? [1 1 2 2 3]))))

(deftest infinite-sequences
  (is (= [0 1 2 3 4] (take 5 (iterate inc 0))))
  (is (= [1 2 3 1 2 3] (take 6 (cycle [1 2 3])))))
