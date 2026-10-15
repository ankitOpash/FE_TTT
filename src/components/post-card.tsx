"use client"

import { useEffect, useId, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { AlertCircle, Check, ImageOff, MoreHorizontal, RefreshCw, X } from "lucide-react"
import {
  canEditPost,
  clipGraphemes,
  formatClock,
  formatExactTimes,
  formatRelative,
  formatScheduleSummary,
  LIMITS,
  localZoneLabel,
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

export type CardAction = "edit" | "duplicate" | "delete"

const MENU = ["View", "Edit", "Duplicate", "Delete"] as const

function StatusMark({ status }: { status: Status }) {
  if (status === "published") return <Check size={12} aria-hidden="true" />
  if (status === "failed") return <AlertCircle size={12} aria-hidden="true" />
  return <span className={styles.pulse} aria-hidden="true" />
}

export function PostCard({
  post,
  now,
  retrying,
  duplicating,
  fresh,
  shake,
  onRetry,
  onAction,
}: {
  post: Post
  now: number
  retrying: boolean
  duplicating: boolean
  fresh: boolean
  shake: boolean
  onRetry: (post: Post) => void
  onAction: (action: CardAction, post: Post) => void
}) {
  const [broken, setBroken] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [lightbox, setLightbox] = useState(false)
  const [viewing, setViewing] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const clock = formatClock(post.scheduledAt)
  const relative = now > 0 ? formatRelative(post.scheduledAt, new Date(now)) : ""
  const exact = formatExactTimes(post.scheduledAt)
  const offset = /\(([^)]+)\)/.exec(localZoneLabel())?.[1] ?? ""
  const label = post.status[0].toUpperCase() + post.status.slice(1)
  const showRetry = post.status === "failed" || retrying
  const editable = canEditPost(post)

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

  useEffect(() => {
    if (!lightbox && !viewing) return
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    closeRef.current?.focus()
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setLightbox(false)
        setViewing(false)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener("keydown", onKey)
    }
  }, [lightbox, viewing])

  return (
    <article
      id={post.id}
      className={`${styles.card} ${retrying ? styles.busy : ""} ${shake ? styles.shake : ""} ${menuOpen ? styles.raised : ""}`}
      data-status={post.status}
      aria-busy={retrying}
    >
      <div className={styles.when}>
        <time dateTime={post.scheduledAt}>{clock}</time>
        {relative ? (
          <span className={styles.relative} title={exact}>
            {relative}
          </span>
        ) : null}
        {offset ? <span className={styles.zone}>Local time ({offset})</span> : null}
      </div>
      <div className={styles.main}>
        <p className={styles.preview}>{post.content}</p>
        <div className={styles.meta}>
          <ul className={styles.platforms}>
            {sortPlatforms(post.platforms).map((platform) => {
              const tip = `${PLATFORM_LABEL[platform]} · ${LIMITS[platform].toLocaleString()} character limit${post.mediaUrl ? " · image attached" : ""}`
              return (
                <li key={platform} className={styles.platform} data-platform={platform} title={tip}>
                  <PlatformIcon platform={platform} />
                  <span>{PLATFORM_LABEL[platform]}</span>
                  <span className={styles.tip} aria-hidden="true">
                    {tip}
                  </span>
                </li>
              )
            })}
          </ul>
          <span className={`${styles.pill} ${fresh && !retrying ? styles.fresh : ""}`} data-status={retrying ? "retrying" : post.status}>
            {retrying ? <RefreshCw size={12} className={styles.spin} aria-hidden="true" /> : <StatusMark status={post.status} />}
            {retrying ? "Retrying…" : label}
          </span>
          {showRetry ? (
            <button
              type="button"
              className={styles.retry}
              aria-label={`Retry: ${clip(post.content)}`}
              onClick={() => onRetry(post)}
              disabled={retrying}
            >
              <RefreshCw size={16} className={retrying ? styles.spin : undefined} aria-hidden="true" />
              {retrying ? "Retrying…" : "Retry"}
            </button>
          ) : null}
        </div>
        {post.status === "failed" && !retrying ? <p className={styles.error}>{post.errorMessage}</p> : null}
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
              {MENU.map((action) => (
                <li key={action}>
                  <button
                    type="button"
                    disabled={
                      (retrying && action !== "View") ||
                      (action === "Edit" && !editable) ||
                      (action === "Duplicate" && duplicating)
                    }
                    title={action === "Edit" && !editable ? "Already published. Duplicate it to schedule a change." : undefined}
                    aria-label={action === "Edit" && !editable ? "Edit unavailable. This post is already published." : undefined}
                    onClick={() => {
                      setMenuOpen(false)
                      if (action === "View") setViewing(true)
                      else onAction(action.toLowerCase() as CardAction, post)
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
          <button type="button" className={styles.thumbButton} aria-label="Expand image" onClick={() => setLightbox(true)}>
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
          </button>
        ) : null}
        {post.mediaUrl && broken ? (
          <p className={styles.fallback}>
            <ImageOff size={16} aria-hidden="true" />
            Couldn’t load image
          </p>
        ) : null}
      </div>
      {viewing
        ? createPortal(
            <div className={styles.lightbox} role="dialog" aria-modal="true" aria-labelledby={titleId}>
              <button type="button" className={styles.lightboxBackdrop} aria-label="Close post" onClick={() => setViewing(false)} />
              <div className={styles.lightboxFrame}>
                <h2 id={titleId} className={styles.lightboxTitle}>
                  View post
                </h2>
                <p className={styles.viewerWhen}>
                  <time dateTime={post.scheduledAt}>{formatScheduleSummary(post.scheduledAt)}</time>
                </p>
                <p className={styles.viewerCopy}>{post.content}</p>
                <ul className={styles.platforms}>
                  {sortPlatforms(post.platforms).map((platform) => (
                    <li key={platform} className={styles.platform}>
                      <PlatformIcon platform={platform} />
                      <span>{PLATFORM_LABEL[platform]}</span>
                    </li>
                  ))}
                </ul>
                <p className={styles.viewerStatus}>{label}</p>
                {post.status === "failed" ? <p className={styles.error}>{post.errorMessage}</p> : null}
                {post.mediaUrl && !broken ? <img src={post.mediaUrl} alt="" onError={() => setBroken(true)} /> : null}
                <button ref={closeRef} type="button" onClick={() => setViewing(false)}>
                  <X size={16} aria-hidden="true" />
                  Close
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
      {lightbox && post.mediaUrl
        ? createPortal(
            <div className={styles.lightbox} role="dialog" aria-modal="true" aria-labelledby={titleId}>
              <button type="button" className={styles.lightboxBackdrop} aria-label="Close image" onClick={() => setLightbox(false)} />
              <div className={styles.lightboxFrame}>
                <h2 id={titleId} className={styles.lightboxTitle}>
                  Image preview
                </h2>
                <img src={post.mediaUrl} alt="" />
                <button ref={closeRef} type="button" onClick={() => setLightbox(false)}>
                  <X size={16} aria-hidden="true" />
                  Close
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </article>
  )
}
