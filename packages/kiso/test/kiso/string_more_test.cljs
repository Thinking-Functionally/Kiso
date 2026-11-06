;; clojure.string extras and char fns (both backends).
(ns kiso.string-more-test
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


(deftest split-lines
  (is (= ["a" "b" "c"] (str/split-lines "a\nb\nc")))
  (is (= ["a" "b" "c"] (str/split-lines "a\r\nb\r\nc"))))

(deftest char-fns
  (is (= "a" (char 97)))
  (is (= "a" (char "a")))
  (is (char? "a"))
  (is (not (char? "ab")))
  (is (not (char? 1)))
  (is (= 97 (int "a")))
  (is (= 3 (short 3))))
