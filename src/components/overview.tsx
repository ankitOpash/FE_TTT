"use client"

import { RefreshCw } from "lucide-react"
import {
  clipGraphemes,
  formatClock,
  formatRelative,
  PLATFORM_LABEL,
  sortPlatforms,
  type Post,
  type Status,
} from "@/lib/schedule"
import { Insights } from "./insights"
import { PlatformIcon } from "./platform-icon"
import { StatsStrip } from "./stats-strip"
import styles from "./overview.module.css"

function relativeAside(iso: string, when: Date | null): string {
  if (!when) return ""
  const clock = formatClock(iso)
  const relative = formatRelative(iso, when)
  if (relative === clock) return ""
  return relative.endsWith(clock) ? relative.slice(0, -clock.length).trim() : relative
}

export function Overview({
  posts,
  now,
  pendingIds,
  onRetry,
  onRetryAll,
  onOpenQueue,
}: {
  posts: Post[]
  now: number
  pendingIds: readonly string[]
  onRetry: (post: Post) => void
  onRetryAll: () => void
  onOpenQueue: (status: Status | "") => void
}) {
  const when = now > 0 ? new Date(now) : null
  const counts = {
    scheduled: posts.filter((post) => post.status === "scheduled").length,
    published: posts.filter((post) => post.status === "published").length,
    failed: posts.filter((post) => post.status === "failed").length,
  }
  const failed = posts.filter((post) => post.status === "failed")
  const upcoming = posts
    .filter((post) => post.status === "scheduled" && (when == null || new Date(post.scheduledAt).getTime() >= when.getTime()))
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
    .slice(0, 4)

  return (
    <div className={styles.overview}>
      <StatsStrip counts={counts} status="" retrying={pendingIds.length > 0} onStatus={onOpenQueue} onRetryAll={onRetryAll} />
      <div className={styles.split}>
        <section className={styles.panel} aria-labelledby="needs-attention">
          <header>
            <h2 id="needs-attention">Needs attention</h2>
            <button type="button" onClick={() => onOpenQueue("failed")}>
              Show in queue
            </button>
          </header>
          {failed.length === 0 ? <p className={styles.empty}>No failed posts.</p> : null}
          <ul>
            {failed.map((post) => {
              const retrying = pendingIds.includes(post.id)
              return (
                <li key={post.id}>
                  <div>
                    <time dateTime={post.scheduledAt}>{formatClock(post.scheduledAt)}</time>
                    {relativeAside(post.scheduledAt, when) ? <span>{relativeAside(post.scheduledAt, when)}</span> : null}
                    <p>{clipGraphemes(post.content, 110)}</p>
                    <p className={styles.error}>{post.errorMessage}</p>
                  </div>
                  <button type="button" disabled={retrying} aria-label={`Retry: ${clipGraphemes(post.content, 48)}`} onClick={() => onRetry(post)}>
                    <RefreshCw size={16} aria-hidden="true" />
                    {retrying ? "Retrying…" : "Retry"}
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
        <section className={styles.panel} aria-labelledby="up-next">
          <header>
            <h2 id="up-next">Up next</h2>
            <button type="button" onClick={() => onOpenQueue("scheduled")}>
              Show in queue
            </button>
          </header>
          {upcoming.length === 0 ? <p className={styles.empty}>Nothing is scheduled after the current time.</p> : null}
          <ul>
            {upcoming.map((post) => (
              <li key={post.id}>
                <div>
                  <time dateTime={post.scheduledAt}>{formatClock(post.scheduledAt)}</time>
                  {relativeAside(post.scheduledAt, when) ? <span>{relativeAside(post.scheduledAt, when)}</span> : null}
                  <p>{clipGraphemes(post.content, 110)}</p>
                  <ul className={styles.platforms}>
                    {sortPlatforms(post.platforms).map((platform) => (
                      <li key={platform}>
                        <PlatformIcon platform={platform} />
                        {PLATFORM_LABEL[platform]}
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <Insights posts={posts} now={now} embedded hideNext />
    </div>
  )
}
