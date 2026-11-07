(ns bench.strings)
(defn -main []
  (println (count (apply str (map str (range 50000))))))
