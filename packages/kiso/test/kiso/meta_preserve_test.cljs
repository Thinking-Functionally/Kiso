;; Clojure keeps metadata across conj/assoc/dissoc/disj/pop/update/empty on collections.
(ns kiso.meta-preserve-test
  (:require [clojure.test :refer [deftest is]]))

(def m {:tag :t})

(deftest vector-ops-keep-meta
  (let [v (with-meta [1 2 3] m)]
    (is (= m (meta (conj v 4))))
    (is (= m (meta (assoc v 0 9))))
    (is (= m (meta (pop v))))
    (is (= m (meta (update v 0 inc))))))

(deftest map-ops-keep-meta
  (let [x (with-meta {:a 1 :b 2} m)]
    (is (= m (meta (assoc x :c 3))))
    (is (= m (meta (dissoc x :a))))
    (is (= m (meta (conj x [:z 0]))))
    (is (= m (meta (update x :a inc))))))

(deftest set-ops-keep-meta
  (let [s (with-meta #{1 2} m)]
    (is (= m (meta (conj s 3))))
    (is (= m (meta (disj s 1))))))

(deftest list-ops-keep-meta
  (let [l (with-meta (list 1 2 3) m)]
    (is (= m (meta (conj l 0))))
    (is (= m (meta (pop l))))))

(deftest values-unchanged
  (is (= [1 2 3 4] (conj (with-meta [1 2 3] m) 4)))
  (is (= {:a 1 :c 3} (assoc (dissoc (with-meta {:a 1 :b 2} m) :b) :c 3))))
