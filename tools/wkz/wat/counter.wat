;; Shared memory: increments the i32 at address 0 every 2^20 iterations, so
;; another thread can see whether the loop is still running.
(module
  (import "e" "m" (memory 1 16384 shared))
  (func (export "spin") (param i32) (local $i i32)
    (loop $l
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (if (i32.eqz (i32.and (local.get $i) (i32.const 0xfffff)))
        (then (i32.atomic.store (i32.const 0) (i32.add (i32.atomic.load (i32.const 0)) (i32.const 1)))))
      (br $l))))
