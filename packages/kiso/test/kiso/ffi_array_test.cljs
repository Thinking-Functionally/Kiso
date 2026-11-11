;; wasm: fixture=test/fixtures/ffi_fixture.wasm
(ns kiso.ffi-array-test
  (:require [clojure.test :refer [deftest is]]))

(defwasm sum-f64s "fixture" [:f64s] :f64)
(defwasm scale-f64s "fixture" [:f64s :f64] :f64s)
(defwasm sum-i32s "fixture" [:i32s] :i32)
(defwasm rev-i32s "fixture" [:i32s] :i32s)
(defwasm echo-bytes "fixture" [:u8s] :u8s)
(defwasm mean-and-max "fixture" [:f64s] :f64s)

(deftest f64-arrays
  (is (= 6.0 (sum-f64s [1.5 2.5 2])))
  (is (= 0 (sum-f64s [])))
  (is (= [2.0 4.0 6.0] (vec (scale-f64s [1 2 3] 2))))
  (is (= [3.0 4.0] (vec (mean-and-max [2 3 4])))))

(deftest i32-arrays
  (is (= 10 (sum-i32s [1 2 3 4])))
  (is (= [3 2 1] (vec (rev-i32s [1 2 3]))))
  (is (= [] (vec (rev-i32s [])))))

(deftest byte-arrays
  (is (= [0 1 255] (vec (echo-bytes [0 1 255]))))
  (is (= [] (vec (echo-bytes [])))))

(deftest any-seqable-arguments
  (is (= 6 (sum-i32s (list 1 2 3))))
  (is (= 9 (sum-i32s (map inc [1 2 3]))))
  (is (= 6 (sum-i32s (range 4))))
  (is (= 4 (sum-i32s (array 1 3)))))

(deftest results-are-arrays
  (let [r (scale-f64s [1 2] 3)]
    (is (= 2 (count r)))
    (is (= 6.0 (aget r 1)))))
