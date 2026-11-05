(ns app.api
  (:require [app.shared :as shared]))

;; Serverless/wasm API:  kiso build src/app/api.cljs --worker --out-dir dist
;;                       kiso serve src/app/api.cljs --port 8787

(defn json [status body] {:status status :body body})

(defn add-todo [req]
  (let [todo (host/json-parse (:body req))
        v (shared/validate-todo todo)]
    (if (:ok v)
      (json 201 {:todo todo :version shared/api-version})
      (json 400 v))))

(defn handle [req]
  (cond
    (and (= (:method req) "GET") (= (:path req) "/api/version")) (json 200 {:version shared/api-version})
    (and (= (:method req) "POST") (= (:path req) "/api/todos")) (add-todo req)
    (= (:path req) "/api/summary") (json 200 (shared/summarize (:todos (host/json-parse (:body req)))))
    :else (json 404 {:error "not found"})))
