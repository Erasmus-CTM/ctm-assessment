;; Loads and stores to linear memory every iteration.
(module
  (import "e" "m" (memory 1))
  (func (export "spin") (param i32) (local $i i32) (local $a i32)
    (loop $l
      (local.set $a (i32.and (local.get $i) (i32.const 0xfffc)))
      (i32.store (local.get $a) (i32.add (i32.load (local.get $a)) (i32.const 1)))
      (local.set $i (i32.add (local.get $i) (i32.const 4)))
      (br $l))))
