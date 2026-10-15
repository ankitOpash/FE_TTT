"use client"

import { useEffect, useRef, type RefObject } from "react"
import { Search, X } from "lucide-react"
import {
  PLATFORM_LABEL,
  PLATFORMS,
  STATUSES,
  type Platform,
  type Status,
} from "@/lib/schedule"
import { PlatformIcon } from "./platform-icon"
import styles from "./filter-bar.module.css"

export function FilterBar({
  platforms,
  status,
  query,
  counts,
  showing,
  total,
  open,
  onOpenChange,
  onTogglePlatform,
  onClearPlatforms,
  onStatus,
  onClear,
  onClearQuery,
  rangeLabel,
  onClearRange,
  inputRef,
  onQuery,
  onQueryBlur,
}: {
  platforms: Platform[]
  status: Status | ""
  query: string
  counts: Record<Status | "all", number>
  showing: number
  total: number
  open: boolean
  onOpenChange: (open: boolean) => void
  onTogglePlatform: (platform: Platform) => void
  onClearPlatforms: () => void
  onStatus: (status: Status | "") => void
  onClear: () => void
  onClearQuery: () => void
  rangeLabel: string
  onClearRange: () => void
  inputRef: RefObject<HTMLInputElement | null>
  onQuery: (value: string) => void
  onQueryBlur: (value: string) => void
}) {
  const barRef = useRef<HTMLDivElement>(null)
  const active = platforms.length + (status ? 1 : 0) + (query.trim() ? 1 : 0) + (rangeLabel ? 1 : 0)

  useEffect(() => {
    const node = barRef.current
    if (!node) return
    const apply = () => document.documentElement.style.setProperty("--filter-h", `${node.offsetHeight}px`)
    apply()
    const observer = new ResizeObserver(apply)
    observer.observe(node)
    return () => {
      observer.disconnect()
      document.documentElement.style.removeProperty("--filter-h")
    }
  }, [])
  const controls = (
    <>
      <div className={styles.row}>
        <fieldset className={styles.group}>
          <legend>Platform</legend>
          <button type="button" className={styles.chip} aria-pressed={platforms.length === 0} onClick={onClearPlatforms}>
            All
          </button>
          {PLATFORMS.map((platform) => (
            <button
              key={platform}
              type="button"
              className={styles.chip}
              data-platform={platform}
              aria-pressed={platforms.includes(platform)}
              onClick={() => onTogglePlatform(platform)}
            >
              <PlatformIcon platform={platform} />
              {PLATFORM_LABEL[platform]}
            </button>
          ))}
        </fieldset>
      </div>
      <div className={styles.row}>
        <span className={styles.statusLabel} id="status-tabs">
          Status
        </span>
        <div className={styles.tabs} role="tablist" aria-labelledby="status-tabs">
          <button type="button" role="tab" className={styles.tab} aria-selected={status === ""} onClick={() => onStatus("")}>
            All {counts.all}
          </button>
          {STATUSES.map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              className={styles.tab}
              aria-selected={status === item}
              onClick={() => onStatus(item)}
            >
              {item[0].toUpperCase() + item.slice(1)} {counts[item]}
            </button>
          ))}
        </div>
      </div>
    </>
  )

  return (
    <div className={styles.bar} ref={barRef}>
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
      <button
        type="button"
        className={styles.sheetToggle}
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
      >
        {open ? "Hide filters" : "Filters"}
        {active > 0 ? `, ${active} active` : ""}
      </button>
      <div className={open ? `${styles.controls} ${styles.controlsOpen}` : styles.controls}>
        {open ? (
          <button type="button" className={styles.backdrop} aria-label="Close filters" onClick={() => onOpenChange(false)} />
        ) : null}
        <div className={open ? styles.sheet : undefined}>{controls}</div>
      </div>
      <p className={styles.count}>Showing {showing} of {total}</p>
      {active > 0 ? (
        <div className={styles.chips}>
          {platforms.map((platform) => (
            <span key={platform} className={styles.active}>
              {PLATFORM_LABEL[platform]}
              <button type="button" aria-label={`Remove ${PLATFORM_LABEL[platform]}`} onClick={() => onTogglePlatform(platform)}>
                <X size={14} aria-hidden="true" />
              </button>
            </span>
          ))}
          {status ? (
            <span className={styles.active}>
              {status[0].toUpperCase() + status.slice(1)}
              <button type="button" aria-label="Remove status" onClick={() => onStatus("")}>
                <X size={14} aria-hidden="true" />
              </button>
            </span>
          ) : null}
          {query.trim() ? (
            <span className={styles.active}>
              “{query.trim()}”
              <button type="button" aria-label="Remove search" onClick={onClearQuery}>
                <X size={14} aria-hidden="true" />
              </button>
            </span>
          ) : null}
          {rangeLabel ? (
            <span className={styles.active}>
              {rangeLabel}
              <button type="button" aria-label="Remove date range" onClick={onClearRange}>
                <X size={14} aria-hidden="true" />
              </button>
            </span>
          ) : null}
          <button type="button" className={styles.clear} onClick={onClear}>
            Clear filters
          </button>
        </div>
      ) : null}
    </div>
  )
}
