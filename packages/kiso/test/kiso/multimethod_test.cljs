;; defmulti / defmethod behaviour (ported from test/e2e/defmulti.test.ts). AS has no defmulti yet.
;; targets: js
(ns kiso.multimethod-test
  (:require [clojure.test :refer [deftest is]]))

(defmulti greeting :language)
(defmethod greeting :en [m] "Hello")
(defmethod greeting :jp [m] "konnichiwa")
(defmethod greeting :default [m] "???")

(defmulti area (fn [shape] (get shape :type)))
(defmethod area :square [s] (* (get s :side) (get s :side)))
(defmethod area :rect [s] (* (get s :width) (get s :height)))

(defmulti combine (fn [a b] [(get a :type) (get b :type)]))
(defmethod combine [:a :b] [a b] "a+b")
(defmethod combine :default [a b] "other")

(deftest dispatch-on-keyword
  (is (= "Hello" (greeting {:language :en})))
  (is (= "konnichiwa" (greeting {:language :jp}))))

(deftest default-method
  (is (= "???" (greeting {:language :fr}))))

(deftest dispatch-on-function
  (is (= 12 (area {:type :rect :width 3 :height 4})))
  (is (= 9 (area {:type :square :side 3}))))

(deftest multi-arg-dispatch
  (is (= "a+b" (combine {:type :a} {:type :b})))
  (is (= "other" (combine {:type :b} {:type :a}))))
