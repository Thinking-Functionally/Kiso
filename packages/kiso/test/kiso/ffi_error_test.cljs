;; targets: js
;; wasm: fixture=test/fixtures/ffi_fixture.wasm
;; A failing call is a catchable exception on JS; on AS it aborts (see test/codegen-as/ffi.test.ts).
(ns kiso.ffi-error-test
  (:require [clojure.test :refer [deftest is thrown-with-msg?]]))

(defwasm fail-always "fixture" [] :str)
(defwasm add "fixture" [:i32 :i32] :i32)
(defwasm nowhere "missing" "f" [] :i32)
(defwasm mean-and-max "fixture" [:f64s] :f64s)
(defwasm edn-echo "fixture" [:edn] :edn)

(deftest module-failure-carries-the-module-message
  (is (thrown-with-msg? js/Error #"fail_always failed: fixture failure" (fail-always))))

(deftest array-result-failure
  (is (thrown-with-msg? js/Error #"empty input" (mean-and-max []))))

(deftest unregistered-module
  (is (thrown-with-msg? js/Error #"module \"missing\" is not registered" (nowhere))))

(deftest bad-edn-reports-the-parser-error
  (is (thrown-with-msg? js/Error #"missing closing" (edn-echo (symbol "[1 2")))))

(deftest calls-still-work-after-a-failure
  (try (fail-always) (catch :default _ nil))
  (is (= 3 (add 1 2))))
