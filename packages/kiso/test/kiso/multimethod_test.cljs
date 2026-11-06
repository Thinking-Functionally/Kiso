;; defmulti / defmethod behaviour (ported from test/e2e/defmulti.test.ts).
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

(defmulti redefined :k)
(defmethod redefined :a [m] 1)
(defmethod redefined :a [m] 2)

(deftest later-defmethod-replaces
  (is (= 2 (redefined {:k :a}))))

(defmulti kind (fn [x] (if (number? x) :num :other)))
(defmethod kind :num [x] (inc x))
(defmethod kind :default [x] x)

(deftest used-as-a-value
  (is (= [2 3] (mapv kind [1 2])))
  (is (= :z (kind :z))))
