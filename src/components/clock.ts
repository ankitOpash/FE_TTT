"use client"

import { useSyncExternalStore } from "react"

let clock = 0
let timer = 0
const listeners = new Set<() => void>()

function ensure() {
  if (timer !== 0 || typeof window === "undefined") return
  clock = Date.now()
  timer = window.setInterval(() => {
    clock = Date.now()
    listeners.forEach((listener) => listener())
  }, 60000)
  queueMicrotask(() => listeners.forEach((listener) => listener()))
}

export function useNow(): number {
  return useSyncExternalStore(
    (onStoreChange) => {
      listeners.add(onStoreChange)
      ensure()
      return () => listeners.delete(onStoreChange)
    },
    () => clock,
    () => 0,
  )
}
