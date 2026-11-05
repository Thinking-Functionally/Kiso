(ns app.client
  (:require [app.shared :as shared]))

;; Browser (JS backend): same validation as the server, so invalid input is rejected before the request.
(defn submit! [title]
  (let [v (shared/validate-todo {:title title})]
    (if (:ok v)
      (js/fetch "/api/todos" #js {:method "POST" :body (js/JSON.stringify #js {:title title})})
      (js/alert (:error v)))))
