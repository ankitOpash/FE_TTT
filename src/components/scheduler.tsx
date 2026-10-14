"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Plus } from "lucide-react"
import { clearPosts, createPost, fetchPosts, invalidateQueue, queueToken, retryPost } from "@/lib/api"
import {
  asPlatform,
  asStatus,
  claimRetry,
  groupPosts,
  isCurrentAttempt,
  localZoneLabel,
  mergeQuery,
  PLATFORM_LABEL,
  PLATFORMS,
  releaseRetry,
  settleRetryFailure,
  settleRetrySuccess,
  STATUSES,
  visiblePosts,
  type Post,
} from "@/lib/schedule"
import { Composer } from "./composer"
import { clip, PostCard } from "./post-card"

type Notice = {
  id: number
  text: string
  tone: "success" | "error"
}

const STALE_QUEUE = "The queue changed in another tab. Reload to see the latest posts."

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
  const closeComposer = useCallback(() => setComposerOpen(false), [])
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [toast, setToast] = useState<Notice | null>(null)
  const [pendingIds, setPendingIds] = useState<string[]>([])
  const pendingRef = useRef<string[]>([])
  const attempts = useRef(new Map<string, number>())
  const toastSeq = useRef(0)
  const toastFocus = useRef(false)
  const toastRef = useRef<HTMLDivElement>(null)
  const paramsRef = useRef(searchParams.toString())
  const sentQuery = useRef(query)
  const searchTimer = useRef<number | null>(null)
  const [draft, setDraft] = useState(query)

  const writeParams = useCallback(
    (updates: Record<string, string>, history: "push" | "replace" = "replace") => {
      if ("q" in updates) sentQuery.current = updates.q
      const qs = mergeQuery(paramsRef.current, updates)
      paramsRef.current = qs
      const href = qs ? `${pathname}?${qs}` : pathname
      if (history === "push") router.push(href, { scroll: false })
      else router.replace(href, { scroll: false })
    },
    [pathname, router],
  )

  useEffect(() => {
    const rawPlatform = searchParams.get("platform")
    const rawStatus = searchParams.get("status")
    const updates: Record<string, string> = {}
    if (rawPlatform && !asPlatform(rawPlatform)) updates.platform = ""
    if (rawStatus && !asStatus(rawStatus)) updates.status = ""
    if (Object.keys(updates).length > 0) writeParams(updates)
  }, [searchParams, writeParams])

  useEffect(() => {
    if (query === sentQuery.current) return
    sentQuery.current = query
    setDraft(query)
  }, [query])

  useEffect(() => {
    function onPop() {
      paramsRef.current = window.location.search.replace(/^\?/, "")
    }
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [])

  function showToast(text: string, tone: Notice["tone"], moveFocus: boolean) {
    toastSeq.current += 1
    toastFocus.current = moveFocus
    setToast({ id: toastSeq.current, text, tone })
  }

  useEffect(() => {
    if (!toast) return
    if (toastFocus.current) toastRef.current?.focus()
    if (toast.tone !== "success") return
    const id = toast.id
    const timer = window.setTimeout(() => {
      setToast((current) => (current?.id === id ? null : current))
    }, 5000)
    return () => window.clearTimeout(timer)
  }, [toast])

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
    const token = queueToken()
    const saved = await createPost(post, token)
    if (!saved || queueToken() !== token) throw new Error(STALE_QUEUE)
    setPosts((current) => (current ? [saved, ...current.filter((item) => item.id !== saved.id)] : current))
    setComposerOpen(false)
    showToast("Scheduled. The post is on the queue.", "success", false)
  }

  async function onRetry(post: Post) {
    const claimed = claimRetry(pendingRef.current, post.id)
    if (!claimed) return
    const token = queueToken()
    pendingRef.current = claimed
    const attempt = (attempts.current.get(post.id) ?? 0) + 1
    attempts.current.set(post.id, attempt)
    setPendingIds(claimed)
    const optimistic = settleRetrySuccess(post, Date.now())
    const leaveFailedFilter = status === "failed"
    setPosts((current) => current?.map((item) => (item.id === post.id ? optimistic : item)) ?? current)
    try {
      const updated = await retryPost(post.id, token)
      if (queueToken() !== token || !isCurrentAttempt(attempts.current.get(post.id), attempt)) return
      if (!updated) {
        setPosts((current) => current?.map((item) => (item.id === post.id ? post : item)) ?? current)
        showToast(STALE_QUEUE, "error", true)
        return
      }
      setPosts((current) => current?.map((item) => (item.id === updated.id ? updated : item)) ?? current)
      const outcome = updated.status === "published" ? "marked published" : "back on the queue"
      showToast(`Retry saved. ${clip(post.content)} is ${outcome}.`, "success", leaveFailedFilter)
    } catch (error) {
      if (queueToken() !== token || !isCurrentAttempt(attempts.current.get(post.id), attempt)) return
      const restored = settleRetryFailure(post)
      setPosts((current) => current?.map((item) => (item.id === post.id ? restored : item)) ?? current)
      const message = error instanceof Error ? error.message : "Retry failed."
      showToast(message, "error", true)
    } finally {
      if (queueToken() !== token) return
      if (isCurrentAttempt(attempts.current.get(post.id), attempt)) {
        const released = releaseRetry(pendingRef.current, post.id)
        pendingRef.current = released
        setPendingIds(released)
      }
    }
  }

  function abandonQueue() {
    invalidateQueue()
    pendingRef.current = []
    setPendingIds([])
    setPosts(null)
  }

  function reload() {
    abandonQueue()
    setPhase("loading")
    setTick((value) => value + 1)
  }

  function onReset() {
    clearPosts()
    if (forceError) {
      abandonQueue()
      setPhase("loading")
      writeParams({ forceError: "" })
    } else reload()
  }

  function clearFilters() {
    if (searchTimer.current) window.clearTimeout(searchTimer.current)
    setDraft("")
    writeParams({ platform: "", status: "", q: "" }, "push")
  }

  const visible = posts ? visiblePosts(posts, { platform, status, q: draft }, pendingIds) : []
  const groups = groupPosts(visible)
  const activeCount = [platform, status, draft.trim()].filter(Boolean).length
  const filtersActive = activeCount > 0

  return (
    <div className="app">
      <header className="nav">
        <div className="brand">
          <p className="kicker">Social queue</p>
          <h1>Dispatch</h1>
        </div>
        <button type="button" className="primary" onClick={() => setComposerOpen(true)} disabled={phase !== "ready"}>
          <Plus size={16} aria-hidden="true" />
          New post
        </button>
      </header>

      <div className="layout">
        <aside className="panel">
          <button
            type="button"
            className="filters-toggle"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((open) => !open)}
          >
            {filtersOpen ? "Hide filters" : "Show filters"}
            {activeCount > 0 ? ` (${activeCount} active)` : ""}
          </button>
          <div className={filtersOpen ? "filters-body" : "filters-body is-collapsed"}>
          <form
            className="filters"
            onSubmit={(event) => event.preventDefault()}
            role="search"
          >
            <label>
              Search
              <input
                value={draft}
                onChange={(event) => {
                  const value = event.target.value
                  setDraft(value)
                  if (searchTimer.current) window.clearTimeout(searchTimer.current)
                  searchTimer.current = window.setTimeout(() => writeParams({ q: value }), 200)
                }}
                onBlur={(event) => {
                  if (searchTimer.current) window.clearTimeout(searchTimer.current)
                  writeParams({ q: event.target.value })
                }}
                placeholder="Search post text"
                type="search"
              />
            </label>
            <label>
              Platform
              <select
                value={platform}
                onChange={(event) => writeParams({ platform: event.target.value }, "push")}
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
              <select value={status} onChange={(event) => writeParams({ status: event.target.value }, "push")}>
                <option value="">All statuses</option>
                {STATUSES.map((item) => (
                  <option key={item} value={item}>
                    {item[0].toUpperCase() + item.slice(1)}
                  </option>
                ))}
              </select>
            </label>
          </form>
          </div>
          <p className="count">
            {phase === "ready"
              ? `${visible.length} of ${posts?.length ?? 0} posts`
              : phase === "error"
                ? "The queue did not load"
                : "Loading the queue"}
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
              onClick={clearFilters}
            >
              Clear filters
            </button>
          ) : null}
          <button type="button" className="text-button" onClick={onReset} disabled={phase === "loading"}>
            Reset demo data
          </button>
        </aside>

        <main className="queue" aria-busy={phase === "loading"}>
          <p className="lede">Compose once, pick the channels, and keep the week in one list.</p>
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
                    abandonQueue()
                    setPhase("loading")
                    writeParams({ forceError: "" })
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
                  onClick={clearFilters}
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
                        retrying={pendingIds.includes(post.id)}
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
        <Composer onClose={closeComposer} onCreate={onCreate} />
      ) : null}
      {toast ? (
        <div key={toast.id} className="toast" role="alert" tabIndex={-1} ref={toastRef}>
          <p>{toast.text}</p>
          <button type="button" className="toast-dismiss" onClick={() => setToast(null)}>
            Dismiss
          </button>
        </div>
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
