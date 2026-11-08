(ns kiso.watch-test
  (:require [clojure.test :refer [deftest is]]))

(deftest add-and-remove-watch
  (let [a (atom 0)
        log (atom [])]
    (is (identical? a (add-watch a :k (fn [k r o n] (swap! log conj [k o n])))))
    (reset! a 1)
    (swap! a inc)
    (is (= [[:k 0 1] [:k 1 2]] @log))
    (is (identical? a (remove-watch a :k)))
    (reset! a 5)
    (is (= 2 (count @log)))))

(deftest watch-with-multiple-keys-and-replace
  (let [a (atom 0)
        log (atom [])]
    (add-watch a :x (fn [_ _ o n] (swap! log conj [:x o n])))
    (add-watch a :y (fn [_ _ o n] (swap! log conj [:y o n])))
    (add-watch a :x (fn [_ _ o n] (swap! log conj [:x2 o n])))
    (reset! a 1)
    (is (= [[:x2 0 1] [:y 0 1]] (sort-by first @log)))
    (remove-watch a :x)
    (reset! log [])
    (swap! a + 10)
    (is (= [[:y 1 11]] @log))))
