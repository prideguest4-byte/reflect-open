import { useEffect, useState } from 'react'

/**
 * The value as of `delayMs` after it last changed. For search inputs: the
 * input stays live while the query the index sees coalesces fast typing into
 * one fetch (V1 debounced its mobile search the same way).
 */
export function useDebouncedValue<Value>(value: Value, delayMs: number): Value {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])

  return debounced
}
