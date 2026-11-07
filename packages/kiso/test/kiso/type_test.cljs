;; targets: as
(ns kiso.type-test
  (:require [clojure.test :refer [deftest is]]))

(defrecord Pt [x y])

(deftest type-of-values
  (is (nil? (type nil)))
  (is (= (type 1) (type 2.5)))
  (is (not= (type 1) (type "1")))
  (is (= (type [1]) (type [])))
  (is (not= (type [1]) (type '(1))))
  (is (= (type {:a 1}) (type {})))
  (is (= (type :a) (type :b)))
  (is (= (type (->Pt 1 2)) (type (->Pt 3 4))))
  (is (not= (type (->Pt 1 2)) (type {:x 1})))
  (is (= "Number" (name (type 1))))
  (is (= "Pt" (name (type (->Pt 1 2))))))
