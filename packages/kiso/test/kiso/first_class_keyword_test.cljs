;; targets: js
(ns kiso.first-class-keyword-test
  (:require [clojure.test :refer [deftest is]]))

(deftest keyword-as-value
  (is (= [:a :b] (vec (map keyword ["a" "b"])))))
