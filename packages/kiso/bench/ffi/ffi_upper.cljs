(ns bench.ffi-upper)
(defwasm upper "fixture" [:str] :str)
(defn -main [] (dotimes [_ 10000] (upper "hello wasm ffi world")))
