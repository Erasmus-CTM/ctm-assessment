;; memory.grow 0 (a runtime call on most engines) every iteration.
(module
  (import "e" "m" (memory 1))
  (func (export "spin") (param i32) (local $x i32)
    (loop $l
      (local.set $x (i32.add (local.get $x) (memory.grow (i32.const 0))))
      (i32.store (i32.const 4) (local.get $x))
      (br $l))))
