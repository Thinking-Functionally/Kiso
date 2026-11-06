;; clojure.set (ported from test/runtime/set.test.ts).
(ns kiso.set-ops-test
  (:require [clojure.test :refer [deftest is]]
            [clojure.set :as set]))

(deftest union-test
  (is (= #{1 2 3} (set/union #{1 2} #{2 3})))
  (is (= #{} (set/union)))
  (is (= #{1 2} (set/union #{1 2}))))

(deftest intersection-test
  (is (= #{2 3} (set/intersection #{1 2 3} #{2 3 4})))
  (is (= #{} (set/intersection #{1 2} #{3 4}))))

(deftest difference-test
  (is (= #{1} (set/difference #{1 2 3} #{2 3 4})))
  (is (= #{1 2} (set/difference #{1 2}))))

(deftest select-test
  (is (= #{3 4} (set/select #(> % 2) #{1 2 3 4}))))

(deftest subset-superset
  (is (true? (set/subset? #{1 2} #{1 2 3})))
  (is (false? (set/subset? #{1 4} #{1 2 3})))
  (is (true? (set/superset? #{1 2 3} #{1 2})))
  (is (false? (set/superset? #{1 2} #{1 2 3}))))

(deftest rename-and-invert
  (is (= {:x 1 :b 2} (set/rename-keys {:a 1 :b 2} {:a :x})))
  (is (= {1 :a 2 :b} (set/map-invert {:a 1 :b 2}))))

(deftest relational-ops
  (is (= 2 (count (set/project #{{:a 1 :b 2} {:a 3 :b 4}} [:a]))))
  (is (= #{{:x 1 :b 2}} (set/rename #{{:a 1 :b 2}} {:a :x})))
  (is (= {{:a 1} #{{:a 1 :b 2} {:a 1 :b 3}} {:a 2} #{{:a 2 :b 4}}}
         (set/index #{{:a 1 :b 2} {:a 1 :b 3} {:a 2 :b 4}} [:a]))))
