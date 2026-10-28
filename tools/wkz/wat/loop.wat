;; Empty loop: never leaves wasm.
(module
  (import "e" "m" (memory 1))
  (func (export "spin") (param i32)
    (loop $l (br $l))))
