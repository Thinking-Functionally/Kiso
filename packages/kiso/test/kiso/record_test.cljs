;; defrecord + defprotocol behaviour: field access, protocol dispatch, equality, assoc.
(ns kiso.record-test
  (:require [clojure.test :refer [deftest is]]))

(defprotocol Shape (perimeter [s]) (label [s]))
(defrecord Sq [side]
  Shape
  (perimeter [_] (* 4 side))
  (label [_] "sq"))

(deftest record-with-protocol
  (let [s (->Sq 5)]
    (is (= 20 (perimeter s)))
    (is (= "sq" (label s)))
    (is (= 5 (:side s)))
    (is (= s (->Sq 5)))
    (is (= 6 (:side (assoc s :side 6))))))
