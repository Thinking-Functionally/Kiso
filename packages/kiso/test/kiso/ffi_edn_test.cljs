;; wasm: fixture=test/fixtures/ffi_fixture.wasm
(ns kiso.ffi-edn-test
  (:require [clojure.test :refer [deftest is]]))

(defwasm edn-echo "fixture" [:edn] :edn)
(defwasm edn-stats "fixture" [:edn] :edn)
(defwasm edn-sum "fixture" "edn_stats" [:edn] :str)

(deftest scalars-round-trip
  (is (= nil (edn-echo nil)))
  (is (= true (edn-echo true)))
  (is (= 42 (edn-echo 42)))
  (is (= -7 (edn-echo -7)))
  (is (= 2.5 (edn-echo 2.5)))
  (is (= "a\nb \"q\" é 世界 😀" (edn-echo "a\nb \"q\" é 世界 😀")))
  (is (= :a/b (edn-echo :a/b)))
  (is (= 'foo.bar/baz (edn-echo 'foo.bar/baz))))

(deftest collections-round-trip
  (is (= [1 2 3] (edn-echo [1 2 3])))
  (is (= {:a 1 :b [2 3] "k" nil} (edn-echo {:a 1 :b [2 3] "k" nil})))
  (is (= #{1 2 3} (edn-echo #{1 2 3})))
  (is (= [] (edn-echo [])))
  (is (= {} (edn-echo {})))
  (is (= {:users [{:id 1 :tags #{:a :b} :score 9.5} {:id 2 :tags #{} :score nil}] :ok true}
         (edn-echo {:users [{:id 1 :tags #{:a :b} :score 9.5} {:id 2 :tags #{} :score nil}] :ok true}))))

(deftest lists-come-back-as-seqs
  (is (= '(1 2) (edn-echo '(1 2)))))

(deftest structured-call
  (is (= {:count 3 :sum 7.5 :max 4} (edn-stats {:xs [1 2.5 4]})))
  (is (= {:count 0 :sum 0 :max nil} (edn-stats {:xs []})))
  (is (= {:count 2 :sum 3 :max 2} (edn-stats {:xs (map inc [0 1])}))))

(deftest edn-argument-with-raw-result
  (is (= "{:count 1, :sum 5.0, :max 5.0}" (edn-sum {:xs [5]}))))
