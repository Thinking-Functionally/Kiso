# cli-todo

A command-line todo app compiled to WebAssembly by the AssemblyScript backend.
It uses `host/args`, `host/read-file`, `host/write-file`, `host/stdin`, `host/json-*` and `host/exit`.

    kiso run src/todo/main.cljs -- add buy milk
    kiso run src/todo/main.cljs -- list
    kiso run src/todo/main.cljs -- done 1
    printf 'a\nb\n' | kiso run src/todo/main.cljs -- import
    kiso build src/todo/main.cljs        # writes main.wasm

Todos are stored in `todos.json` in the working directory. Exit codes: 0 ok, 1 runtime error, 2 usage.
