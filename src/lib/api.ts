import {
  PLATFORMS,
  RETRY_ERROR,
  applyStoredCreate,
  applyStoredDelete,
  applyStoredRetry,
  applyStoredUpdate,
  duplicateFrom,
  canEditPost,
  canMovePost,
  canSaveQueue,
  isUtcTimestamp,
  retryShouldFail,
  scheduleBlockers,
  shiftSeed,
  type Platform,
  type Post,
} from "./schedule"

const STORAGE_KEY = "dispatch.posts.v1"
const REVISION_KEY = "dispatch.posts.rev"

export function queueStorageChanged(key: string | null): boolean {
  return key === STORAGE_KEY || key === REVISION_KEY
}

export function queueToken(): number {
  return Number(localStorage.getItem(REVISION_KEY)) || 0
}

export function invalidateQueue(): number {
  const next = queueToken() + 1
  localStorage.setItem(REVISION_KEY, String(next))
  return next
}

const LOAD_MS = 700
const CREATE_MS = 400
const RETRY_MS = 1000

function wait(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function parsePosts(value: unknown): Post[] {
  if (!Array.isArray(value)) throw new Error("Could not load the queue.")
  return value.map((item) => {
    if (!item || typeof item !== "object") throw new Error("Could not load the queue.")
    const row = item as Record<string, unknown>
    const platforms = Array.isArray(row.platforms)
      ? row.platforms.filter(
          (platform): platform is Platform =>
            typeof platform === "string" && PLATFORMS.includes(platform as Platform),
        )
      : []
    const status = row.status
    if (
      typeof row.id !== "string" ||
      typeof row.content !== "string" ||
      typeof row.scheduledAt !== "string" ||
      !isUtcTimestamp(row.scheduledAt) ||
      (status !== "scheduled" && status !== "published" && status !== "failed")
    ) {
      throw new Error("Could not load the queue.")
    }
    const mediaUrl = typeof row.mediaUrl === "string" && row.mediaUrl ? row.mediaUrl : undefined
    if (status === "failed") {
      if (typeof row.errorMessage !== "string" || !row.errorMessage) {
        throw new Error("Could not load the queue.")
      }
      return {
        id: row.id,
        content: row.content,
        platforms,
        ...(mediaUrl ? { mediaUrl } : {}),
        scheduledAt: row.scheduledAt,
        status,
        errorMessage: row.errorMessage,
      }
    }
    return {
      id: row.id,
      content: row.content,
      platforms,
      ...(mediaUrl ? { mediaUrl } : {}),
      scheduledAt: row.scheduledAt,
      status,
    }
  })
}

function readStored(): Post[] | null {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  return parsePosts(JSON.parse(raw))
}

function savePosts(posts: Post[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(posts))
}

export function clearPosts() {
  localStorage.removeItem(STORAGE_KEY)
}

export async function fetchPosts(forceError = false): Promise<Post[]> {
  await wait(LOAD_MS)
  if (forceError) {
    throw new Error("Could not load the queue. The request failed before any posts arrived.")
  }
  try {
    const stored = readStored()
    if (stored) return stored
  } catch {
    localStorage.removeItem(STORAGE_KEY)
  }
  const response = await fetch("/posts.json")
  if (!response.ok) {
    throw new Error("Could not load the queue. Check your connection and try again.")
  }
  const posts = shiftSeed(parsePosts(await response.json()))
  savePosts(posts)
  return posts
}

export async function createPost(post: Post, token = queueToken(), now = Date.now()): Promise<Post | null> {
  await wait(CREATE_MS)
  const reasons = scheduleBlockers({
    content: post.content,
    platforms: post.platforms,
    scheduledAt: post.scheduledAt,
    mediaUrl: post.mediaUrl,
    now,
  })
  if (reasons.length > 0) throw new Error(reasons[0])
  const next = applyStoredCreate(readStored(), post)
  if (!canSaveQueue(token, queueToken(), next) || !next) return null
  savePosts(next)
  return post
}

export async function retryPost(
  id: string,
  token = queueToken(),
  random = Math.random(),
  now = Date.now(),
): Promise<Post | null> {
  await wait(RETRY_MS)
  if (retryShouldFail(random)) throw new Error(RETRY_ERROR)
  const next = applyStoredRetry(readStored(), id, now)
  if (!canSaveQueue(token, queueToken(), next) || !next) return null
  savePosts(next)
  const saved = next.find((item) => item.id === id)
  return saved ?? null
}

export async function updatePost(post: Post, token = queueToken(), now = Date.now()): Promise<Post | null> {
  await wait(CREATE_MS)
  const stored = readStored()
  const original = stored?.find((item) => item.id === post.id)
  if (!original || !canSaveQueue(token, queueToken(), stored)) return null
  if (!canEditPost(original)) throw new Error("This post is already published.")
  const reasons = scheduleBlockers({
    content: post.content,
    platforms: post.platforms,
    scheduledAt: post.scheduledAt,
    mediaUrl: post.mediaUrl,
    now,
  }).filter((reason) => !(reason === "Choose a time in the future." && post.scheduledAt === original.scheduledAt))
  if (reasons.length > 0) throw new Error(reasons[0])
  const saved: Post =
    original.status === "failed"
      ? { ...post, status: "failed", errorMessage: original.errorMessage }
      : { ...post, status: original.status }
  const next = applyStoredUpdate(stored, saved)
  if (!canSaveQueue(token, queueToken(), next) || !next) return null
  savePosts(next)
  return saved
}

export async function deletePost(id: string, token = queueToken()): Promise<boolean> {
  const stored = readStored()
  const next = applyStoredDelete(stored, id)
  if (!canSaveQueue(token, queueToken(), next) || !next) return false
  savePosts(next)
  return true
}

export async function duplicatePost(source: Post, token = queueToken(), now = Date.now()): Promise<Post | null> {
  return createPost(duplicateFrom(source, crypto.randomUUID(), now), token, now)
}

export async function reschedulePost(
  id: string,
  scheduledAt: string,
  token = queueToken(),
  now = Date.now(),
): Promise<Post | null> {
  const stored = readStored()
  if (!canSaveQueue(token, queueToken(), stored) || !stored) return null
  const original = stored.find((post) => post.id === id)
  if (!original || !canMovePost(original, scheduledAt, now)) return null
  const next = stored.map((post) => (post.id === id ? { ...post, scheduledAt } : post))
  savePosts(next)
  return next.find((post) => post.id === id) ?? null
}
