;; Metadata (ported from test/runtime/metadata.test.ts).
(ns kiso.metadata-test
  (:require [clojure.test :refer [deftest is]]))

(deftest meta-absent
  (is (nil? (meta [1 2 3])))
  (is (nil? (meta 42)))
  (is (nil? (meta nil))))

(deftest with-meta-on-collections
  (let [v (with-meta [1 2 3] {:tag "important"})]
    (is (= {:tag "important"} (meta v)))
    (is (= [1 2 3] v))
    (is (nil? (meta [1 2 3]))))
  (is (= {:doc "a map"} (meta (with-meta {"a" 1} {:doc "a map"}))))
  (is (= {:type "numbers"} (meta (with-meta #{1 2 3} {:type "numbers"}))))
  (is (= {:source "test"} (meta (with-meta (list 1 2 3) {:source "test"}))))
  (is (= {:b 2} (meta (with-meta (with-meta [1] {:a 1}) {:b 2})))))

(deftest vary-meta-test
  (is (= {:count 1} (meta (vary-meta (with-meta [1 2 3] {:count 0}) (fn [m] {:count 1})))))
  (is (= {:new true} (meta (vary-meta [1 2 3] (fn [_] {:new true}))))))
