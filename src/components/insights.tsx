"use client"

import { useState } from "react"
import {
  busiestPublishedHour,
  clipGraphemes,
  currentWeekActivity,
  formatClock,
  localZoneLabel,
  nextPostWhen,
  nextScheduledPost,
  PLATFORM_LABEL,
  publishingHealth,
  type Post,
} from "@/lib/schedule"
import { PlatformIcon } from "./platform-icon"
import styles from "./insights.module.css"

function LibraryImage({ src }: { src: string }) {
  const [broken, setBroken] = useState(false)
  if (broken) return <span className={styles.missing}>Image unavailable</span>
  return <img src={src} alt="" onError={() => setBroken(true)} />
}

export function MediaLibrary({ posts, onOpen }: { posts: Post[]; onOpen: (post: Post) => void }) {
  const items = posts.filter((post) => post.mediaUrl)
  if (items.length === 0) return <p className={styles.note}>No images in this queue.</p>
  return (
    <ul className={styles.library}>
      {items.map((post) => (
        <li key={post.id}>
          <button type="button" onClick={() => onOpen(post)}>
            <LibraryImage src={post.mediaUrl ?? ""} />
            <span>{clipGraphemes(post.content, 72)}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

export function Insights({
  posts,
  now,
  embedded = false,
  hideNext = false,
}: {
  posts: Post[]
  now: number
  embedded?: boolean
  hideNext?: boolean
}) {
  const when = now > 0 ? new Date(now) : null
  const health = publishingHealth(posts)
  const bars = when ? currentWeekActivity(posts, when) : []
  const peak = Math.max(1, ...bars.map((bar) => bar.published + bar.failed))
  const next = when ? nextScheduledPost(posts, when.getTime()) : null
  const busy = busiestPublishedHour(posts)
  const busyLabel = busy
    ? new Date(2026, 0, 1, busy.hour, 0, 0).toLocaleTimeString(undefined, { hour: "numeric" })
    : ""
  const offset = when ? (/\(([^)]+)\)/.exec(localZoneLabel(when))?.[1] ?? "") : ""

  return (
    <aside className={embedded ? styles.embedded : styles.rail} aria-label="Queue insights">
      <section className={styles.card}>
        <header>
          <h2>Publishing health</h2>
          <p>Resolved posts in this queue. Bars count this week only.</p>
        </header>
        <p className={styles.rate}>
          <strong>{health.rate}%</strong>
          <span>published of posts that already resolved</span>
        </p>
        <div className={styles.bars} aria-hidden="true">
          {bars.map((bar, index) => (
            <div key={index} className={styles.barCol}>
              <div className={styles.track}>
                <span className={styles.failed} style={{ height: `${(bar.failed / peak) * 100}%` }} />
                <span className={styles.published} style={{ height: `${(bar.published / peak) * 100}%` }} />
              </div>
              <span>{bar.label}</span>
            </div>
          ))}
        </div>
        <p className={styles.legend}>
          <span>Published {health.published}</span>
          <span>Failed {health.failed}</span>
        </p>
      </section>
      {busy ? (
        <section className={styles.card}>
          <h2>Busiest hour</h2>
          <p className={styles.hour}>{busyLabel}</p>
          <p className={styles.note}>
            {busy.count} published {busy.count === 1 ? "post lands" : "posts land"} in this hour. Local time ({offset}).
          </p>
        </section>
      ) : null}
      {hideNext ? null : (
      <section className={styles.card}>
        <h2>Next scheduled post</h2>
        {next ? (
          <>
            <p className={styles.hour}>
              <time dateTime={next.scheduledAt}>{when ? nextPostWhen(next.scheduledAt, when) : formatClock(next.scheduledAt)}</time>
            </p>
            <p className={styles.note}>{clipGraphemes(next.content, 90)}</p>
            <ul className={styles.platforms}>
              {next.platforms.map((platform) => (
                <li key={platform}>
                  <PlatformIcon platform={platform} />
                  {PLATFORM_LABEL[platform]}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className={styles.note}>Nothing is scheduled after the current time.</p>
        )}
      </section>
      )}
    </aside>
  )
}
