;; Behavioural tests for sequences, equality and hashing (ported from test/codegen/js-semantics.test.ts).
(ns kiso.seq-semantics-test
  (:require [clojure.test :refer [deftest is]]))

(deftest lazy-fns-work-on-infinite-seqs
  (is (= [1 3 5] (vec (take 3 (filter odd? (range))))))
  (is (= [0 1 2] (let [[a b c] (range)] [a b c])))
  (is (= [10 21] (vec (take 2 (map + (range) [10 20 30]))))))

(deftest cons-onto-non-list-collections
  (is (= '(1) (cons 1 [])))
  (is (= 3 (count (cons 1 (rest [1 2 3]))))))

(deftest conj-and-into-on-maps
  (is (= {:a 1} (into {} [[:a 1]])))
  (is (= {:a 1} (conj {} [:a 1]))))

(deftest strings-are-seqable
  (is (= ["a" "b" "c"] (vec "abc"))))

(deftest reductions-and-quoted-collections
  (is (= [1 3 6] (vec (reductions + [1 2 3]))))
  (is (= '#{b c} (set ['c 'b])))
  (is (= '{f 1} (assoc {} 'f 1))))

(deftest sort-with-comparators-and-vector-keys
  (is (= '(3 2 1) (sort > [3 1 2])))
  (is (= '([1 2] [1 9] [2 1]) (sort [[2 1] [1 9] [1 2]]))))

(deftest variadic-comparisons-and-apply
  (is (true? (apply < [1 2 3])))
  (is (= [1] (apply min-key count [[1 2] [1]]))))

(deftest collections-are-structural-hash-keys
  (is (= :a (get {[1 2] :a} [1 2])))
  (is (true? (contains? #{[1 2]} [1 2])))
  (is (= #{[1 2]} (set [[1 2]])))
  (is (= '[a b] (vec (distinct ['a 'b 'a])))))
