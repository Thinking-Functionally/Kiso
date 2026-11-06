(ns kiso.case-test
  (:require [clojure.test :refer [deftest is]]))

(defn kind [x]
  (case x
    1 :one
    2 :two
    :a :kw
    "s" :str))

(deftest case-without-default
  (is (= :one (kind 1)))
  (is (= :two (kind 2)))
  (is (= :kw (kind :a)))
  (is (= :str (kind "s"))))

(deftest case-with-default
  (is (= :other (case 9 1 :one :other)))
  (is (= :grouped (case 3 (1 2 3) :grouped :no))))
