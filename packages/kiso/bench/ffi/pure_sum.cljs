(ns bench.pure-sum)
(def xs (vec (range 100000)))
(defn -main [] (dotimes [_ 20] (reduce + 0 xs)))
