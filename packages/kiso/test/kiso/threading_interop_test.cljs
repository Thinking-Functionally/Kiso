;; targets: js
;; Threading macros with JS interop (ported from test/conformance/threading.test.ts).
(ns kiso.threading-interop-test
  (:require [clojure.test :refer [deftest is]]))

(deftest thread-with-methods
  (is (= "HELLO" (-> "hello" .toUpperCase)))
  (is (= "world" (-> "hello world" (.slice 6))))
  (is (= "world hello" (->> "hello" (.concat "world "))))
  (is (= "HELLO!" (as-> "hello" s (.toUpperCase s) (.concat s "!"))))
  (is (= "1" (cond-> 1 true (.toString))))
  (is (= 6 (as-> "abc" s (.toUpperCase s) (.concat s "def") (.-length s))))
  (is (= "EL" (some-> "hello" .toUpperCase (.slice 1 3)))))

(deftest doto-returns-the-object
  (let [obj (js* "{ x: 1, set(v) { this.x = v; } }")]
    (doto obj (.set 42))
    (is (= 42 (.-x obj))))
  (let [obj (js* "{ val: 0, inc() { this.val++; return 'ignored'; } }")]
    (doto obj (.inc))
    (is (= 1 (.-val obj)))))
