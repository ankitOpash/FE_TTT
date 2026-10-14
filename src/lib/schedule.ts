export const PLATFORMS = ["facebook", "instagram", "x", "tiktok"] as const
export const STATUSES = ["scheduled", "published", "failed"] as const

export type Platform = (typeof PLATFORMS)[number]
export type Status = (typeof STATUSES)[number]

export type Post = {
  id: string
  content: string
  platforms: Platform[]
  mediaUrl?: string
  scheduledAt: string
  status: Status
  errorMessage?: string
}

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
  platform: Platform | ""
  status: Status | ""
  q: string
}

export function asPlatform(value: string | null): Platform | "" {
  return PLATFORMS.find((platform) => platform === value) ?? ""
}

export function asStatus(value: string | null): Status | "" {
  return STATUSES.find((status) => status === value) ?? ""
}

export function sortPlatforms(platforms: Platform[]): Platform[] {
  return PLATFORMS.filter((platform) => platforms.includes(platform))
}

export function platformsOverLimit(content: string, platforms: Platform[]): Platform[] {
  return sortPlatforms(platforms).filter((platform) => content.length > LIMITS[platform])
}

export function retryShouldFail(random = Math.random()): boolean {
  return random < RETRY_FAIL_RATE
}

export function isFutureTime(iso: string, now = Date.now()): boolean {
  const time = new Date(iso).getTime()
  return Number.isFinite(time) && time > now
}

export function scheduleBlockers(input: {
  content: string
  platforms: Platform[]
  scheduledAt: string
  now?: number
}): string[] {
  const now = input.now ?? Date.now()
  const reasons: string[] = []
  if (!input.content.trim()) reasons.push("Write the post before scheduling it.")
  if (input.platforms.length === 0) reasons.push("Select at least one platform.")
  for (const platform of platformsOverLimit(input.content, input.platforms)) {
    reasons.push(
      `${PLATFORM_LABEL[platform]} allows ${LIMITS[platform].toLocaleString()} characters.`,
    )
  }
  if (!input.scheduledAt || !isFutureTime(input.scheduledAt, now)) {
    reasons.push("Choose a time in the future.")
  }
  return reasons
}

export function localDayStart(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

export function dayLabel(iso: string, now = new Date()): string {
  const day = localDayStart(new Date(iso))
  const today = localDayStart(now)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  if (day === today) return "Today"
  if (day === tomorrow.getTime()) return "Tomorrow"
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
      posts: buckets
        .get(key)!
        .slice()
        .sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt)),
    }))
}

export function filterPosts(posts: Post[], filters: Filters): Post[] {
  const needle = filters.q.trim().toLowerCase()
  return posts.filter((post) => {
    if (filters.platform && !post.platforms.includes(filters.platform)) return false
    if (filters.status && post.status !== filters.status) return false
    if (needle && !post.content.toLowerCase().includes(needle)) return false
    return true
  })
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
