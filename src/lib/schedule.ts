export const PLATFORMS = ["facebook", "instagram", "x", "tiktok"] as const
export const STATUSES = ["scheduled", "published", "failed"] as const

export type Platform = (typeof PLATFORMS)[number]
export type Status = (typeof STATUSES)[number]

type PostFields = {
  id: string
  content: string
  platforms: Platform[]
  mediaUrl?: string
  scheduledAt: string
}

export type Post =
  | (PostFields & { status: "scheduled" | "published" })
  | (PostFields & { status: "failed"; errorMessage: string })

export const LIMITS: Record<Platform, number> = {
  x: 280,
  instagram: 2200,
  tiktok: 2200,
  facebook: 5000,
}

export const PLATFORM_LABEL: Record<Platform, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  x: "X",
  tiktok: "TikTok",
}

export const SEED_ANCHOR_UTC = Date.UTC(2026, 9, 14)
export const RETRY_FAIL_RATE = 0.2

export type Filters = {
  platforms: Platform[]
  status: Status | ""
  q: string
}

export function asPlatform(value: string | null): Platform | "" {
  return PLATFORMS.find((platform) => platform === value) ?? ""
}

export function parsePlatforms(value: string | null): Platform[] {
  if (!value) return []
  const found: Platform[] = []
  for (const part of value.split(",")) {
    const platform = asPlatform(part.trim().toLowerCase())
    if (platform && !found.includes(platform)) found.push(platform)
  }
  return sortPlatforms(found)
}

export function formatPlatformParam(platforms: readonly Platform[]): string {
  return sortPlatforms([...platforms]).join(",")
}

export function asStatus(value: string | null): Status | "" {
  return STATUSES.find((status) => status === value) ?? ""
}

export function sortPlatforms(platforms: Platform[]): Platform[] {
  return PLATFORMS.filter((platform) => platforms.includes(platform))
}

type GraphemeSegmenter = {
  segment: (input: string) => Iterable<{ segment: string }>
}

function graphemeSegmenter(): GraphemeSegmenter | null {
  const intl = Intl as typeof Intl & {
    Segmenter?: new (locales: undefined, options: { granularity: "grapheme" }) => GraphemeSegmenter
  }
  return intl.Segmenter ? new intl.Segmenter(undefined, { granularity: "grapheme" }) : null
}

function graphemeParts(content: string): string[] {
  const segmenter = graphemeSegmenter()
  if (!segmenter) return [...content]
  return [...segmenter.segment(content)].map((part) => part.segment)
}

export function countGraphemes(content: string): number {
  return graphemeParts(content).length
}

export function clipGraphemes(content: string, limit = 48): string {
  const text = content.trim()
  const parts = graphemeParts(text)
  if (parts.length <= limit) return text
  return `${parts.slice(0, limit).join("")}…`
}

export function charactersLeft(content: string, platform: Platform): number {
  return LIMITS[platform] - countGraphemes(content)
}

export function platformsOverLimit(content: string, platforms: Platform[]): Platform[] {
  return sortPlatforms(platforms).filter((platform) => countGraphemes(content) > LIMITS[platform])
}

export function retryShouldFail(random = Math.random()): boolean {
  return random < RETRY_FAIL_RATE
}

export function isFutureTime(iso: string, now = Date.now()): boolean {
  const time = new Date(iso).getTime()
  return Number.isFinite(time) && time > now
}

export function imageUrlError(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ""
  try {
    const url = new URL(trimmed)
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return "Use an http or https image URL."
    }
  } catch {
    return "Enter a full image URL, including https://."
  }
  return ""
}

export function scheduleBlockers(input: {
  content: string
  platforms: Platform[]
  scheduledAt: string
  mediaUrl?: string
  now?: number
}): string[] {
  const now = input.now ?? Date.now()
  const reasons: string[] = []
  if (!input.content.trim()) reasons.push("Write the post before scheduling it.")
  if (input.platforms.length === 0) reasons.push("Select at least one platform.")
  for (const platform of platformsOverLimit(input.content, input.platforms)) {
    const over = countGraphemes(input.content) - LIMITS[platform]
    reasons.push(
      `${PLATFORM_LABEL[platform]} is ${over.toLocaleString()} over its ${LIMITS[platform].toLocaleString()} limit.`,
    )
  }
  const image = imageUrlError(input.mediaUrl ?? "")
  if (image) reasons.push(image)
  if (!input.scheduledAt || !isFutureTime(input.scheduledAt, now)) {
    reasons.push("Choose a time in the future.")
  }
  return reasons
}

export const RETRY_ERROR = "The platform rejected this retry. The post is still failed."

export function claimRetry(pendingIds: readonly string[], id: string): string[] | null {
  if (pendingIds.includes(id)) return null
  return [...pendingIds, id]
}

