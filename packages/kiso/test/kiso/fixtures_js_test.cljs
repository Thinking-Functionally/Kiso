;; thrown-with-msg? checks the message (needs try/catch, so JS only).
;; targets: js
(ns kiso.fixtures-js-test
  (:require [clojure.test :refer [deftest is]]))

(deftest thrown-assertions
  (is (thrown? js/Error (throw (js/Error. "boom"))))
  (is (thrown-with-msg? js/Error #"bo+m" (throw (js/Error. "boom"))))
  (is (thrown-with-msg? js/Error #"bad" (throw (ex-info "very bad thing" {})))))
