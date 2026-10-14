"use client"

import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { clearPosts, createPost, fetchPosts, retryPost, savePosts } from "@/lib/api"
import {
  asPlatform,
  asStatus,
  filterPosts,
  formatClock,
  groupPosts,
  LIMITS,
  localInputToUtc,
  localZoneLabel,
  PLATFORM_LABEL,
  PLATFORMS,
  scheduleBlockers,
  sortPlatforms,
  STATUSES,
  toLocalInputValue,
  type Platform,
  type Post,
} from "@/lib/schedule"

export default function Scheduler() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const forceError = searchParams.get("forceError") === "1"
  const platform = asPlatform(searchParams.get("platform"))
  const status = asStatus(searchParams.get("status"))
  const query = searchParams.get("q") ?? ""
  const [posts, setPosts] = useState<Post[] | null>(null)
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading")
  const [loadError, setLoadError] = useState("")
  const [tick, setTick] = useState(0)
  const [composerOpen, setComposerOpen] = useState(false)
  const [retryingId, setRetryingId] = useState<string | null>(null)

  const replaceParams = useCallback(
    (updates: Record<string, string>) => {
      const next = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(updates)) {
        if (value) next.set(key, value)
        else next.delete(key)
      }
      const qs = next.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [pathname, router, searchParams],
  )

  useEffect(() => {
    let gone = false
    fetchPosts(forceError).then(
      (data) => {
        if (gone) return
        setPosts(data)
        setPhase("ready")
      },
      (error: unknown) => {
        if (gone) return
        setPosts(null)
        setLoadError(error instanceof Error ? error.message : "Could not load the queue.")
        setPhase("error")
      },
    )
    return () => {
      gone = true
    }
  }, [forceError, tick])

  async function onCreate(post: Post) {
    await createPost()
    setPosts((current) => {
      const next = [post, ...(current ?? [])]
      savePosts(next)
      return next
    })
    setComposerOpen(false)
  }

  async function onRetry(post: Post) {
    if (retryingId) return
    setRetryingId(post.id)
    setPosts((current) =>
      (current ?? []).map((item) =>
        item.id === post.id ? { ...item, status: "scheduled", errorMessage: undefined } : item,
      ),
    )
    try {
      await retryPost()
      setPosts((current) => {
        const next = (current ?? []).map((item) =>
          item.id === post.id ? { ...post, status: "scheduled" as const, errorMessage: undefined } : item,
        )
        savePosts(next)
        return next
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Retry failed."
      setPosts((current) => {
        const next = (current ?? []).map((item) =>
          item.id === post.id ? { ...post, errorMessage: message } : item,
        )
        savePosts(next)
        return next
      })
    } finally {
      setRetryingId(null)
    }
  }

  function reload() {
    setPhase("loading")
    setPosts(null)
    setTick((value) => value + 1)
  }

  function onReset() {
    clearPosts()
    if (forceError) {
      setPhase("loading")
      setPosts(null)
      replaceParams({ forceError: "" })
    } else reload()
  }

  const visible = posts ? filterPosts(posts, { platform, status, q: query }) : []
  const groups = groupPosts(visible)
  const filtersActive = Boolean(platform || status || query)

  return (
    <div className="app">
      <header className="top">
        <div>
          <p className="kicker">Social queue</p>
          <h1>Dispatch</h1>
          <p className="lede">Compose once, pick the channels, and keep the week in one list.</p>
        </div>
        <button type="button" className="primary" onClick={() => setComposerOpen(true)} disabled={phase !== "ready"}>
          New post
        </button>
      </header>

      <div className="layout">
        <aside className="panel">
          <form
            className="filters"
            onSubmit={(event) => event.preventDefault()}
            role="search"
          >
            <label>
              Search
              <input
                value={query}
                onChange={(event) => replaceParams({ q: event.target.value })}
                placeholder="Search post text"
                type="search"
              />
            </label>
            <label>
              Platform
              <select
                value={platform}
                onChange={(event) => replaceParams({ platform: event.target.value })}
              >
                <option value="">All platforms</option>
                {PLATFORMS.map((item) => (
                  <option key={item} value={item}>
                    {PLATFORM_LABEL[item]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Status
              <select value={status} onChange={(event) => replaceParams({ status: event.target.value })}>
                <option value="">All statuses</option>
                {STATUSES.map((item) => (
                  <option key={item} value={item}>
                    {item[0].toUpperCase() + item.slice(1)}
                  </option>
                ))}
              </select>
            </label>
          </form>
          <p className="count">
            {phase === "ready" ? `${visible.length} of ${posts?.length ?? 0} posts` : "Loading the queue"}
          </p>
          <p className="zone">
            {phase === "ready"
              ? `Times shown in ${localZoneLabel()}.`
              : "Times are stored in UTC and shown in your timezone."}
          </p>
          {filtersActive ? (
            <button
              type="button"
              className="text-button"
              onClick={() => replaceParams({ platform: "", status: "", q: "" })}
            >
              Clear filters
            </button>
          ) : null}
          <button type="button" className="text-button" onClick={onReset} disabled={phase === "loading"}>
            Reset demo data
          </button>
        </aside>

        <main className="queue" aria-live="polite">
          {phase === "loading" ? <Loading /> : null}
          {phase === "error" ? (
            <div className="state">
              <h2>The queue did not load</h2>
              <p>{loadError}</p>
              <button
                type="button"
                className="primary"
                onClick={() => {
                  if (forceError) {
                    setPhase("loading")
                    setPosts(null)
                    replaceParams({ forceError: "" })
                  } else reload()
                }}
              >
                Try again
              </button>
            </div>
          ) : null}
          {phase === "ready" && visible.length === 0 ? (
            <div className="state">
              <h2>{posts && posts.length > 0 ? "Nothing matches" : "No posts yet"}</h2>
              <p>
                {posts && posts.length > 0
                  ? "Try another platform, status, or search."
                  : "Schedule a post and it will land on the day you picked."}
              </p>
              {filtersActive ? (
                <button
                  type="button"
                  className="primary"
                  onClick={() => replaceParams({ platform: "", status: "", q: "" })}
                >
                  Clear filters
                </button>
              ) : (
                <button type="button" className="primary" onClick={() => setComposerOpen(true)}>
                  New post
                </button>
              )}
            </div>
          ) : null}
          {phase === "ready"
            ? groups.map((group) => (
                <section key={group.label} className="day">
                  <h2>
                    {group.label}
                    <span>{group.posts.length}</span>
                  </h2>
                  <div className="cards">
                    {group.posts.map((post) => (
                      <PostCard
                        key={post.id}
                        post={post}
                        retrying={retryingId === post.id}
                        onRetry={onRetry}
                      />
                    ))}
                  </div>
                </section>
              ))
            : null}
        </main>
      </div>

      {composerOpen ? (
        <Composer onClose={() => setComposerOpen(false)} onCreate={onCreate} />
      ) : null}
    </div>
  )
}

function Loading() {
  return (
    <div className="skeleton" aria-hidden="true">
      <div />
      <div />
      <div />
      <div />
    </div>
  )
}

function PostCard({
  post,
  retrying,
  onRetry,
}: {
  post: Post
  retrying: boolean
  onRetry: (post: Post) => void
}) {
  const [broken, setBroken] = useState(false)
  return (
    <article className="card" data-status={post.status}>
      <div className="card-top">
        <time dateTime={post.scheduledAt}>{formatClock(post.scheduledAt)}</time>
        <span className={`pill pill-${post.status}`}>{retrying ? "retrying" : post.status}</span>
      </div>
      <p className="preview">{post.content}</p>
      {post.mediaUrl && !broken ? (
        <img
          className="thumb"
          src={post.mediaUrl}
          alt=""
          onError={() => setBroken(true)}
        />
      ) : null}
      <ul className="platforms">
        {sortPlatforms(post.platforms).map((platform) => (
          <li key={platform}>
            <PlatformIcon platform={platform} />
            <span>{PLATFORM_LABEL[platform]}</span>
          </li>
        ))}
      </ul>
      {post.status === "failed" && post.errorMessage ? (
        <p className="error-line" role="status">
          {post.errorMessage}
        </p>
      ) : null}
      {post.status === "failed" ? (
        <button type="button" className="retry" onClick={() => onRetry(post)} disabled={retrying}>
          Retry
        </button>
      ) : null}
    </article>
  )
}

function Composer({
  onClose,
  onCreate,
}: {
  onClose: () => void
  onCreate: (post: Post) => Promise<void>
}) {
  const titleId = useId()
  const fieldRef = useRef<HTMLTextAreaElement>(null)
  const [content, setContent] = useState("")
  const [platforms, setPlatforms] = useState<Platform[]>(["instagram"])
  const [mediaUrl, setMediaUrl] = useState("")
  const [when, setWhen] = useState(() => toLocalInputValue(new Date(Date.now() + 60 * 60 * 1000)))
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState("")
  const [min] = useState(() => toLocalInputValue(new Date(Date.now() + 60 * 1000)))
  const scheduledAt = localInputToUtc(when)
  const blockers = scheduleBlockers({ content, platforms, scheduledAt })

  useEffect(() => {
    fieldRef.current?.focus()
  }, [])

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener("keydown", onKey)
    }
  }, [onClose])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (blockers.length > 0 || saving) return
    setSaving(true)
    setFormError("")
    const post: Post = {
      id: crypto.randomUUID(),
      content,
      platforms: sortPlatforms(platforms),
      scheduledAt,
      status: "scheduled",
    }
    const image = mediaUrl.trim()
    if (image) post.mediaUrl = image
    try {
      await onCreate(post)
    } catch (error) {
      setSaving(false)
      setFormError(error instanceof Error ? error.message : "Could not schedule this post.")
    }
  }

  return (
    <div className="composer">
      <button type="button" className="backdrop" aria-label="Close composer" onClick={onClose} />
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="dialog"
        onSubmit={onSubmit}
      >
        <div className="dialog-head">
          <h2 id={titleId}>New post</h2>
          <button type="button" className="text-button" onClick={onClose}>
            Close
          </button>
        </div>
        <label>
          Post
          <textarea
            ref={fieldRef}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            rows={6}
            placeholder="Write the caption"
          />
        </label>
        <fieldset>
          <legend>Platforms</legend>
          <div className="choices">
            {PLATFORMS.map((platform) => {
              const selected = platforms.includes(platform)
              return (
                <button
                  key={platform}
                  type="button"
                  className="choice"
                  aria-pressed={selected}
                  onClick={() =>
                    setPlatforms((current) =>
                      current.includes(platform)
                        ? current.filter((item) => item !== platform)
                        : [...current, platform],
                    )
                  }
                >
                  <PlatformIcon platform={platform} />
                  {PLATFORM_LABEL[platform]}
                </button>
              )
            })}
          </div>
        </fieldset>
        {platforms.length > 0 ? (
          <ul className="counters">
            {sortPlatforms(platforms).map((platform) => {
              const limit = LIMITS[platform]
              const over = content.length > limit
              const width = Math.min(content.length / limit, 1) * 100
              return (
                <li key={platform} data-over={over}>
                  <span>{PLATFORM_LABEL[platform]}</span>
                  <span className="meter" aria-hidden="true">
                    <span style={{ width: `${width}%` }} />
                  </span>
                  <span>
                    {content.length.toLocaleString()} / {limit.toLocaleString()}
                  </span>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="hint">Select a platform to see its character limit.</p>
        )}
        <label>
          Image URL
          <input
            value={mediaUrl}
            onChange={(event) => setMediaUrl(event.target.value)}
            placeholder="https://example.com/photo.jpg"
            inputMode="url"
          />
        </label>
        {mediaUrl.trim() ? <MediaPreview url={mediaUrl.trim()} /> : null}
        <label>
          Schedule
          <input type="datetime-local" value={when} min={min} onChange={(event) => setWhen(event.target.value)} required />
        </label>
        <p className="hint">Saved in UTC. The queue shows this time in your timezone.</p>
        {blockers.length > 0 ? (
          <ul className="blockers">
            {blockers.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        ) : null}
        {formError ? <p className="error-line">{formError}</p> : null}
        <button type="submit" className="primary" disabled={blockers.length > 0 || saving}>
          {saving ? "Scheduling…" : "Schedule post"}
        </button>
      </form>
    </div>
  )
}

function MediaPreview({ url }: { url: string }) {
  const [broken, setBroken] = useState(false)
  if (broken) return <p className="hint">That image URL did not load. You can still schedule the post.</p>
  return <img className="preview-image" src={url} alt="" onError={() => setBroken(true)} />
}

function PlatformIcon({ platform }: { platform: Platform }) {
  return (
    <svg className={`mark mark-${platform}`} viewBox="0 0 24 24" aria-hidden="true">
      {platform === "facebook" ? (
        <path d="M14.5 8.5H16V6h-1.8C11.7 6 11 7.2 11 9.1V10H9v2.5h2V18h2.6v-5.5h1.8l.4-2.5H13.6V9.2c0-.5.2-.7.9-.7Z" />
      ) : null}
      {platform === "instagram" ? (
        <>
          <rect x="4.5" y="4.5" width="15" height="15" rx="4" />
          <circle cx="12" cy="12" r="3.3" />
          <circle className="mark-dot" cx="16.6" cy="7.5" r="0.9" />
        </>
      ) : null}
      {platform === "x" ? (
        <path d="M6 6.5 10.7 12 6.2 17.5h1.8l3.4-4 2.8 4H18l-4.8-6.3L17.6 6.5h-1.8l-3 3.6-2.5-3.6H6Z" />
      ) : null}
      {platform === "tiktok" ? (
        <path d="M14 6c.4 2.2 1.6 3.4 3.5 3.6v2.2c-1.2 0-2.3-.4-3.3-1.1v5.1a4.6 4.6 0 1 1-4.6-4.6c.3 0 .5 0 .8.1v2.4a2.2 2.2 0 1 0 1.6 2.1V6H14Z" />
      ) : null}
    </svg>
  )
}
