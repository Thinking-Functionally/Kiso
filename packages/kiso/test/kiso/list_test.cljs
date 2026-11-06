;; Persistent list behaviour (ported from test/runtime/list.test.ts; identity checks stay in TS).
(ns kiso.list-test
  (:require [clojure.test :refer [deftest is]]))

(deftest empty-list
  (is (= 0 (count (list))))
  (is (nil? (first (list))))
  (is (= 0 (count (rest (list)))))
  (is (list? (list))))

(deftest creation-and-order
  (let [l (list 1 2 3)]
    (is (= 3 (count l)))
    (is (= [1 2 3] [(first l) (first (rest l)) (first (rest (rest l)))])))
  (let [l (list 1 "hello" nil true)]
    (is (= 1 (first l)))
    (is (= "hello" (first (rest l))))
    (is (nil? (first (rest (rest l)))))
    (is (true? (first (rest (rest (rest l))))))))

(deftest cons-prepends
  (let [l (cons 42 (list))]
    (is (= 1 (count l)))
    (is (= 42 (first l))))
  (let [l (cons 0 (list 1 2))]
    (is (= 3 (count l)))
    (is (= [0 1] [(first l) (first (rest l))])))
  (let [l (cons 1 (cons 2 (cons 3 (list))))]
    (is (= 3 (count l)))
    (is (= 1 (first l)))))

(deftest rest-and-count
  (let [r (rest (list 1 2 3))]
    (is (= 2 (count r)))
    (is (= 2 (first r))))
  (is (= 0 (count (rest (list 1)))))
  (is (= [0 1 5] [(count (list)) (count (list 1)) (count (list 1 2 3 4 5))])))

(deftest list-predicate
  (is (list? (list 1 2)))
  (is (not (list? nil)))
  (is (not (list? 42)))
  (is (not (list? [1 2])))
  (is (not (list? "hello"))))