export function releaseRetry(pendingIds: readonly string[], id: string): string[] {
  return pendingIds.filter((item) => item !== id)
}

export function isCurrentAttempt(active: number | undefined, attempt: number): boolean {
  return active === attempt
}

export function settleRetrySuccess(post: Post, now = Date.now()): Post {
  const when = new Date(post.scheduledAt).getTime()
  const status = Number.isFinite(when) && when <= now ? "published" : "scheduled"
  return {
    id: post.id,
    content: post.content,
    platforms: post.platforms,
    ...(post.mediaUrl ? { mediaUrl: post.mediaUrl } : {}),
    scheduledAt: post.scheduledAt,
    status,
  }
}

export function settleRetryFailure(original: Post): Post {
  return {
    id: original.id,
    content: original.content,
    platforms: original.platforms,
    ...(original.mediaUrl ? { mediaUrl: original.mediaUrl } : {}),
    scheduledAt: original.scheduledAt,
    status: "failed",
    errorMessage: original.status === "failed" ? original.errorMessage : RETRY_ERROR,
  }
}

export function localDayStart(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

export function dayLabel(iso: string, now = new Date()): string {
  const day = localDayStart(new Date(iso))
  const today = localDayStart(now)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  if (day === today) return "Today"
  if (day === tomorrow.getTime()) return "Tomorrow"
  if (day === yesterday.getTime()) return "Yesterday"
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

export type DayGroup = {
  label: string
  posts: Post[]
}

export function groupPosts(posts: Post[], now = new Date()): DayGroup[] {
  const today = localDayStart(now)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStart = tomorrow.getTime()
  const buckets = new Map<number, Post[]>()

  for (const post of posts) {
    const key = localDayStart(new Date(post.scheduledAt))
    const list = buckets.get(key)
    if (list) list.push(post)
    else buckets.set(key, [post])
  }

  const rank = (key: number) => {
    if (key === today) return 0
    if (key === tomorrowStart) return 1
    if (key > today) return 2
    return 3
  }

  return [...buckets.keys()]
    .sort((a, b) => {
      const byRank = rank(a) - rank(b)
      if (byRank !== 0) return byRank
      if (rank(a) === 3) return b - a
      return a - b
    })
    .map((key) => ({
      label: dayLabel(new Date(key).toISOString(), now),
      posts: (buckets.get(key) ?? [])
        .slice()
        .sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt)),
    }))
}

export function filterPosts(posts: Post[], filters: Filters): Post[] {
  const needle = filters.q.trim().toLowerCase()
  return posts.filter((post) => matchesFilters(post, filters, needle))
}

function matchesFilters(post: Post, filters: Filters, needle = filters.q.trim().toLowerCase()): boolean {
  if (filters.platforms.length > 0 && !filters.platforms.some((platform) => post.platforms.includes(platform))) {
    return false
  }
  if (filters.status && post.status !== filters.status) return false
  if (needle && !post.content.toLowerCase().includes(needle)) return false
  return true
}

function yesterdayStart(now: Date): number {
  const yesterday = new Date(localDayStart(now))
  yesterday.setDate(yesterday.getDate() - 1)
  return yesterday.getTime()
}

export function isEarlierGroup(group: DayGroup, now = new Date()): boolean {
  const first = group.posts[0]
  if (!first) return false
  return localDayStart(new Date(first.scheduledAt)) < yesterdayStart(now)
}

export function failedCount(posts: readonly Post[]): number {
  return posts.filter((post) => post.status === "failed").length
}

export function earlierSummary(groups: readonly DayGroup[]): { posts: number; failed: number } {
  return {
    posts: groups.reduce((sum, group) => sum + group.posts.length, 0),
    failed: groups.reduce((sum, group) => sum + failedCount(group.posts), 0),
  }
}

export function earlierShouldOpen(filters: Pick<Filters, "status" | "q">): boolean {
  return filters.status === "failed" || filters.q.trim().length > 0
}

export function schedulePreset(kind: "hour" | "tomorrow" | "monday", now = new Date()): string {
  if (kind === "hour") return toLocalInputValue(new Date(now.getTime() + 60 * 60 * 1000))
  const date = new Date(now)
  date.setHours(9, 0, 0, 0)
  if (kind === "tomorrow") {
    date.setDate(date.getDate() + 1)
    return toLocalInputValue(date)
  }
  const delta = (8 - date.getDay()) % 7 || 7
  date.setDate(date.getDate() + delta)
  return toLocalInputValue(date)
}

