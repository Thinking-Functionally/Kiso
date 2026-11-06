;; clojure.string behaviour (ported from test/runtime/string.test.ts).
(ns kiso.string-test
  (:require [clojure.test :refer [deftest is]]
            [clojure.string :as str]))

(deftest blank
  (is (true? (str/blank? nil)))
  (is (true? (str/blank? "")))
  (is (true? (str/blank? "  \t\n  ")))
  (is (false? (str/blank? "hello")))
  (is (false? (str/blank? "  x  "))))

(deftest case-conversion
  (is (= "hello" (str/lower-case "HELLO")))
  (is (= "hello world" (str/lower-case "HeLLo WoRLd")))
  (is (= "HELLO" (str/upper-case "hello"))))

(deftest prefix-suffix-includes
  (is (true? (str/ends-with? "hello world" "world")))
  (is (false? (str/ends-with? "hello world" "hello")))
  (is (true? (str/ends-with? "hello" "")))
  (is (true? (str/starts-with? "hello world" "hello")))
  (is (false? (str/starts-with? "hello world" "world")))
  (is (true? (str/includes? "hello world" "lo wo")))
  (is (false? (str/includes? "hello" "xyz"))))

(deftest join
  (is (= "a, b, c" (str/join ", " ["a" "b" "c"])))
  (is (= "abc" (str/join ["a" "b" "c"])))
  (is (= "" (str/join ", " [])))
  (is (= "1-2-3" (str/join "-" [1 2 3]))))

(deftest replace-all
  (is (= "hi world hi" (str/replace "hello world hello" "hello" "hi")))
  (is (= "hello" (str/replace "hello" "xyz" "abc"))))

(deftest reverse-string
  (is (= "olleh" (str/reverse "hello")))
  (is (= "" (str/reverse "")))
  (is (= "a" (str/reverse "a"))))

(deftest trimming
  (is (= "hello" (str/trim "  hello  ")))
  (is (= "hello" (str/trim "\t\nhello\t\n"))))
