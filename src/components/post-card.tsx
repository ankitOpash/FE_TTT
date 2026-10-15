"use client"

import { useEffect, useRef, useState } from "react"
import { AlertCircle, Check, Clock, ImageOff, MoreHorizontal, RefreshCw } from "lucide-react"
import {
  clipGraphemes,
  formatClock,
  formatExactTimes,
  formatRelative,
  PLATFORM_LABEL,
  sortPlatforms,
  type Post,
  type Status,
} from "@/lib/schedule"
import { PlatformIcon } from "./platform-icon"
import styles from "./post-card.module.css"

export function clip(content: string): string {
  return clipGraphemes(content)
}

function StatusMark({ status }: { status: Status }) {
  if (status === "published") return <Check size={12} aria-hidden="true" />
  if (status === "failed") return <AlertCircle size={12} aria-hidden="true" />
  return <Clock size={12} aria-hidden="true" />
}

export function PostCard({
  post,
  now,
  retrying,
  fresh,
  shake,
  onRetry,
  onDemo,
}: {
  post: Post
  now: number
  retrying: boolean
  fresh: boolean
  shake: boolean
  onRetry: (post: Post) => void
  onDemo: () => void
}) {
  const [broken, setBroken] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const clock = formatClock(post.scheduledAt)
  const relative = now > 0 ? formatRelative(post.scheduledAt, new Date(now)) : ""
  const exact = formatExactTimes(post.scheduledAt)
  const label = post.status[0].toUpperCase() + post.status.slice(1)

  useEffect(() => {
    if (!menuOpen) return
    function onPointer(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false)
    }
    document.addEventListener("pointerdown", onPointer)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("pointerdown", onPointer)
      document.removeEventListener("keydown", onKey)
    }
  }, [menuOpen])

  return (
    <article
      className={`${styles.card} ${retrying ? styles.busy : ""} ${shake ? styles.shake : ""}`}
      aria-busy={retrying}
    >
      <div className={styles.main}>
        <div className={styles.when}>
          <time dateTime={post.scheduledAt}>{clock}</time>
          {relative ? (
            <span className={styles.relative} title={exact}>
              {relative}
            </span>
          ) : null}
        </div>
        <p className={styles.preview}>{post.content}</p>
        <div className={styles.meta}>
          <ul className={styles.platforms}>
            {sortPlatforms(post.platforms).map((platform) => (
              <li key={platform}>
                <PlatformIcon platform={platform} />
                <span>{PLATFORM_LABEL[platform]}</span>
              </li>
            ))}
          </ul>
          <span className={`${styles.pill} ${fresh ? styles.fresh : ""}`} data-status={post.status}>
            <StatusMark status={post.status} />
            {label}
          </span>
        </div>
        {post.status === "failed" && !retrying ? <p className={styles.error}>{post.errorMessage}</p> : null}
        {post.status === "failed" ? (
          <button
            type="button"
            className={styles.retry}
            aria-label={`Retry: ${clip(post.content)}`}
            onClick={() => onRetry(post)}
            disabled={retrying}
          >
            <RefreshCw size={16} aria-hidden="true" />
            {retrying ? "Retrying…" : "Retry"}
          </button>
        ) : null}
      </div>
      <div className={styles.side}>
        <div className={styles.menu} ref={menuRef}>
          <button
            type="button"
            className={styles.menuButton}
            aria-label="Post actions"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <MoreHorizontal size={16} aria-hidden="true" />
          </button>
          {menuOpen ? (
            <ul className={styles.menuList}>
              {["Edit", "Duplicate", "Delete"].map((action) => (
                <li key={action}>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false)
                      onDemo()
                    }}
                  >
                    {action}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        {post.mediaUrl && !broken ? (
          <img
            className={styles.thumb}
            src={post.mediaUrl}
            alt=""
            width={80}
            height={80}
            loading="lazy"
            decoding="async"
            onError={() => setBroken(true)}
          />
        ) : null}
        {post.mediaUrl && broken ? (
          <p className={styles.fallback}>
            <ImageOff size={16} aria-hidden="true" />
            Couldn’t load image
          </p>
        ) : null}
      </div>
    </article>
  )
}
