;; wasm: fixture=test/fixtures/ffi_fixture.wasm
(ns kiso.ffi-scalar-test
  (:require [clojure.test :refer [deftest is]]))

(defwasm add "fixture" [:i32 :i32] :i32)
(defwasm scale "fixture" [:f64 :f64] :f64)
(defwasm is-even "fixture" [:i32] :bool)
(defwasm concat-str "fixture" "concat" [:str :str] :str)
(defwasm upper "fixture" [:str] :str)

(deftest numbers
  (is (= 5 (add 2 3)))
  (is (= -1 (add 2 -3)))
  (is (= 7.5 (scale 2.5 3)))
  (is (= 12 (reduce add 0 [3 4 5]))))

(deftest booleans
  (is (true? (is-even 4)))
  (is (false? (is-even 5))))

(deftest strings
  (is (= "foobar" (concat-str "foo" "bar")))
  (is (= "" (concat-str "" "")))
  (is (= "HÉLLO 世界" (upper "héllo 世界")))
  (is (= "😀!" (concat-str "😀" "!"))))

(deftest first-class
  (is (= [3 5] (map add [1 2] [2 3]))))
