(ns bench.ffi-sum)
(defwasm sum-f64s "fixture" [:f64s] :f64)
(def xs (vec (range 100000)))
(defn -main [] (dotimes [_ 20] (sum-f64s xs)))
