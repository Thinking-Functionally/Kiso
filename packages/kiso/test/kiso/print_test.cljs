;; Print functions captured with with-out-str (ported from print-format tests).
(ns kiso.print-test
  (:require [clojure.test :refer [deftest is]]))

(deftest println-output
  (is (= "hello world\n" (with-out-str (println "hello" "world"))))
  (is (= "\n" (with-out-str (println))))
  (is (= "1 2 3\n" (with-out-str (println 1 2 3))))
  (is (= "nil\n" (with-out-str (println nil))))
  (is (= "[1 nil a]\n" (with-out-str (println [1 nil "a"])))))

(deftest print-output
  (is (= "hello" (with-out-str (print "hello"))))
  (is (= "a b" (with-out-str (print "a" "b")))))

(deftest prn-and-pr-output
  (is (= "\"hello\"\n" (with-out-str (prn "hello"))))
  (is (= "\"hello\"" (with-out-str (pr "hello"))))
  (is (= ":a 1\n" (with-out-str (prn :a 1))))
  (is (= "{:a 1}\n" (with-out-str (prn {:a 1})))))

(deftest nested-capture
  (let [inner (atom nil)
        outer (with-out-str (println "outer") (reset! inner (with-out-str (println "inner"))))]
    (is (= "outer\n" outer))
    (is (= "inner\n" @inner)))
  (is (= "ab" (with-out-str (print "a") (print "b")))))
