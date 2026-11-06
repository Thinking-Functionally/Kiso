;; clojure.walk (ported from test/runtime/walk.test.ts).
(ns kiso.walk-test
  (:require [clojure.test :refer [deftest is]]
            [clojure.walk :as walk]))

(deftest walk-test
  (is (= [2 3 4] (walk/walk #(if (number? %) (inc %) %) identity [1 2 3])))
  (is (= {:a 1} (walk/walk identity identity {:a 1})))
  (is (= '(2 3 4) (walk/walk inc identity (list 1 2 3))))
  (is (true? (list? (walk/walk inc identity (list 1 2 3)))))
  (is (= #{10 20 30} (walk/walk #(* % 10) identity #{1 2 3}))))

(deftest postwalk-prewalk
  (is (= [11 [12 13]] (walk/postwalk #(if (number? %) (+ % 10) %) [1 [2 3]])))
  (is (= [2 4 6] (walk/prewalk #(if (number? %) (* % 2) %) [1 2 3]))))

(deftest replace-forms
  (is (= ["one" "two" 3] (walk/postwalk-replace {1 "one" 2 "two"} [1 2 3])))
  (is (= ["one" "two" 3] (walk/prewalk-replace {1 "one" 2 "two"} [1 2 3]))))

(deftest key-conversion
  (is (= {:a 1 :b {:c 2}} (walk/keywordize-keys {"a" 1 "b" {"c" 2}})))
  (is (= {"a" 1 "b" {"c" 2}} (walk/stringify-keys {:a 1 :b {:c 2}}))))
