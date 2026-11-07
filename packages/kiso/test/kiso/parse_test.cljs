;; parse-long / parse-double follow ClojureScript: nil for anything that is not a number literal.
(ns kiso.parse-test
  (:require [clojure.test :refer [deftest is]]))

(deftest parse-long-valid
  (is (= 42 (parse-long "42")))
  (is (= -7 (parse-long "-7")))
  (is (= 5 (parse-long "+5")))
  (is (= 0 (parse-long "0")))
  (is (= 12 (parse-long "0012"))))

(deftest parse-long-invalid
  (is (nil? (parse-long "")))
  (is (nil? (parse-long "abc")))
  (is (nil? (parse-long "1.5")))
  (is (nil? (parse-long "12x")))
  (is (nil? (parse-long " 1")))
  (is (nil? (parse-long "-")))
  (is (nil? (parse-long "1e3"))))

(deftest parse-double-valid
  (is (= 1.5 (parse-double "1.5")))
  (is (= -2.0 (parse-double "-2")))
  (is (= 1000.0 (parse-double "1e3")))
  (is (= 0.5 (parse-double ".5")))
  (is (= 3.0 (parse-double "3."))))

(deftest parse-double-invalid
  (is (nil? (parse-double "")))
  (is (nil? (parse-double "x")))
  (is (nil? (parse-double "1.2.3")))
  (is (nil? (parse-double "1,5"))))

(deftest parse-in-pipelines
  (is (= [1 2 3] (mapv parse-long ["1" "2" "3"])))
  (is (= 6 (reduce + (keep parse-long ["1" "x" "2" "3"])))))
