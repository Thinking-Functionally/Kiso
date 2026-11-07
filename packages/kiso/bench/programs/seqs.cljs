(ns bench.seqs)
(defn -main []
  (println (reduce + (map inc (filter even? (range 300000))))))
