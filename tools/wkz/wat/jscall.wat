;; Calls the imported function f whenever (i & mask) == 0: mask 0 = every
;; iteration, mask 2^k-1 = every 2^k iterations.
(module
  (import "e" "m" (memory 1))
  (import "e" "f" (func $f))
  (func (export "spin") (param $mask i32) (local $i i32)
    (loop $l
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (if (i32.eqz (i32.and (local.get $i) (local.get $mask))) (then (call $f)))
      (br $l))))
