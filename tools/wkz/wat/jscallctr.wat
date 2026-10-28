;; As jscall, plus a progress counter in shared memory: every 2^16 iterations
;; the loop stores its iteration count at byte offset $slot, so the page can
;; see exactly when a terminated worker stops.
(module
  (import "e" "m" (memory 1 16384 shared))
  (import "e" "f" (func $f))
  (func (export "spin") (param $mask i32) (param $slot i32) (local $i i32)
    (loop $l
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (if (i32.eqz (i32.and (local.get $i) (local.get $mask))) (then (call $f)))
      (if (i32.eqz (i32.and (local.get $i) (i32.const 0xffff)))
        (then (i32.atomic.store (local.get $slot) (local.get $i))))
      (br $l))))
