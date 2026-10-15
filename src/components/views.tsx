"use client"

import { useMemo, useState } from "react"
import { canEditPost, clipGraphemes, formatClock, localDayStart, STATUSES, type Post, type Status } from "@/lib/schedule"
import { PostCard, type CardAction } from "./post-card"
import styles from "./views.module.css"

type Handlers = {
  now: number
  pendingIds: readonly string[]
  freshIds: readonly string[]
  shakeIds: readonly string[]
  onRetry: (post: Post) => void
  onAction: (action: CardAction, post: Post) => void
}

function renderCard(post: Post, handlers: Handlers) {
  return (
    <PostCard
      key={post.id}
      post={post}
      now={handlers.now}
      retrying={handlers.pendingIds.includes(post.id)}
      fresh={handlers.freshIds.includes(post.id)}
      shake={handlers.shakeIds.includes(post.id)}
      onRetry={handlers.onRetry}
      onAction={handlers.onAction}
    />
  )
}

function startOfWeek(date: Date) {
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  day.setDate(day.getDate() - day.getDay())
  return day
}

function addDays(date: Date, count: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + count)
  return next
}

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6].map((offset) => {
  const sunday = new Date(2024, 0, 7)
  sunday.setDate(sunday.getDate() - sunday.getDay() + offset)
  return new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(sunday)
})

function dayKey(date: Date) {
  return localDayStart(date)
}

export function CalendarView({
  posts,
  onMove,
  ...handlers
}: Handlers & {
  posts: Post[]
  onMove: (post: Post, day: Date) => void
}) {
  const today = handlers.now > 0 ? new Date(handlers.now) : new Date()
  const [focus, setFocus] = useState(() => new Date())
  const [span, setSpan] = useState<"month" | "week">("month")
  const [selected, setSelected] = useState<string | null>(null)
  const [openDay, setOpenDay] = useState<number | null>(null)
  const [hoverDay, setHoverDay] = useState<number | null>(null)

  const byDay = useMemo(() => {
    const map = new Map<number, Post[]>()
    for (const post of posts) {
      const key = localDayStart(new Date(post.scheduledAt))
      const list = map.get(key)
      if (list) list.push(post)
      else map.set(key, [post])
    }
    for (const list of map.values()) list.sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt))
    return map
  }, [posts])

  const gridStart = span === "week" ? startOfWeek(focus) : startOfWeek(new Date(focus.getFullYear(), focus.getMonth(), 1))
  const days = Array.from({ length: span === "week" ? 7 : 42 }, (_, index) => addDays(gridStart, index))
  const title =
    span === "week"
      ? `${gridStart.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${addDays(gridStart, 6).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`
      : focus.toLocaleDateString(undefined, { month: "long", year: "numeric" })
  const active = posts.find((post) => post.id === selected) ?? null
  const todayKey = dayKey(today)

  return (
    <div className={styles.calendar}>
      <div className={styles.toolbar}>
        <h2>{title}</h2>
        <div className={styles.span} role="group" aria-label="Calendar range">
          <button type="button" aria-pressed={span === "month"} onClick={() => setSpan("month")}>
            Month
          </button>
          <button type="button" aria-pressed={span === "week"} onClick={() => setSpan("week")}>
            Week
          </button>
        </div>
        <div className={styles.nav}>
          <button
            type="button"
            onClick={() =>
              setFocus((current) =>
                span === "week" ? addDays(current, -7) : new Date(current.getFullYear(), current.getMonth() - 1, 1),
              )
            }
          >
            Previous
          </button>
          <button type="button" onClick={() => setFocus(new Date())}>
            Today
          </button>
          <button
            type="button"
            onClick={() =>
              setFocus((current) =>
                span === "week" ? addDays(current, 7) : new Date(current.getFullYear(), current.getMonth() + 1, 1),
              )
            }
          >
            Next
          </button>
        </div>
      </div>
      <div className={span === "week" ? `${styles.grid} ${styles.week}` : styles.grid} aria-label={title}>
        {WEEKDAYS.map((label) => (
          <div key={label} className={styles.weekday}>
            {label}
          </div>
        ))}
        {days.map((day) => {
          const key = dayKey(day)
          const items = byDay.get(key) ?? []
          const expanded = openDay === key
          const visible = expanded ? items : items.slice(0, 3)
          const extra = items.length - visible.length
          const outside = span === "month" && day.getMonth() !== focus.getMonth()
          return (
            <div
              key={key}
              className={`${styles.cell} ${hoverDay === key ? styles.drop : ""}`}
              data-today={key === todayKey ? "true" : undefined}
              data-outside={outside ? "true" : undefined}
              onDragOver={(event) => {
                event.preventDefault()
                setHoverDay(key)
              }}
              onDragLeave={() => setHoverDay((current) => (current === key ? null : current))}
              onDrop={(event) => {
                event.preventDefault()
                setHoverDay(null)
                const id = event.dataTransfer.getData("text/plain")
                const post = posts.find((item) => item.id === id)
                if (post) onMove(post, day)
              }}
            >
              <span className={styles.date}>{day.getDate()}</span>
              {visible.map((post) => (
                <button
                  key={post.id}
                  type="button"
                  className={styles.chip}
                  data-status={post.status}
                  draggable={canEditPost(post)}
                  aria-pressed={selected === post.id}
                  aria-label={`${formatClock(post.scheduledAt)}, ${clipGraphemes(post.content, 48)}`}
                  onDragStart={(event) => {
                    event.dataTransfer.setData("text/plain", post.id)
                    event.dataTransfer.effectAllowed = "move"
                  }}
                  onClick={() => setSelected(post.id)}
                >
                  <time dateTime={post.scheduledAt}>{formatClock(post.scheduledAt)}</time>
                  <span>{clipGraphemes(post.content, 22)}</span>
                </button>
              ))}
              {extra > 0 ? (
                <button type="button" className={styles.more} onClick={() => setOpenDay(key)}>
                  +{extra} more
                </button>
              ) : null}
            </div>
          )
        })}
      </div>
      {active ? (
        <div className={styles.detail}>
          <h3>Selected post</h3>
          {renderCard(active, handlers)}
        </div>
      ) : (
        <p className={styles.hint}>Select a post, or drag a chip onto another day. The clock time stays the same.</p>
      )}
    </div>
  )
}

const COLUMN_LABEL: Record<Status, string> = {
  scheduled: "Scheduled",
  published: "Published",
  failed: "Failed",
}

export function BoardView({ posts, ...handlers }: Handlers & { posts: Post[] }) {
  return (
    <div className={styles.board}>
      {STATUSES.map((status) => {
        const column = posts.filter((post) => post.status === status)
        return (
          <section key={status} className={styles.column} data-status={status} aria-label={COLUMN_LABEL[status]}>
            <h2>
              {COLUMN_LABEL[status]}
              <span>{column.length}</span>
            </h2>
            {column.length === 0 ? <p className={styles.hint}>Nothing in this column.</p> : column.map((post) => renderCard(post, handlers))}
          </section>
        )
      })}
    </div>
  )
}
