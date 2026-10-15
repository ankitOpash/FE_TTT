"use client"

import { useState } from "react"
import { isEarlierGroup, type Post } from "@/lib/schedule"
import { PostCard } from "./post-card"
import styles from "./queue-list.module.css"

function DaySection({
  label,
  posts,
  now,
  pendingIds,
  freshIds,
  shakeIds,
  onRetry,
  onDemo,
}: {
  label: string
  posts: Post[]
  now: number
  pendingIds: readonly string[]
  freshIds: readonly string[]
  shakeIds: readonly string[]
  onRetry: (post: Post) => void
  onDemo: () => void
}) {
  return (
    <section className={styles.day} aria-label={`${label}, ${posts.length} ${posts.length === 1 ? "post" : "posts"}`}>
      <h2 className={styles.head}>
        {label}
        <span>· {posts.length} {posts.length === 1 ? "post" : "posts"}</span>
      </h2>
      <div className={styles.cards}>
        {posts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            now={now}
            retrying={pendingIds.includes(post.id)}
            fresh={freshIds.includes(post.id)}
            shake={shakeIds.includes(post.id)}
            onRetry={onRetry}
            onDemo={onDemo}
          />
        ))}
      </div>
    </section>
  )
}

export function QueueSkeleton() {
  return (
    <div className={styles.skeleton} aria-hidden="true">
      <div />
      <div />
      <div />
      <div />
    </div>
  )
}

export function QueueList({
  groups,
  now,
  forceEarlier,
  pendingIds,
  freshIds,
  shakeIds,
  onRetry,
  onDemo,
}: {
  groups: { label: string; posts: Post[] }[]
  now: number
  forceEarlier: boolean
  pendingIds: readonly string[]
  freshIds: readonly string[]
  shakeIds: readonly string[]
  onRetry: (post: Post) => void
  onDemo: () => void
}) {
  const [open, setOpen] = useState(false)
  const clock = now > 0 ? new Date(now) : null
  const upcoming = clock ? groups.filter((group) => !isEarlierGroup(group, clock)) : groups
  const earlier = clock ? groups.filter((group) => isEarlierGroup(group, clock)) : []
  const earlierCount = earlier.reduce((sum, group) => sum + group.posts.length, 0)
  const shared = { now, pendingIds, freshIds, shakeIds, onRetry, onDemo }

  return (
    <div className={styles.list}>
      {upcoming.map((group) => (
        <DaySection key={group.label} label={group.label} posts={group.posts} {...shared} />
      ))}
      {earlierCount > 0 ? (
        <section className={styles.earlier}>
          {forceEarlier ? null : (
            <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
              Earlier · {earlierCount} {earlierCount === 1 ? "post" : "posts"}
            </button>
          )}
          {forceEarlier || open
            ? earlier.map((group) => (
                <DaySection key={group.label} label={group.label} posts={group.posts} {...shared} />
              ))
            : null}
        </section>
      ) : null}
    </div>
  )
}
