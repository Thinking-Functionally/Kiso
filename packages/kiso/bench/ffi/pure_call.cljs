(ns bench.pure-call)
(defn add [a b] (+ a b))
(defn -main [] (dotimes [i 100000] (add i 1)))
