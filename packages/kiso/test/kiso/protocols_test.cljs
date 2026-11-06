;; Ported from conformance/protocols.test.ts: deftype, reify, multi-method protocols.
(ns kiso.protocols-test
  (:require [clojure.test :refer [deftest is]]))

(defprotocol IGreet (greet [this]))
(deftype Greeter [name]
  IGreet
  (greet [this] (str "Hello, " name)))

(defprotocol IShape (area [this]) (perimeter [this]))
(deftype Rect [w h]
  IShape
  (area [this] (* w h))
  (perimeter [this] (* 2 (+ w h))))

(defprotocol IFoo (foo [this]))
(defprotocol ICalc (compute [this x y]))

(deftype Point [x y])

(deftest deftype-protocol
  (is (= "Hello, World" (greet (Greeter. "World")))))

(deftest multi-method-protocol
  (let [r (Rect. 3 4)]
    (is (= 12 (area r)))
    (is (= 14 (perimeter r)))))

(deftest reify-inline
  (is (= 42 (foo (reify IFoo (foo [this] 42)))))
  (is (= 30 (compute (reify ICalc (compute [this x y] (+ x y))) 10 20))))

(defprotocol Describe (describe [x]))
(deftype Cat [])
(deftype Dog [])
(extend-protocol Describe
  Cat (describe [x] "cat")
  Dog (describe [x] "dog")
  nil (describe [x] "nothing"))

(deftest extend-protocol-macro
  (is (= "cat" (describe (->Cat))))
  (is (= "dog" (describe (->Dog))))
  (is (= "nothing" (describe nil)))
  (is (true? (satisfies? Describe (->Cat)))))
