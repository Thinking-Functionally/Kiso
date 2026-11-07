(ns todo.main
  (:require [clojure.string :as str]))

(def db-file "todos.json")
(def usage "usage: todo <add|list|done|stats|import> ...")

(defn load-todos []
  (let [txt (host/read-file db-file)]
    (if txt (vec (host/json-parse txt)) [])))

(defn save-todos [todos]
  (host/write-file db-file (host/json-stringify todos)))

(defn fmt [t]
  (str (if (:done t) "[x] " "[ ] ") (:id t) ". " (:title t)))

(defn next-id [todos]
  (inc (reduce max 0 (map :id todos))))

(defn add-all [todos titles]
  (reduce (fn [acc title] (conj acc {:id (next-id acc) :title title :done false}))
          todos
          titles))

(defn cmd-add [words]
  (let [title (str/join " " words)
        todos (add-all (load-todos) [title])]
    (save-todos todos)
    (println (str "added " (:id (last todos)) ": " title))))

(defn cmd-done [id-str]
  (let [id (parse-long id-str)
        todos (load-todos)]
    (if (some #(= id (:id %)) todos)
      (do (save-todos (mapv #(if (= id (:id %)) (assoc % :done true) %) todos))
          (println (str "done " id)))
      (do (println (str "error: no todo with id " id-str))
          (host/exit 1)))))

(defn cmd-stats []
  (let [todos (load-todos)
        done (count (filter :done todos))]
    (println (str "total " (count todos) ", done " done ", open " (- (count todos) done)))))

(defn cmd-import []
  (let [titles (remove str/blank? (str/split (host/stdin) #"\n"))]
    (save-todos (add-all (load-todos) titles))
    (println (str "imported " (count titles)))))

(defn -main []
  (let [[cmd & more] (host/args)]
    (cond
      (= cmd "add") (cmd-add more)
      (= cmd "list") (doseq [t (load-todos)] (println (fmt t)))
      (= cmd "done") (cmd-done (first more))
      (= cmd "stats") (cmd-stats)
      (= cmd "import") (cmd-import)
      :else (do (println usage) (host/exit 2)))))
