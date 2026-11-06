;; clojure.string functions not yet available on the AS backend, plus regex forms.
;; targets: js
(ns kiso.string-extra-test
  (:require [clojure.test :refer [deftest is]]
            [clojure.string :as str]))

(deftest replace-forms
  (is (= "abcNdefN" (str/replace "abc123def456" #"\d+" "N")))
  (is (= "hi hello" (str/replace-first "hello hello" "hello" "hi")))
  (is (= "abcNdef456" (str/replace-first "abc123def456" #"\d+" "N"))))

(deftest split-forms
  (is (= ["a" "b" "c"] (str/split "a,b,c" #",")))
  (is (= ["a" "b" "c"] (str/split "a--b--c" #"--")))
  (is (= ["a" "b,c,d"] (str/split "a,b,c,d" #"," 2)))
  (is (= [""] (str/split "" #",")))
)
