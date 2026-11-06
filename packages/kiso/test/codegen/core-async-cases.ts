// Shared by the JS (core-async.test.ts) and AS (core-async-as.test.ts) core.async suites.
export const ASYNC_NS = '(ns t (:require [clojure.core.async :as a :refer [go chan <! >!]]))\n';

export const ASYNC_CASES: [name: string, body: string, expected: string][] = [
  ['go returns a channel with the body result', '(let [c (go (+ 1 2))] (go (println (<! c))))', '3'],
  ['put then take across go blocks', '(let [c (chan)] (go (>! c 42)) (go (println (<! c))))', '42'],
  ['alias-qualified names resolve', '(let [c (a/chan 1)] (a/put! c 5) (go (println (a/<! c))))', '5'],
  [
    'go-loop with a park in the loop body',
    '(let [c (chan 3)] (go (>! c 1) (>! c 2) (>! c 3) (a/close! c)) ' +
      '(a/go-loop [acc 0] (let [v (<! c)] (if v (recur (+ acc v)) (println acc)))))',
    '6',
  ],
  [
    'park inside if / let branches',
    '(let [c (chan 1)] (go (>! c 7)) ' +
      '(go (let [x (<! c)] (println (if (> x 5) (str "big " (<! (go x))) "small")))))',
    'big 7',
  ],
  ['long go-loop does not overflow the stack', '(a/go-loop [i 0] (if (< i 50000) (recur (inc i)) (println i)))', '50000'],
  ['closed channel yields nil', '(let [c (chan)] (a/close! c) (go (println (pr-str (<! c)))))', 'nil'],
  [
    'alts! picks the ready channel',
    '(let [c1 (chan) c2 (chan 1)] (a/put! c2 :b) ' +
      '(go (let [[v p] (a/alts! [c1 c2])] (println v (= p c2)))))',
    ':b true',
  ],
  ['timeout parks without blocking', '(go (<! (a/timeout 5)) (println "done"))', 'done'],
  [
    'dropping and sliding buffers',
    '(let [d (chan (a/dropping-buffer 1)) s (chan (a/sliding-buffer 1))] ' +
      '(a/put! d 1) (a/put! d 2) (a/put! s 1) (a/put! s 2) ' +
      '(go (println (<! d) (<! s))))',
    '1 2',
  ],
  [
    'producer/consumer with a blocked putter',
    '(let [c (chan)] (go (dotimes [i 3] (>! c i)) (a/close! c)) ' +
      '(go-loop [] (when-let [v (<! c)] (println v) (recur))))',
    '0\n1\n2',
  ],
];
