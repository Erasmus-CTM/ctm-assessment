;; wasm -> wasm direct call every iteration (callee has a loop, so it is less
;; likely to be inlined).
(module
  (import "e" "m" (memory 1))
  (func $g (param $x i32) (result i32) (local $k i32)
    (loop $l
      (local.set $x (i32.add (i32.mul (local.get $x) (i32.const 31)) (i32.load (i32.const 0))))
      (local.set $k (i32.add (local.get $k) (i32.const 1)))
      (br_if $l (i32.lt_u (local.get $k) (i32.const 4))))
    (local.get $x))
  (func (export "spin") (param i32) (local $x i32)
    (loop $l
      (local.set $x (call $g (local.get $x)))
      (i32.store (i32.const 4) (local.get $x))
      (br $l))))
