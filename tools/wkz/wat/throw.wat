;; Throws and catches a wasm exception (legacy try/catch) every iteration.
(module
  (import "e" "m" (memory 1))
  (tag $t (param i32))
  (func $thrower (param $x i32) (throw $t (local.get $x)))
  (func (export "spin") (param i32) (local $x i32)
    (loop $l
      (try
        (do (call $thrower (local.get $x)))
        (catch $t (local.set $x (i32.add (i32.const 1)))))
      (i32.store (i32.const 4) (local.get $x))
      (br $l))))
