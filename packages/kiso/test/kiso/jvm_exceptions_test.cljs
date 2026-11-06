;; targets: js
;; JVM exception classes on the JS backend (a wasm stack overflow is an uncatchable trap).
(ns kiso.jvm-exceptions-test
  (:require [clojure.test :refer [deftest is]]))

(defn runaway [n] (inc (runaway (inc n))))

(deftest runaway-recursion-is-a-catchable-stack-overflow
  (is (true? (try (runaway 0) false (catch StackOverflowError _ true))))
  (is (instance? Throwable (try (runaway 0) (catch Throwable t t)))))

(deftest exception-does-not-swallow-stack-overflow
  (is (= :caught (try (throw (js/Error. "x")) (catch Exception e :caught))))
  (is (= :so (try (runaway 0) (catch Exception _ :exception) (catch StackOverflowError _ :so)))))
