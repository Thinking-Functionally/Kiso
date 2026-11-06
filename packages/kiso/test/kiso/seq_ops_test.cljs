;; Sequence, set and rest-param behaviour (ported from test/codegen-as/seqs.test.ts).
(ns kiso.seq-ops-test
  (:require [clojure.test :refer [deftest is]]))

(defn rest-add [a & xs] (+ a (count xs)))
(defn rest-sum [& xs] (reduce + 0 xs))
(defn rest-self [x & more] (if (seq more) (+ x (apply rest-self more)) x))
(defn rest-id [& xs] xs)

(deftest rest-params
  (is (= [1 3 14] [(rest-add 1) (rest-add 1 2 3) (rest-add 10 1 1 1 1)]))
  (is (= [0 10] [(rest-sum) (rest-sum 1 2 3 4)]))
  (is (= 10 (rest-self 1 2 3 4)))
  (is (nil? (rest-id)))
  (is (= '(1 2) (rest-id 1 2))))

(deftest apply-forms
  (is (= 6 (apply + [1 2 3])))
  (is (= 9 (apply max [3 9 2])))
  (is (= 10 (apply + 1 2 [3 4]))))

(deftest map-filter-remove-range
  (is (= 9 (reduce + 0 (map inc [1 2 3]))))
  (is (= 9 (reduce + 0 (filter odd? [1 2 3 4 5]))))
  (is (= 6 (reduce + 0 (remove odd? [1 2 3 4 5]))))
  (is (= [5 10 18 2 1] [(count (range 5)) (reduce + 0 (range 1 5)) (reduce + 0 (range 0 10 3)) (count (take 2 [1 2 3])) (count (drop 2 [1 2 3]))]))
  (is (= 66 (reduce + 0 (map + [1 2 3] [10 20 30]))))
  (is (= 25 (reduce + 0 (->> (range 10) (filter even?) (map inc))))))

(deftest some-and-every
  (is (true? (some even? [1 3 4])))
  (is (nil? (some even? [1 3])))
  (is (true? (every? odd? [1 3])))
  (is (false? (every? odd? [1 2]))))

(deftest conj-cons-into
  (is (= 2 (count (conj nil 1 2))))
  (is (= 2 (first (conj nil 1 2))))
  (is (= '(0 1 2) (conj (list 1 2) 0)))
  (is (= [1 2 3] (conj [1 2] 3)))
  (is (= '(1) (conj nil 1)))
  (is (= 0 (first (cons 0 [1 2]))))
  (is (= 1 (count (cons 0 nil))))
  (is (= 3 (count (into [] (map inc [1 2 3])))))
  (is (= 2 (count (into #{} [1 1 2])))))

(deftest reverse-concat-quoted-lists
  (is (= 3 (first (reverse [1 2 3]))))
  (is (= 4 (count (concat [1] [2 3] [4]))))
  (is (= 3 (count '(1 2 3))))
  (is (= 4 (first '(4 5)))))

(deftest rest-and-next
  (is (= 2 (first (rest [1 2 3]))))
  (is (= 2 (count (rest [1 2 3]))))
  (is (= 0 (count (rest []))))
  (is (nil? (next [1])))
  (is (= 2 (first (next [1 2])))))

(deftest sets
  (is (= 1 (#{1 2} 1)))
  (is (= :no (get #{1 2} 3 :no)))
  (is (= 3 (count #{1 2 3})))
  (is (true? (contains? #{1 2} 2)))
  (is (false? (contains? #{1 2} 5)))
  (is (= 1 (count (conj #{1} 1))))
  (is (= 2 (count (conj #{1} 2))))
  (is (= 1 (count (disj #{1 2} 1))))
  (is (= #{1 2} #{2 1}))
  (is (not= #{1} #{2})))

(deftest seq-over-maps-and-sets
  (is (= '(:a :b) (map first {:a 1 :b 2})))
  (is (= 3 (count (seq #{1 2 3})))))

(deftest ex-info-carries-message-and-data
  (is (= "x" (ex-message (ex-info "x" {:k 1}))))
  (is (= {:k 1} (ex-data (ex-info "x" {:k 1})))))
