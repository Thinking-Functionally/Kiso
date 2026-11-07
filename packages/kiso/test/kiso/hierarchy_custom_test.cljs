(ns kiso.hierarchy-custom-test
  (:require [clojure.test :refer [deftest is]]))

(deftest make-and-derive
  (let [h (-> (make-hierarchy)
              (derive :dog :animal)
              (derive :cat :animal)
              (derive :animal :thing))]
    (is (isa? h :dog :animal))
    (is (isa? h :dog :thing))
    (is (isa? h :dog :dog))
    (is (not (isa? h :animal :dog)))
    (is (= #{:animal} (parents h :dog)))
    (is (= #{:animal :thing} (ancestors h :dog)))
    (is (= #{:dog :cat :animal} (descendants h :thing)))
    (is (nil? (parents h :thing)))
    (is (nil? (descendants h :dog)))))

(deftest immutability-and-global-isolation
  (let [h (derive (make-hierarchy) :x :y)]
    (is (isa? h :x :y))
    (is (not (isa? (make-hierarchy) :x :y)))
    (is (not (isa? :x :y)))))

(deftest vectors-and-underive
  (let [h (-> (make-hierarchy) (derive :a :b) (derive :b :c))]
    (is (isa? h [:a :a] [:b :c]))
    (is (not (isa? h [:a :a] [:b])))
    (let [h2 (underive h :a :b)]
      (is (not (isa? h2 :a :c)))
      (is (isa? h2 :b :c)))))

(deftest derive-idempotent
  (let [h (derive (make-hierarchy) :a :b)]
    (is (= h (derive h :a :b)))))
