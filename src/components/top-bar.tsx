"use client"

import { type RefObject } from "react"
import { Moon, Plus, Search } from "lucide-react"
import styles from "./top-bar.module.css"

export function TopBar({
  query,
  inputRef,
  ready,
  onQuery,
  onQueryBlur,
  onNew,
  onTheme,
  onPalette,
}: {
  query: string
  inputRef: RefObject<HTMLInputElement | null>
  ready: boolean
  onQuery: (value: string) => void
  onQueryBlur: (value: string) => void
  onNew: () => void
  onTheme: () => void
  onPalette: () => void
}) {
  return (
    <header className={styles.nav}>
      <h1 className={styles.brand}>Dispatch</h1>
      <label className={styles.search}>
        <Search size={16} aria-hidden="true" />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          onBlur={(event) => onQueryBlur(event.target.value)}
          placeholder="Search posts"
          type="search"
          aria-label="Search"
        />
      </label>
      <button type="button" className={styles.kbd} aria-label="Open commands" onClick={onPalette}>
        ⌘K
      </button>
      <button type="button" className={styles.iconButton} aria-label="Color theme" onClick={onTheme}>
        <Moon size={16} aria-hidden="true" />
      </button>
      <button type="button" className={`${styles.primary} ${styles.desktopOnly}`} onClick={onNew} disabled={!ready}>
        <Plus size={16} aria-hidden="true" />
        New post
      </button>
    </header>
  )
}
