(ns kiso.large-test
  (:require [clojure.test :refer [deftest is]]))

(deftest large-ranges
  (is (= 300000 (count (range 300000))))
  (is (= 22500000000 (reduce + (map inc (filter even? (range 300000))))))
  (is (= 299999 (last (range 300000)))))

(deftest large-strings
  (is (= 238890 (count (apply str (map str (range 50000))))))
  (is (= 168891 (count (pr-str (vec (range 30000))))))
  (is (= 49999 (count (clojure.string/join "," (repeat 25000 "x"))))))