export function formatRelative(iso: string, now = new Date()): string {
  const time = new Date(iso).getTime()
  if (!Number.isFinite(time)) return ""
  const delta = time - now.getTime()
  const abs = Math.abs(delta)
  const minute = 60_000
  const hour = 60 * minute
  const label = dayLabel(iso, now)
  const clock = formatClock(iso)
  if (label === "Tomorrow" || label === "Yesterday") return `${label} ${clock}`
  if (label !== "Today") return clock
  if (abs < minute) return delta >= 0 ? "in 1m" : "just now"
  if (abs < hour) {
    const minutes = Math.max(1, Math.round(abs / minute))
    return delta >= 0 ? `in ${minutes}m` : `${minutes}m ago`
  }
  const hours = Math.max(1, Math.round(abs / hour))
  return delta >= 0 ? `in ${hours}h` : `${hours}h ago`
}

export function formatExactTimes(iso: string): string {
  const date = new Date(iso)
  if (!Number.isFinite(date.getTime())) return ""
  const local = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date)
  const utc = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date)
  return `${local} · ${utc}`
}

export function formatScheduleSummary(iso: string, now = new Date()): string {
  const date = new Date(iso)
  if (!Number.isFinite(date.getTime())) return ""
  const local = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date)
  const utc = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    hour: "numeric",
    minute: "2-digit",
  }).format(date)
  const zone =
    new Intl.DateTimeFormat("en-US", { timeZoneName: "short" })
      .formatToParts(now)
      .find((part) => part.type === "timeZoneName")?.value ?? localZoneLabel(now)
  return `${local} ${zone} (${utc} UTC)`
}

export function canSaveQueue(startedAt: number, currentToken: number, posts: Post[] | null): boolean {
  return startedAt === currentToken && posts != null
}

export function applyStoredCreate(posts: Post[] | null, post: Post): Post[] | null {
  if (posts == null) return null
  return [post, ...posts.filter((item) => item.id !== post.id)]
}

export function applyStoredRetry(posts: Post[] | null, id: string, now = Date.now()): Post[] | null {
  if (posts == null) return null
  const original = posts.find((item) => item.id === id)
  if (!original || original.status !== "failed") return null
  const updated = settleRetrySuccess(original, now)
  return posts.map((item) => (item.id === id ? updated : item))
}

export function visiblePosts(posts: Post[], filters: Filters, pendingIds: readonly string[] = []): Post[] {
  const pending = new Set(pendingIds)
  const matched = filterPosts(posts, filters)
  if (pending.size === 0) return matched
  const seen = new Set(matched.map((post) => post.id))
  const held = posts.filter(
    (post) => pending.has(post.id) && !seen.has(post.id) && matchesFilters(post, { ...filters, status: "" }),
  )
  return [...matched, ...held]
}

function utcDayStart(ms: number): number {
  const date = new Date(ms)
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

export function shiftSeed(posts: Post[], now = Date.now()): Post[] {
  const delta = utcDayStart(now) - SEED_ANCHOR_UTC
  if (delta === 0) return posts
  return posts.map((post) => ({
    ...post,
    scheduledAt: new Date(new Date(post.scheduledAt).getTime() + delta).toISOString(),
  }))
}

export function toLocalInputValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function localInputToUtc(value: string): string {
  const time = new Date(value).getTime()
  if (!Number.isFinite(time)) return ""
  return new Date(time).toISOString()
}

export function isUtcTimestamp(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?Z$/.exec(value)
  if (!match) return false
  const time = Date.parse(value)
  if (!Number.isFinite(time)) return false
  const date = new Date(time)
  return (
    date.getUTCFullYear() === Number(match[1]) &&
    date.getUTCMonth() + 1 === Number(match[2]) &&
    date.getUTCDate() === Number(match[3]) &&
    date.getUTCHours() === Number(match[4]) &&
    date.getUTCMinutes() === Number(match[5]) &&
    date.getUTCSeconds() === Number(match[6])
  )
}

export function shiftNotice(requested: string, resolved: string): string {
  if (!requested || requested === resolved) return ""
  return `That time does not exist in your timezone. It will be saved as ${resolved.replace("T", " ")}.`
}

export function clockShiftNotice(value: string): string {
  const iso = localInputToUtc(value)
  if (!iso) return ""
  return shiftNotice(value, toLocalInputValue(new Date(iso)))
}

export function mergeQuery(current: string, updates: Record<string, string>): string {
  const next = new URLSearchParams(current)
  for (const [key, value] of Object.entries(updates)) {
    if (value) next.set(key, value)
    else next.delete(key)
  }
  return next.toString()
}

export function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  })
}

export function localZoneLabel(now = new Date()): string {
  const offset = new Intl.DateTimeFormat("en-US", { timeZoneName: "shortOffset" })
    .formatToParts(now)
    .find((part) => part.type === "timeZoneName")?.value
  const name = Intl.DateTimeFormat().resolvedOptions().timeZone
  return offset ? `${name} (${offset})` : name
}
