"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Plus } from "lucide-react"
import { clearPosts, createPost, deletePost, duplicatePost, fetchPosts, invalidateQueue, queueStorageChanged, queueToken, reschedulePost, retryPost, updatePost } from "@/lib/api"
import {
  asStatus,
  canEditPost,
  canMovePost,
  claimRetry,
  clipGraphemes,
  currentWeekRange,
  filterPosts,
  formatPlatformParam,
  groupPosts,
  isCurrentAttempt,
  localZoneLabel,
  mergeQuery,
  parseDayParam,
  parsePlatforms,
  releaseRetry,
  retargetLocalDay,
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
import { Insights, MediaLibrary } from "./insights"
import { Overview } from "./overview"
import { clip, type CardAction } from "./post-card"
import { QueueList, QueueSkeleton } from "./queue-list"
import { ChannelSetup } from "./channels"
import { PageHeader, SettingsPanel, Sidebar, type SchedulerView } from "./shell"
import { StatsStrip } from "./stats-strip"
import { toggleTheme } from "./theme"
import { BoardView, CalendarView } from "./views"
import styles from "./scheduler.module.css"

type Notice = {
  id: number
  text: string
  tone: "success" | "error"
}

const STALE_QUEUE = "The queue changed in another tab. Reload to see the latest posts."

let searchFocusTimer = 0

function holdSearchFocus() {
  window.clearInterval(searchFocusTimer)
  const started = Date.now()
  let held = 0
  searchFocusTimer = window.setInterval(() => {
    const field = document.querySelector<HTMLInputElement>('input[aria-label="Search"]')
    if (field && document.activeElement !== field) field.focus()
    if (field && document.activeElement === field) held += 30
    else held = 0
    if (held >= 240 || Date.now() - started > 1500) window.clearInterval(searchFocusTimer)
  }, 30)
}

const VIEWS: readonly SchedulerView[] = ["overview", "queue", "calendar", "analytics", "media", "settings", "channels", "board"]

function viewFromQuery(value: string | null): SchedulerView {
  if (value && VIEWS.includes(value as SchedulerView)) return value as SchedulerView
  return "queue"
}

const COPY: Record<SchedulerView, { title: string; description: string }> = {
  overview: {
    title: "Overview",
    description: "Scheduled work, publishing results, and what needs a retry.",
  },
  queue: {
    title: "Content queue",
    description: "Review, schedule, and manage your content across all channels.",
  },
  calendar: {
    title: "Calendar",
    description: "Move posts across days. The new time has to be in the future.",
  },
  analytics: {
    title: "Analytics",
    description: "Publishing results counted from the posts in this queue.",
  },
  media: {
    title: "Media library",
    description: "Images attached to posts in this demo.",
  },
  settings: {
    title: "Settings",
    description: "Theme and how this demo stores time.",
  },
  channels: {
    title: "Channel setup",
    description: "API key, secret, and webhook for each platform. Saved only in this browser.",
  },
  board: {
    title: "Board",
    description: "The same queue, grouped by status.",
  },
}

export default function Scheduler() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const now = useNow()
  const forceError = searchParams.get("forceError") === "1"
  const platforms = parsePlatforms(searchParams.get("platform"))
  const status = asStatus(searchParams.get("status"))
  const query = searchParams.get("q") ?? ""
  const from = parseDayParam(searchParams.get("from"))
  const to = parseDayParam(searchParams.get("to"))
  const view = viewFromQuery(searchParams.get("view"))
  const [posts, setPosts] = useState<Post[] | null>(null)
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading")
  const [loadError, setLoadError] = useState("")
  const [tick, setTick] = useState(0)
  const [channelFocus, setChannelFocus] = useState<Platform>("facebook")
  const [composerOpen, setComposerOpen] = useState(false)
  const [editing, setEditing] = useState<Post | null>(null)
  const closeComposer = useCallback(() => {
    setComposerOpen(false)
    setEditing(null)
  }, [])
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [navOpen, setNavOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [toast, setToast] = useState<Notice | null>(null)
  const [pendingIds, setPendingIds] = useState<string[]>([])
  const [duplicatingIds, setDuplicatingIds] = useState<string[]>([])
  const duplicatingRef = useRef<string[]>([])
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
  const openSearchRef = useRef<() => void>(() => {})
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
    const rawFrom = searchParams.get("from")
    const rawTo = searchParams.get("to")
    if ((rawFrom ?? "") !== parseDayParam(rawFrom)) updates.from = ""
    if ((rawTo ?? "") !== parseDayParam(rawTo)) updates.to = ""
    const rawView = searchParams.get("view")
    if (rawView === "queue" || (rawView && !VIEWS.includes(rawView as SchedulerView))) updates.view = ""
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
        openSearchRef.current()
        return
      }
      if ((event.key === "n" || event.key === "N") && !meta && !event.altKey && phase === "ready") {
        event.preventDefault()
        openComposer()
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

  function openComposer(post?: Post) {
    setEditing(post ?? null)
    setComposerOpen(true)
  }

  async function onCreate(post: Post) {
    const token = queueToken()
    const existing = posts?.some((item) => item.id === post.id) ?? false
    const saved = existing ? await updatePost(post, token) : await createPost(post, token)
    if (!saved || queueToken() !== token) throw new Error(STALE_QUEUE)
    setPosts((current) => {
      if (!current) return current
      if (existing) return current.map((item) => (item.id === saved.id ? saved : item))
      return [saved, ...current.filter((item) => item.id !== saved.id)]
    })
    closeComposer()
    showToast(existing ? "Changes saved." : "Scheduled. The post is on the queue.", "success", false)
  }

  async function onDuplicate(post: Post) {
    const claimed = claimRetry(duplicatingRef.current, post.id)
    if (!claimed) return
    duplicatingRef.current = claimed
    setDuplicatingIds(claimed)
    const token = queueToken()
    try {
      const saved = await duplicatePost(post, token)
      if (!saved || queueToken() !== token) throw new Error(STALE_QUEUE)
      setPosts((current) => (current ? [saved, ...current.filter((item) => item.id !== saved.id)] : current))
      showToast("Duplicated. The copy is on the queue.", "success", false)
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not duplicate this post.", "error", true)
    } finally {
      const released = releaseRetry(duplicatingRef.current, post.id)
      duplicatingRef.current = released
      setDuplicatingIds(released)
    }
  }

  async function onDelete(post: Post) {
    if (pendingRef.current.includes(post.id)) return
    if (!window.confirm("Delete this post from the demo queue?")) return
    const token = queueToken()
    setPosts((current) => current?.filter((item) => item.id !== post.id) ?? current)
    const removed = await deletePost(post.id, token)
    if (!removed || queueToken() !== token) {
      setPosts((current) => (current ? [post, ...current.filter((item) => item.id !== post.id)] : [post]))
      showToast(STALE_QUEUE, "error", true)
      return
    }
    showToast("Post deleted.", "success", false)
  }

  function onAction(action: CardAction, post: Post) {
    if (action === "edit") {
      if (!canEditPost(post) || pendingRef.current.includes(post.id)) return
      openComposer(post)
      return
    }
    if (action === "duplicate") void onDuplicate(post)
    else void onDelete(post)
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
    const had =
      platforms.length > 0 || Boolean(status) || Boolean(draft.trim()) || Boolean(query.trim()) || Boolean(from) || Boolean(to)
    if (searchTimer.current) window.clearTimeout(searchTimer.current)
    setDraft("")
    writeParams({ platform: "", status: "", q: "", from: "", to: "" }, "push")
    if (had) showToast("Filters cleared.", "success", false)
  }

  function toggleWeek() {
    const week = currentWeekRange(now > 0 ? new Date(now) : new Date())
    if (from === week.from && to === week.to) writeParams({ from: "", to: "" }, "push")
    else writeParams(week, "push")
  }

  async function onMove(post: Post, day: Date) {
    if (pendingRef.current.includes(post.id)) return
    if (!canEditPost(post)) {
      showToast("Published posts stay as they went out. Duplicate one to schedule a change.", "error", false)
      return
    }
    const scheduledAt = retargetLocalDay(post.scheduledAt, day)
    if (!scheduledAt || scheduledAt === post.scheduledAt) return
    if (!canMovePost(post, scheduledAt)) {
      showToast("Choose a day in the future.", "error", false)
      return
    }
    const token = queueToken()
    setPosts((current) => current?.map((item) => (item.id === post.id ? { ...item, scheduledAt } : item)) ?? current)
    const saved = await reschedulePost(post.id, scheduledAt, token)
    if (queueToken() !== token || !saved) {
      setPosts((current) => current?.map((item) => (item.id === post.id ? post : item)) ?? current)
      showToast(STALE_QUEUE, "error", true)
      return
    }
    showToast("Post moved.", "success", false)
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

  function setView(next: SchedulerView) {
    writeParams({ view: next === "queue" ? "" : next }, "push")
  }

  function openSearch() {
    if (view !== "queue" && view !== "calendar" && view !== "board") setView("queue")
    holdSearchFocus()
  }
  openSearchRef.current = openSearch

  function openQueue(next: Status | "") {
    const updates: Record<string, string> = { view: "" }
    if (next !== status) updates.status = next
    writeParams(updates, "push")
  }

  function retryAll(targets: readonly Post[]) {
    for (const post of targets) {
      if (post.status === "failed") void onRetry(post)
    }
  }

  const visible = posts ? visiblePosts(posts, { platforms, status, q: draft, from, to }, pendingIds) : []
  const failedOnScreen = visible.filter((post) => post.status === "failed")
  const groups = posts ? groupPosts(visible, now > 0 ? new Date(now) : new Date()) : []
  const filtersActive = platforms.length > 0 || Boolean(status) || Boolean(draft.trim()) || Boolean(from) || Boolean(to)
  const scoped = posts ? filterPosts(posts, { platforms, status: "", q: draft, from, to }) : []
  const counts = {
    all: scoped.length,
    scheduled: scoped.filter((post) => post.status === "scheduled").length,
    published: scoped.filter((post) => post.status === "published").length,
    failed: scoped.filter((post) => post.status === "failed").length,
  }
  const week = currentWeekRange(now > 0 ? new Date(now) : new Date())
  const weekOn = from === week.from && to === week.to
  const rangeLabel = from || to ? `${from || "Start open"} – ${to || "End open"}` : ""
  const copy = COPY[view]
  const queueView = view === "queue"
  const showFilters = queueView || view === "calendar" || view === "board"

  const onQuery = (value: string) => {
    setDraft(value)
    if (searchTimer.current) window.clearTimeout(searchTimer.current)
    searchTimer.current = window.setTimeout(() => writeParams({ q: value }), 200)
  }
  const onQueryBlur = (value: string) => {
    if (searchTimer.current) window.clearTimeout(searchTimer.current)
    writeParams({ q: value })
  }

  return (
    <div className={styles.app}>
      {navOpen ? (
        <button type="button" className={styles.scrim} aria-label="Close menu" onClick={() => setNavOpen(false)} />
      ) : null}
      <Sidebar
        view={view}
        open={navOpen}
        channel={channelFocus}
        onView={setView}
        onClose={() => setNavOpen(false)}
        onChannel={(platform) => {
          setChannelFocus(platform)
          setView("channels")
        }}
      />
      <div className={styles.column}>
      <PageHeader
        title={copy.title}
        description={copy.description}
        ready={phase === "ready"}
        weekOn={weekOn}
        onWeek={toggleWeek}
        onNew={() => openComposer()}
        onMenu={() => setNavOpen(true)}
        onTheme={toggleTheme}
        onPalette={() => setPaletteOpen(true)}
      />

      <div className={queueView ? styles.workspace : styles.workspaceSingle}>
      <div className={styles.primaryCol}>
      {phase === "ready" && showFilters ? (
        <>
          <StatsStrip
            counts={counts}
            status={status}
            retrying={pendingIds.length > 0}
            retryCount={failedOnScreen.length}
            onStatus={(next) => selectStatus(next)}
            onRetryAll={() => retryAll(failedOnScreen)}
          />
          <FilterBar
            platforms={platforms}
            status={status}
            query={draft}
            counts={counts}
            showing={visible.length}
            total={counts.all}
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
            rangeLabel={rangeLabel}
            onClearRange={() => {
              if (!from && !to) return
              writeParams({ from: "", to: "" }, "push")
            }}
            inputRef={searchRef}
            onQuery={onQuery}
            onQueryBlur={onQueryBlur}
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
        {phase === "ready" && showFilters && visible.length === 0 ? (
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
                Reset filters
              </button>
            ) : (
              <button type="button" className={styles.primary} onClick={() => openComposer()}>
                Create post
              </button>
            )}
          </div>
        ) : null}
        {phase === "ready" && posts && view === "overview" ? (
          <Overview
            posts={posts}
            now={now}
            pendingIds={pendingIds}
            onRetry={onRetry}
            onRetryAll={() => retryAll(posts.filter((post) => post.status === "failed"))}
            onOpenQueue={openQueue}
          />
        ) : null}
        {phase === "ready" && visible.length > 0 && queueView ? (
          <QueueList
            groups={groups}
            now={now}
            forceEarlier={filtersActive}
            pendingIds={pendingIds}
            duplicatingIds={duplicatingIds}
            freshIds={freshIds}
            shakeIds={shakeIds}
            onRetry={onRetry}
            onAction={onAction}
          />
        ) : null}
        {phase === "ready" && visible.length > 0 && view === "calendar" ? (
          <CalendarView
            posts={visible}
            now={now}
            pendingIds={pendingIds}
            duplicatingIds={duplicatingIds}
            freshIds={freshIds}
            shakeIds={shakeIds}
            onRetry={onRetry}
            onAction={onAction}
            onMove={onMove}
          />
        ) : null}
        {phase === "ready" && visible.length > 0 && view === "board" ? (
          <BoardView
            posts={visible}
            now={now}
            pendingIds={pendingIds}
            duplicatingIds={duplicatingIds}
            freshIds={freshIds}
            shakeIds={shakeIds}
            onRetry={onRetry}
            onAction={onAction}
          />
        ) : null}
        {phase === "ready" && posts && view === "analytics" ? <Insights posts={posts} now={now} embedded /> : null}
        {phase === "ready" && posts && view === "media" ? (
          <MediaLibrary
            posts={posts}
            onOpen={(post) => {
              const needle = clipGraphemes(post.content, 32).replace(/…$/, "")
              if (searchTimer.current) window.clearTimeout(searchTimer.current)
              setDraft(needle)
              writeParams({ view: "", q: needle }, "push")
            }}
          />
        ) : null}
        {view === "settings" ? <SettingsPanel zone={localZoneLabel()} onTheme={toggleTheme} /> : null}
        {view === "channels" ? (
          <ChannelSetup
            platform={channelFocus}
            onPlatform={setChannelFocus}
            onNotice={(message) => showToast(message, "success", false)}
          />
        ) : null}
      </main>
      </div>
      {phase === "ready" && posts && queueView ? <Insights posts={posts} now={now} /> : null}
      </div>

      <button type="button" className={styles.quiet} onClick={onReset} disabled={phase === "loading"}>
        Reset demo data
      </button>

      <button type="button" className={styles.fab} onClick={() => openComposer()} disabled={phase !== "ready"}>
        <Plus size={16} aria-hidden="true" />
        Create post
      </button>
      </div>
      {composerOpen ? <Composer onClose={closeComposer} onCreate={onCreate} initial={editing ?? undefined} /> : null}
      <CommandPalette
        open={paletteOpen}
        posts={posts ?? []}
        onClose={() => setPaletteOpen(false)}
        onNew={() => {
          if (phase === "ready") openComposer()
        }}
        onSearch={() => openSearchRef.current()}
        onTheme={toggleTheme}
        onView={setView}
        onClearFilters={clearFilters}
        onOpenPost={(post) => {
          const needle = clipGraphemes(post.content, 32).replace(/…$/, "")
          if (searchTimer.current) window.clearTimeout(searchTimer.current)
          setDraft(needle)
          writeParams({ view: "", q: needle }, "push")
        }}
      />
      {toast ? (
        <div
          key={toast.id}
          className={`${styles.toast} ${toast.tone === "error" ? styles.toastError : styles.toastOk}`}
          role="alert"
          tabIndex={-1}
          ref={toastRef}
        >
          {toast.text}
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
