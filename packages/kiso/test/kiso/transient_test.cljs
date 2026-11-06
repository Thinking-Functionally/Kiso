;; Transients (ported from test/runtime/transient.test.ts).
(ns kiso.transient-test
  (:require [clojure.test :refer [deftest is]]))

(deftest transient-vector
  (let [v [1 2 3]
        t (transient v)]
    (conj! t 4)
    (conj! t 5)
    (is (= [1 2 3 4 5] (persistent! t)))
    (is (= [1 2 3] v)))
  (let [t (transient [1 2 3])]
    (assoc! t 1 99)
    (is (= [1 99 3] (persistent! t))))
  (let [t (reduce conj! (transient []) (range 100))
        v (persistent! t)]
    (is (= 100 (count v)))
    (is (= [0 99] [(nth v 0) (nth v 99)]))))

(deftest transient-map
  (let [m {"a" 1}
        t (transient m)]
    (assoc! t "b" 2)
    (assoc! t "c" 3)
    (is (= {"a" 1 "b" 2 "c" 3} (persistent! t)))
    (is (= {"a" 1} m)))
  (let [t (transient {"a" 1 "b" 2 "c" 3})]
    (dissoc! t "b")
    (is (= {"a" 1 "c" 3} (persistent! t))))
  (let [m (persistent! (reduce (fn [t i] (assoc! t (str "key" i) i)) (transient {}) (range 50)))]
    (is (= 50 (count m)))
    (is (= [0 49] [(get m "key0") (get m "key49")]))))

(deftest transient-set
  (let [s #{1 2 3}
        t (transient s)]
    (conj! t 4)
    (conj! t 5)
    (is (= #{1 2 3 4 5} (persistent! t)))
    (is (= #{1 2 3} s)))
  (let [t (transient #{1 2 3})]
    (disj! t 2)
    (is (= #{1 3} (persistent! t)))))
