(ns bench.fib)
(defn fib [n] (if (< n 2) n (+ (fib (- n 1)) (fib (- n 2)))))
(defn -main [] (println (fib 32)))
