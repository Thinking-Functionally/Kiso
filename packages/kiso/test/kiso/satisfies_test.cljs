;; satisfies? and instance? on both backends (AS resolves them at compile time).
(ns kiso.satisfies-test
  (:require [clojure.test :refer [deftest is]]))

(defprotocol Shape (area [s]))
(defprotocol Named (nm [s]))
(defprotocol Unused (nothing [s]))

(defrecord Sq [side] Shape (area [_] (* side side)))
(deftype Circ [r] Shape (area [_] (* 3 r r)))
(extend-type nil Named (nm [_] "nil"))
(extend-type String Named (nm [s] s))

(deftest satisfies-user-types
  (is (true? (satisfies? Shape (->Sq 2))))
  (is (true? (satisfies? Shape (Circ. 1))))
  (is (false? (satisfies? Shape 5)))
  (is (false? (satisfies? Shape nil)))
  (is (false? (satisfies? Unused (->Sq 2)))))

(deftest satisfies-extended
  (is (true? (satisfies? Named "x")))
  (is (true? (satisfies? Named nil)))
  (is (false? (satisfies? Named 1))))

(deftest satisfies-reify
  (is (true? (satisfies? Shape (reify Shape (area [_] 1)))))
  (is (false? (satisfies? Named (reify Shape (area [_] 1))))))

(deftest satisfies-in-conditionals
  (is (= :yes (if (satisfies? Shape (->Sq 1)) :yes :no)))
  (is (= [true false] (mapv #(satisfies? Shape %) [(->Sq 1) 2]))))

(deftest instance-checks
  (is (true? (instance? Sq (->Sq 1))))
  (is (false? (instance? Sq (Circ. 1))))
  (is (true? (instance? Circ (Circ. 1))))
  (is (false? (instance? Sq nil))))

(defprotocol Quacks (quack [this]))
(deftype Duck [] Quacks (quack [this] "quack"))
(extend-type String Quacks (quack [this] "str-quack"))

(deftest implements-is-inline-only
  (is (true? (implements? Quacks (->Duck))))
  (is (false? (implements? Quacks "s")))
  (is (true? (satisfies? Quacks "s")))
  (is (false? (implements? Quacks nil))))
