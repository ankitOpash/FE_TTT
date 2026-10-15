"use client"

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react"
import { PLATFORM_LABEL, clipGraphemes, type Post } from "@/lib/schedule"
import type { SchedulerView } from "./shell"
import styles from "./command-palette.module.css"

type Item = {
  id: string
  label: string
  hint?: string
  run: () => void
}

export function CommandPalette({
  open,
  posts,
  onClose,
  onNew,
  onSearch,
  onTheme,
  onView,
  onClearFilters,
  onOpenPost,
}: {
  open: boolean
  posts: Post[]
  onClose: () => void
  onNew: () => void
  onSearch: () => void
  onTheme: () => void
  onView: (view: SchedulerView) => void
  onClearFilters: () => void
  onOpenPost: (post: Post) => void
}) {
  if (!open) return null
  return (
    <CommandDialog
      posts={posts}
      onClose={onClose}
      onNew={onNew}
      onSearch={onSearch}
      onTheme={onTheme}
      onView={onView}
      onClearFilters={onClearFilters}
      onOpenPost={onOpenPost}
    />
  )
}

function CommandDialog({
  posts,
  onClose,
  onNew,
  onSearch,
  onTheme,
  onView,
  onClearFilters,
  onOpenPost,
}: {
  posts: Post[]
  onClose: () => void
  onNew: () => void
  onSearch: () => void
  onTheme: () => void
  onView: (view: SchedulerView) => void
  onClearFilters: () => void
  onOpenPost: (post: Post) => void
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState("")
  const [active, setActive] = useState(0)
  const needle = query.trim().toLowerCase()
  const actions: Item[] = [
    { id: "new", label: "New post", run: onNew },
    { id: "search", label: "Search posts", run: onSearch },
    { id: "theme", label: "Toggle theme", run: onTheme },
    { id: "overview", label: "Overview", run: () => onView("overview") },
    { id: "queue", label: "Queue view", run: () => onView("queue") },
    { id: "calendar", label: "Calendar view", run: () => onView("calendar") },
    { id: "analytics", label: "Analytics", run: () => onView("analytics") },
    { id: "media", label: "Media library", run: () => onView("media") },
    { id: "settings", label: "Settings", run: () => onView("settings") },
    { id: "channels", label: "Channel setup", run: () => onView("channels") },
    { id: "board", label: "Board view", run: () => onView("board") },
    { id: "clear", label: "Clear filters", run: onClearFilters },
  ]
  const commands = actions.filter((item) => !needle || item.label.toLowerCase().includes(needle))
  const matches = needle
    ? posts
        .filter((post) => post.content.toLowerCase().includes(needle))
        .slice(0, 8)
        .map((post) => ({
          id: post.id,
          label: clipGraphemes(post.content, 64),
          hint: post.platforms.map((platform) => PLATFORM_LABEL[platform]).join(", "),
          run: () => onOpenPost(post),
        }))
    : []
  const items = [...matches, ...commands]

  useEffect(() => {
    const field = dialogRef.current?.querySelector("input")
    if (field instanceof HTMLElement) field.focus()
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const safeIndex = items.length === 0 ? 0 : Math.min(active, items.length - 1)

  function run(item: Item) {
    item.run()
    onClose()
  }

  function onInputKey(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setActive((index) => Math.min(index + 1, Math.max(items.length - 1, 0)))
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      setActive((index) => Math.max(index - 1, 0))
    } else if (event.key === "Enter" && items[safeIndex]) {
      event.preventDefault()
      run(items[safeIndex])
    }
  }

  return (
    <div className={styles.wrap}>
      <button type="button" className={styles.backdrop} aria-label="Close commands" onClick={onClose} />
      <div ref={dialogRef} className={styles.dialog} role="dialog" aria-modal="true" aria-label="Commands">
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setActive(0)
          }}
          onKeyDown={onInputKey}
          placeholder="Search posts or commands"
          aria-label="Command search"
          type="search"
        />
        {items.length === 0 ? <p className={styles.empty}>No matches</p> : null}
        <div className={styles.list}>
          {items.map((item, index) => (
            <button
              key={item.id}
              type="button"
              data-active={index === safeIndex ? "true" : undefined}
              onMouseEnter={() => setActive(index)}
              onClick={() => run(item)}
            >
              <span>{item.label}</span>
              {item.hint ? <small>{item.hint}</small> : null}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
