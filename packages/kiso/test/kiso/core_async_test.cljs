;; expect: 11
;; Runs on the JS and AS backends (replaces the former TypeScript core-async tests).
(ns kiso.core-async-test
  (:require [clojure.test :refer [deftest is testing]]
            [clojure.core.async :as a :refer [go go-loop chan <! >!]]))

(deftest go-returns-a-channel
  (let [c (go (+ 1 2))]
    (go (let [v (<! c)] (is (= 3 v))))))

(deftest put-then-take-across-go-blocks
  (let [c (chan)]
    (go (>! c 42))
    (go (let [v (<! c)] (is (= 42 v))))))

(deftest alias-qualified-names
  (let [c (a/chan 1)]
    (a/put! c 5)
    (go (let [v (a/<! c)] (is (= 5 v))))))

(deftest go-loop-with-park-in-body
  (let [c (chan 3)]
    (go (>! c 1) (>! c 2) (>! c 3) (a/close! c))
    (go (let [sum (<! (go-loop [acc 0]
                        (let [v (<! c)]
                          (if v (recur (+ acc v)) acc))))]
          (is (= 6 sum))))))

(deftest park-inside-if-and-let
  (let [c (chan 1)]
    (go (>! c 7))
    (go (let [x (<! c)
                s (if (> x 5) (str "big " (<! (go x))) "small")]
          (is (= "big 7" s))))))

(deftest long-go-loop-keeps-the-stack-flat
  (go (let [n (<! (go-loop [i 0] (if (< i 50000) (recur (inc i)) i)))]
        (is (= 50000 n)))))

(deftest closed-channel-yields-nil
  (let [c (chan)]
    (a/close! c)
    (go (let [v (<! c)] (is (nil? v))))))

(deftest alts-picks-the-ready-channel
  (let [c1 (chan) c2 (chan 1)]
    (a/put! c2 :b)
    (go (let [[v p] (a/alts! [c1 c2])]
          (is (and (= :b v) (= p c2)))))))

(deftest timeout-parks-without-blocking
  (go (<! (a/timeout 5))
      (is (= 1 1))))

(deftest dropping-and-sliding-buffers
  (let [d (chan (a/dropping-buffer 1))
        s (chan (a/sliding-buffer 1))]
    (a/put! d 1) (a/put! d 2) (a/put! s 1) (a/put! s 2)
    (go (let [x (<! d) y (<! s)]
          (is (= [1 2] [x y]))))))

(deftest producer-consumer-with-blocked-putter
  (let [c (chan)
        out (atom [])]
    (go (dotimes [i 3] (>! c i)) (a/close! c))
    (go (let [r (<! (go-loop [acc []]
                      (if-let [v (<! c)] (recur (conj acc v)) acc)))]
          (is (= [0 1 2] r))))))
