(ns app.shared)

;; Shared by the browser (JS backend) and the server (AssemblyScript/wasm backend).
;; Keep to the common subset: numbers, strings, keywords, vectors, maps.

(defn valid-title? [title]
  (and (string? title) (> (count title) 0) (< (count title) 41)))

(defn validate-todo [todo]
  (if (valid-title? (:title todo))
    {:ok true}
    {:ok false :error "title must be 1-40 characters"}))

(defn summarize [todos]
  (let [done (count (filter :done todos))]
    {:total (count todos) :done done :open (- (count todos) done)}))

(def api-version #?(:as "1-wasm" :cljs "1-js"))
