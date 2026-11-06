;; targets: js
;; Ported from runtime/interop.test.ts and interop-ext.test.ts: clj->js, js->clj, bean, js-obj, js-array.
(ns kiso.interop-convert-test
  (:require [clojure.test :refer [deftest is]]))

(deftest clj->js-primitives
  (is (= 42 (clj->js 42)))
  (is (= "hello" (clj->js "hello")))
  (is (true? (clj->js true)))
  (is (nil? (clj->js nil))))

(deftest clj->js-collections
  (is (= "foo" (clj->js :foo)))
  (is (= "ns/bar" (clj->js :ns/bar)))
  (is (true? (.isArray js/Array (clj->js [1 2 3]))))
  (is (= "[1,2,3]" (js/JSON.stringify (clj->js [1 2 3]))))
  (is (= "[1,2,3]" (js/JSON.stringify (clj->js '(1 2 3)))))
  (is (= "{\"a\":1,\"b\":2}" (js/JSON.stringify (clj->js {:a 1 :b 2}))))
  (is (= "{\"x\":10,\"y\":20}" (js/JSON.stringify (clj->js {"x" 10 "y" 20}))))
  (is (= "[1,2,3]" (js/JSON.stringify (.sort (clj->js #{3 1 2})))))
  (is (= "{\"items\":[{\"id\":1}]}" (js/JSON.stringify (clj->js {:items [{:id 1}]})))))

(deftest js->clj-conversions
  (is (= 42 (js->clj 42)))
  (is (nil? (js->clj nil)))
  (is (= [1 2 3] (js->clj (js* "[1,2,3]"))))
  (is (= [1 [2 3]] (js->clj (js* "[1,[2,3]]"))))
  ;; Current behaviour: js->clj always keywordizes keys (CLJS default is string keys).
  (is (= {:a 1 :b 2} (js->clj (js* "({a:1,b:2})"))))
  (is (= {:items [{:id 1}]} (js->clj (js* "({items:[{id:1}]})")))))

(deftest bean-shallow
  (let [inner (js* "({z:1})")
        m (bean (js* "({name:'Alice',age:30})"))]
    (is (= "Alice" (:name m)))
    (is (= 30 (:age m)))
    (is (= 0 (count (bean (js* "({})")))))
    (is (nil? (bean nil)))
    (is (identical? inner (:nested (bean (js-obj "nested" inner)))))))

(deftest js-obj-and-array
  (is (= "{\"name\":\"Alice\",\"age\":30}" (js/JSON.stringify (js-obj "name" "Alice" "age" 30))))
  (is (= "{}" (js/JSON.stringify (js-obj))))
  ;; Current behaviour: js-array converts one collection (CLJS js-array is variadic).
  (is (= "[1,2,3]" (js/JSON.stringify (js-array [1 2 3]))))
  (is (= "[]" (js/JSON.stringify (js-array [])))))
