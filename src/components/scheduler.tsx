"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Plus } from "lucide-react"
import { clearPosts, createPost, fetchPosts, invalidateQueue, queueStorageChanged, queueToken, retryPost } from "@/lib/api"
import {
  asStatus,
  claimRetry,
  formatPlatformParam,
  groupPosts,
  isCurrentAttempt,
  localZoneLabel,
  mergeQuery,
  parsePlatforms,
  releaseRetry,
  settleRetryFailure,
  settleRetrySuccess,
  visiblePosts,
  type Platform,
  type Post,
  type Status,
} from "@/lib/schedule"
import { useNow } from "./clock"
import { CommandPalette } from "./command-palette"
import { Composer } from "./composer"
import { FilterBar } from "./filter-bar"
import { clip } from "./post-card"
import { QueueList, QueueSkeleton } from "./queue-list"
import { StatsStrip } from "./stats-strip"
import { toggleTheme } from "./theme"
import { TopBar } from "./top-bar"
import styles from "./scheduler.module.css"

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
  const now = useNow()
  const forceError = searchParams.get("forceError") === "1"
  const platforms = parsePlatforms(searchParams.get("platform"))
  const status = asStatus(searchParams.get("status"))
  const query = searchParams.get("q") ?? ""
  const [posts, setPosts] = useState<Post[] | null>(null)
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading")
  const [loadError, setLoadError] = useState("")
  const [tick, setTick] = useState(0)
  const [composerOpen, setComposerOpen] = useState(false)
  const closeComposer = useCallback(() => setComposerOpen(false), [setComposerOpen])
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [toast, setToast] = useState<Notice | null>(null)
  const [pendingIds, setPendingIds] = useState<string[]>([])
  const [freshIds, setFreshIds] = useState<string[]>([])
  const [shakeIds, setShakeIds] = useState<string[]>([])
  const pendingRef = useRef<string[]>([])
  const attempts = useRef(new Map<string, number>())
  const toastSeq = useRef(0)
  const toastFocus = useRef(false)
  const toastRef = useRef<HTMLDivElement>(null)
  const paramsRef = useRef(searchParams.toString())
  const sentQuery = useRef(query)
  const searchTimer = useRef<number | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
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
    const canonical = formatPlatformParam(parsePlatforms(rawPlatform))
    if ((rawPlatform ?? "") !== canonical) updates.platform = canonical
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

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const meta = event.metaKey || event.ctrlKey
      if (meta && event.key.toLowerCase() === "k") {
        if (composerOpen) return
        event.preventDefault()
        setPaletteOpen((open) => !open)
        return
      }
      const target = event.target
      const typing =
        target instanceof HTMLElement && Boolean(target.closest("input, textarea, select, [contenteditable='true']"))
      if (typing || composerOpen || paletteOpen) return
      if (event.key === "/") {
        event.preventDefault()
        searchRef.current?.focus()
        return
      }
      if ((event.key === "n" || event.key === "N") && !meta && !event.altKey && phase === "ready") {
        event.preventDefault()
        setComposerOpen(true)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [composerOpen, paletteOpen, phase])

  function flash(id: string, setList: (value: string[] | ((current: string[]) => string[])) => void) {
    setList((current) => (current.includes(id) ? current : [...current, id]))
    window.setTimeout(() => {
      setList((current) => current.filter((item) => item !== id))
    }, 700)
  }

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
    const currentAttempt = () => isCurrentAttempt(attempts.current.get(post.id), attempt)
    const restoreOriginal = () => {
      setPosts((current) => current?.map((item) => (item.id === post.id ? post : item)) ?? current)
    }
    setPosts((current) => current?.map((item) => (item.id === post.id ? optimistic : item)) ?? current)
    flash(post.id, setFreshIds)
    try {
      const updated = await retryPost(post.id, token)
      if (!currentAttempt()) return
      if (queueToken() !== token || !updated) {
        restoreOriginal()
        showToast(STALE_QUEUE, "error", true)
        return
      }
      setPosts((current) => current?.map((item) => (item.id === updated.id ? updated : item)) ?? current)
      const outcome = updated.status === "published" ? "marked published" : "back on the queue"
      showToast(`Retry saved. ${clip(post.content)} is ${outcome}.`, "success", leaveFailedFilter)
    } catch (error) {
      if (!currentAttempt()) return
      if (queueToken() !== token) {
        restoreOriginal()
        showToast(STALE_QUEUE, "error", true)
        return
      }
      const restored = settleRetryFailure(post)
      setPosts((current) => current?.map((item) => (item.id === post.id ? restored : item)) ?? current)
      flash(post.id, setShakeIds)
      const message = error instanceof Error ? error.message : "Retry failed."
      showToast(message, "error", true)
    } finally {
      if (!currentAttempt()) return
      const released = releaseRetry(pendingRef.current, post.id)
      pendingRef.current = released
      setPendingIds(released)
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

  useEffect(() => {
    let timer = 0
    function onStorage(event: StorageEvent) {
      if (!queueStorageChanged(event.key)) return
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        pendingRef.current = []
        setPendingIds([])
        setPosts(null)
        setPhase("loading")
        setTick((value) => value + 1)
      }, 50)
    }
    window.addEventListener("storage", onStorage)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener("storage", onStorage)
    }
  }, [])

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

  function togglePlatform(platform: Platform) {
    const next = platforms.includes(platform)
      ? platforms.filter((item) => item !== platform)
      : [...platforms, platform]
    writeParams({ platform: formatPlatformParam(next) }, "push")
  }

  function selectStatus(next: Status | "") {
    if (next === status) return
    writeParams({ status: next }, "push")
  }

  function retryAll() {
    if (!posts) return
    for (const post of posts) {
      if (post.status === "failed") void onRetry(post)
    }
  }

  const visible = posts ? visiblePosts(posts, { platforms, status, q: draft }, pendingIds) : []
  const groups = posts ? groupPosts(visible, now > 0 ? new Date(now) : new Date()) : []
  const filtersActive = platforms.length > 0 || Boolean(status) || Boolean(draft.trim())
  const counts = {
    all: posts?.length ?? 0,
    scheduled: posts?.filter((post) => post.status === "scheduled").length ?? 0,
    published: posts?.filter((post) => post.status === "published").length ?? 0,
    failed: posts?.filter((post) => post.status === "failed").length ?? 0,
  }

  return (
    <div className={styles.shell}>
      <TopBar
        query={draft}
        inputRef={searchRef}
        ready={phase === "ready"}
        onQuery={(value) => {
          setDraft(value)
          if (searchTimer.current) window.clearTimeout(searchTimer.current)
          searchTimer.current = window.setTimeout(() => writeParams({ q: value }), 200)
        }}
        onQueryBlur={(value) => {
          if (searchTimer.current) window.clearTimeout(searchTimer.current)
          writeParams({ q: value })
        }}
        onNew={() => setComposerOpen(true)}
        onTheme={toggleTheme}
        onPalette={() => setPaletteOpen(true)}
      />

      {phase === "ready" ? (
        <>
          <StatsStrip
            counts={counts}
            status={status}
            retrying={pendingIds.length > 0}
            onStatus={(next) => selectStatus(next)}
            onRetryAll={retryAll}
          />
          <FilterBar
            platforms={platforms}
            status={status}
            query={draft}
            counts={counts}
            showing={visible.length}
            total={posts?.length ?? 0}
            open={filtersOpen}
            onOpenChange={setFiltersOpen}
            onTogglePlatform={togglePlatform}
            onClearPlatforms={() => {
              if (platforms.length === 0) return
              writeParams({ platform: "" }, "push")
            }}
            onStatus={selectStatus}
            onClear={clearFilters}
            onClearQuery={() => {
              if (searchTimer.current) window.clearTimeout(searchTimer.current)
              setDraft("")
              writeParams({ q: "" })
            }}
          />
          <p className={styles.zone}>Times shown in {localZoneLabel()}.</p>
        </>
      ) : null}

      <main aria-busy={phase === "loading"}>
        {phase === "loading" ? <QueueSkeleton /> : null}
        {phase === "error" ? (
          <div className={styles.state}>
            <h2>The queue did not load</h2>
            <p>{loadError}</p>
            <button
              type="button"
              className={styles.primary}
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
          <div className={styles.state}>
            <EmptyMark />
            <h2>{posts && posts.length > 0 ? "No posts match" : "No posts yet"}</h2>
            <p>
              {posts && posts.length > 0
                ? "Nothing in the queue matches these filters."
                : "Schedule a post and it will land on the day you picked."}
            </p>
            {filtersActive ? (
              <button type="button" className={styles.primary} onClick={clearFilters}>
                Clear filters
              </button>
            ) : (
              <button type="button" className={styles.primary} onClick={() => setComposerOpen(true)}>
                New post
              </button>
            )}
          </div>
        ) : null}
        {phase === "ready" && visible.length > 0 ? (
          <QueueList
            groups={groups}
            now={now}
            forceEarlier={filtersActive}
            pendingIds={pendingIds}
            freshIds={freshIds}
            shakeIds={shakeIds}
            onRetry={onRetry}
            onDemo={() => showToast("This demo does not save that action.", "success", false)}
          />
        ) : null}
      </main>

      <button type="button" className={styles.quiet} onClick={onReset} disabled={phase === "loading"}>
        Reset demo data
      </button>

      <button type="button" className={styles.fab} onClick={() => setComposerOpen(true)} disabled={phase !== "ready"}>
        <Plus size={16} aria-hidden="true" />
        New post
      </button>

      {composerOpen ? <Composer onClose={closeComposer} onCreate={onCreate} /> : null}
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onNew={() => {
          if (phase === "ready") setComposerOpen(true)
        }}
        onSearch={() => searchRef.current?.focus()}
        onTheme={toggleTheme}
      />
      {toast ? (
        <div key={toast.id} className={styles.toast} role="alert" tabIndex={-1} ref={toastRef}>
          <p>{toast.text}</p>
          <button type="button" onClick={() => setToast(null)}>
            Dismiss
          </button>
        </div>
      ) : null}
    </div>
  )
}

function EmptyMark() {
  return (
    <svg className={styles.mark} viewBox="0 0 72 72" aria-hidden="true">
      <rect x="10" y="16" width="52" height="42" rx="8" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M10 28h52M26 16v-6M46 16v-6M24 40h24" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}
