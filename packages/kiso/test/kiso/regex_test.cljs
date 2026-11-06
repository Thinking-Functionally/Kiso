;; Regex behaviour and the regex forms of clojure.string; run on both backends so the AS engine (D49)
;; stays in step with JS RegExp semantics.
(ns kiso.regex-test
  (:require [clojure.test :refer [deftest is]]
            [clojure.string :as str]))

(deftest re-find-basic
  (is (= "123" (re-find #"\d+" "abc123def")))
  (is (nil? (re-find #"\d+" "abc")))
  (is (= "" (re-find #"x*" "abc")))
  (is (= ["ab1" "ab" "1"] (re-find #"([a-z]+)(\d)" "ab1")))
  (is (= ["a" "a" nil] (re-find #"(a)|(b)" "a")))
  (is (= ["b" nil "b"] (re-find #"(a)|(b)" "b"))))

(deftest re-matches-full
  (is (= "abc" (re-matches #"[a-c]+" "abc")))
  (is (nil? (re-matches #"[a-c]+" "abcd")))
  (is (= ["2024-01" "2024" "01"] (re-matches #"(\d{4})-(\d{2})" "2024-01")))
  (is (= "ab" (re-matches #"a|ab" "ab"))))

(deftest re-seq-all
  (is (= ["1" "22" "333"] (vec (re-seq #"\d+" "a1b22c333"))))
  (is (nil? (re-seq #"\d+" "abc")))
  (is (= [["a1" "a" "1"] ["b2" "b" "2"]] (vec (re-seq #"([a-z])(\d)" "a1 b2")))))

(deftest classes-and-escapes
  (is (= "foo_bar" (re-find #"\w+" "foo_bar baz")))
  (is (= "  " (re-find #"\s+" "a  b")))
  (is (= "abc" (re-find #"[^\d\s]+" "abc 123")))
  (is (= "-" (re-find #"[a\-z]" "x-y")))
  (is (= "tab\t" (re-find #"tab\t" "tab\t")))
  (is (= "a.b" (re-find #"a\.b" "a.b")))
  (is (nil? (re-find #"a\.b" "axb"))))

(deftest quantifiers
  (is (= "aaa" (re-find #"a{3}" "aaaa")))
  (is (= "aaaa" (re-find #"a{2,}" "aaaa")))
  (is (= "aa" (re-find #"a{1,2}" "aaaa")))
  (is (= "a" (re-find #"a+?" "aaaa")))
  (is (= "<a>" (re-find #"<.+?>" "<a><b>")))
  (is (= "<a><b>" (re-find #"<.+>" "<a><b>")))
  (is (= "" (re-find #"a??" "a"))))

(deftest anchors-and-boundaries
  (is (= "abc" (re-find #"^abc" "abcdef")))
  (is (nil? (re-find #"^bc" "abcdef")))
  (is (= "def" (re-find #"def$" "abcdef")))
  (is (= "cat" (re-find #"\bcat\b" "a cat sat")))
  (is (nil? (re-find #"\bcat\b" "concat")))
  (is (= "cat" (re-find #"\Bcat" "concat"))))

(deftest groups-and-alternation
  (is (= ["abab" "ab"] (re-find #"(ab)+" "abab")))
  (is (= ["ababab" "ab"] (re-find #"(?:ab)+(ab)" "ababab")))
  (is (= "dog" (re-find #"cat|dog|bird" "hotdog")))
  (is (= ["xy" "y"] (re-find #"x(y|z)" "xy"))))

(deftest nested-and-empty-loops
  (is (= ["" nil] (re-find #"(a*)*b?" "")))
  (is (= ["aaab" "aaa"] (re-find #"(a*)*b" "aaab"))))

(deftest replace-regex
  (is (= "abcNdefN" (str/replace "abc123def456" #"\d+" "N")))
  (is (= "a-b-c" (str/replace "a b c" #"\s" "-")))
  (is (= "[1][2]" (str/replace "12" #"(\d)" "[$1]")))
  (is (= "x$y" (str/replace "xay" #"a" "$$")))
  (is (= "<a>" (str/replace "a" #"a" "<$&>")))
  (is (= "-a-b-" (str/replace "ab" #"" "-")))
  (is (= "A1B2" (str/replace "a1b2" #"[a-z]" (fn [m] (str/upper-case m)))))
  (is (= "hi hello" (str/replace-first "hello hello" "hello" "hi")))
  (is (= "abcNdef456" (str/replace-first "abc123def456" #"\d+" "N"))))

(deftest split-regex
  (is (= ["a" "b" "c"] (str/split "a,b,c" #",")))
  (is (= ["a" "b" "c"] (str/split "a--b--c" #"--")))
  (is (= ["a" "b" "c"] (str/split "a1b22c" #"\d+")))
  (is (= ["a" "b,c,d"] (str/split "a,b,c,d" #"," 2)))
  (is (= ["a" "b" "c"] (str/split "a,b,c,," #",")))
  (is (= ["" "a"] (str/split ",a" #",")))
  (is (= [""] (str/split "" #",")))
  (is (= ["abc"] (str/split "abc" #",")))
  (is (= ["a" "b" "c"] (str/split "abc" #"")))
  (is (= ["a" "b" "c"] (str/split "a b  c" #"\s+"))))

(deftest re-pattern-and-literal
  (is (= "42" (re-find (re-pattern "\\d+") "x42")))
  (is (= "abc" (re-find (re-pattern "abc") "xabcx")))
  (is (= "#\"a+\"" (pr-str #"a+")))
  (is (true? (regexp? #"a")))
  (is (false? (regexp? "a"))))
