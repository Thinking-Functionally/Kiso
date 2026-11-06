;; clojure.string functions not yet available on the AS backend, plus regex forms.
;; targets: js
(ns kiso.string-extra-test
  (:require [clojure.test :refer [deftest is]]
            [clojure.string :as str]))

(deftest capitalize
  (is (= "Hello" (str/capitalize "hello")))
  (is (= "Hello" (str/capitalize "Hello")))
  (is (= "Hello" (str/capitalize "HELLO")))
  (is (= "" (str/capitalize "")))
  (is (= "A" (str/capitalize "a"))))

(deftest index-of
  (is (= 1 (str/index-of "abcabc" "b")))
  (is (= 4 (str/index-of "abcabc" "b" 2)))
  (is (nil? (str/index-of "abc" "z")))
  (is (= 4 (str/last-index-of "abcabc" "b")))
  (is (nil? (str/last-index-of "abc" "z"))))

(deftest replace-forms
  (is (= "abcNdefN" (str/replace "abc123def456" #"\d+" "N")))
  (is (= "hi hello" (str/replace-first "hello hello" "hello" "hi")))
  (is (= "abcNdef456" (str/replace-first "abc123def456" #"\d+" "N"))))

(deftest split-forms
  (is (= ["a" "b" "c"] (str/split "a,b,c" #",")))
  (is (= ["a" "b" "c"] (str/split "a--b--c" #"--")))
  (is (= ["a" "b,c,d"] (str/split "a,b,c,d" #"," 2)))
  (is (= [""] (str/split "" #",")))
  (is (= ["a" "b" "c"] (str/split-lines "a\nb\nc")))
  (is (= ["a" "b" "c"] (str/split-lines "a\r\nb\r\nc"))))

(deftest trim-variants
  (is (= "hello  " (str/triml "  hello  ")))
  (is (= "  hello" (str/trimr "  hello  ")))
  (is (= "hello" (str/trim-newline "hello\n\n")))
  (is (= "hello" (str/trim-newline "hello\r\n")))
  (is (= "\nhello" (str/trim-newline "\nhello")))
  (is (= "hello  " (str/trim-newline "hello  "))))

(deftest escape
  (is (= "&lt;div&gt;A &amp; B&lt;/div&gt;" (str/escape "<div>A & B</div>" {\< "&lt;" \> "&gt;" \& "&amp;"})))
  (is (= "hello" (str/escape "hello" {\x "y"}))))
