;; clojure.test runner features: use-fixtures (:each / :once), are, testing, thrown-with-msg?.
(ns kiso.fixtures-test
  (:require [clojure.test :refer [deftest is are testing use-fixtures]]))

(def log (atom []))

(defn each-fixture [t]
  (swap! log conj :setup)
  (t)
  (swap! log conj :teardown))

(use-fixtures :each each-fixture)

(deftest first-test
  (is (= :setup (last @log))))

(deftest second-test
  (is (= [:setup :teardown :setup] @log)))

(deftest are-and-testing
  (are [x y] (= x y)
    1 1
    "a" "a")
  (testing "nested"
    (is (= 3 (+ 1 2)))))
