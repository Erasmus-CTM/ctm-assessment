;; wasm -> wasm call_indirect through a table every iteration.
(module
  (import "e" "m" (memory 1))
  (type $t (func (param i32) (result i32)))
  (table 2 funcref)
  (elem (i32.const 0) $g $h)
  (func $g (param $x i32) (result i32) (i32.add (local.get $x) (i32.const 1)))
  (func $h (param $x i32) (result i32) (i32.sub (local.get $x) (i32.const 1)))
  (func (export "spin") (param i32) (local $x i32)
    (loop $l
      (local.set $x (call_indirect (type $t) (local.get $x) (i32.and (local.get $x) (i32.const 1))))
      (i32.store (i32.const 4) (local.get $x))
      (br $l))))
