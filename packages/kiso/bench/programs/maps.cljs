(ns bench.maps)
(defn -main []
  (let [m (loop [i 0 m {}] (if (< i 50000) (recur (inc i) (assoc m i (* i 2))) m))]
    (println (reduce (fn [acc i] (+ acc (get m i))) 0 (range 50000)))))
