(ns bench.pure-upper
  (:require [clojure.string :as str]))
(defn -main [] (dotimes [_ 10000] (str/upper-case "hello wasm ffi world")))
