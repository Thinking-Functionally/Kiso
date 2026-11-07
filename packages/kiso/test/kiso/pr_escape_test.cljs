(ns kiso.pr-escape-test
  (:require [clojure.test :refer [deftest is]]
            [clojure.string :as str]))

(deftest pr-str-escapes
  (is (= "\"a\\tb\\r\\n\\\"q\\\"\\\\\"" (pr-str "a\tb\r\n\"q\"\\")))
  (is (= "[\"\\t\"]" (pr-str ["\t"]))))

(deftest split-when-everything-matches
  (is (= [] (str/split "ababab" #"(?:ab)+")))
  (is (= [""] (str/split "" #",")))
  (is (= ["a" "b"] (str/split "a,b,," #","))))
