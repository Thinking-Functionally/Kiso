(ns bench.ffi-call)
(defwasm add "fixture" [:i32 :i32] :i32)
(defn -main [] (dotimes [i 100000] (add i 1)))
