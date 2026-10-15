"use client"

import { useEffect, useRef } from "react"
import styles from "./command-palette.module.css"

export function CommandPalette({
  open,
  onClose,
  onNew,
  onSearch,
  onTheme,
}: {
  open: boolean
  onClose: () => void
  onNew: () => void
  onSearch: () => void
  onTheme: () => void
}) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const first = dialogRef.current?.querySelector("button")
    if (first instanceof HTMLElement) first.focus()
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  if (!open) return null

  const run = (action: () => void) => {
    action()
    onClose()
  }

  return (
    <div className={styles.wrap}>
      <button type="button" className={styles.backdrop} aria-label="Close commands" onClick={onClose} />
      <div ref={dialogRef} className={styles.dialog} role="dialog" aria-modal="true" aria-label="Commands">
        <button type="button" onClick={() => run(onNew)}>New post</button>
        <button type="button" onClick={() => run(onSearch)}>Search</button>
        <button type="button" onClick={() => run(onTheme)}>Toggle theme</button>
      </div>
    </div>
  )
}
