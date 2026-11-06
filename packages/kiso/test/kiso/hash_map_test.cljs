;; Persistent map behaviour (ported from test/runtime/hash-map.test.ts).
(ns kiso.hash-map-test
  (:require [clojure.test :refer [deftest is]]))

(defn fill [n f] (loop [m {} i 0] (if (< i n) (recur (assoc m (f i) i) (inc i)) m)))
(defn all-found? [m n f] (loop [i 0] (cond (= i n) true (= (get m (f i)) i) (recur (inc i)) :else false)))

(deftest empty-map
  (is (= 0 (count {})))
  (is (nil? (get {} "anything")))
  (is (map? {}))
  (is (= 0 (count (hash-map)))))

(deftest assoc-and-get
  (let [m (assoc {} "a" 1)]
    (is (= 1 (count m)))
    (is (= 1 (get m "a")))
    (is (nil? (get m "b"))))
  (let [m (-> {} (assoc "a" 1) (assoc "b" 2) (assoc "c" 3))]
    (is (= 3 (count m)))
    (is (= [1 2 3] [(get m "a") (get m "b") (get m "c")])))
  (let [m (-> {} (assoc "a" 1) (assoc "a" 99))]
    (is (= 1 (count m)))
    (is (= 99 (get m "a"))))
  (let [m1 (assoc {} "a" 1) m2 (assoc m1 "b" 2)]
    (is (= 1 (count m1)))
    (is (nil? (get m1 "b")))
    (is (= 2 (count m2)))))

(deftest nil-keys
  (let [m (assoc {} nil "value")]
    (is (= 1 (count m)))
    (is (= "value" (get m nil))))
  (is (= 2 (get (-> {} (assoc nil 1) (assoc nil 2)) nil)))
  (is (= 1 (count (-> {} (assoc nil 1) (assoc nil 2)))))
  (let [m (-> {} (assoc nil "nil") (assoc "a" 1))]
    (is (= 2 (count m)))
    (is (= "nil" (get m nil)))
    (is (= 1 (get m "a")))))

(deftest numeric-and-mixed-keys
  (let [m (-> {} (assoc 1 "one") (assoc 2 "two"))]
    (is (= ["one" "two"] [(get m 1) (get m 2)])))
  (let [m (-> {} (assoc "a" 1) (assoc 42 2) (assoc nil 3))]
    (is (= 3 (count m)))
    (is (= [1 2 3] [(get m "a") (get m 42) (get m nil)]))))

(deftest many-keys
  (is (= 100 (count (fill 100 identity))))
  (is (all-found? (fill 100 identity) 100 identity))
  (is (all-found? (fill 100 (fn [i] (str "key" i))) 100 (fn [i] (str "key" i))))
  (is (= 1000 (count (fill 1000 identity))))
  (is (all-found? (fill 1000 identity) 1000 identity)))

(deftest dissoc-keys
  (let [m (dissoc (assoc (assoc {} "a" 1) "b" 2) "a")]
    (is (= 1 (count m)))
    (is (nil? (get m "a")))
    (is (= 2 (get m "b"))))
  (is (= 1 (count (dissoc (assoc {} "a" 1) "b"))))
  (let [m (dissoc (assoc {} nil "val") nil)]
    (is (= 0 (count m)))
    (is (nil? (get m nil))))
  (is (= 0 (count (dissoc (assoc {} "a" 1) "a"))))
  (let [m1 (assoc (assoc {} "a" 1) "b" 2) m2 (dissoc m1 "a")]
    (is (= 2 (count m1)))
    (is (= 1 (get m1 "a")))
    (is (= 1 (count m2)))))

(deftest contains-key
  (is (true? (contains? (assoc {} "a" 1) "a")))
  (is (false? (contains? {} "a")))
  (is (true? (contains? (assoc {} nil 1) nil))))

(deftest hash-map-constructor
  (let [m (hash-map "a" 1 "b" 2)]
    (is (= 2 (count m)))
    (is (= [1 2] [(get m "a") (get m "b")])))
  (is (= 0 (count (hash-map)))))

(deftest map-predicate
  (is (map? {}))
  (is (map? (assoc {} "a" 1)))
  (is (not (map? nil)))
  (is (not (map? 42))))
