;; targets: js
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
