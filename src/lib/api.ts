import {
  PLATFORMS,
  retryShouldFail,
  shiftSeed,
  type Platform,
  type Post,
  type Status,
} from "./schedule"

const STORAGE_KEY = "dispatch.posts.v1"
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
      (status !== "scheduled" && status !== "published" && status !== "failed")
    ) {
      throw new Error("Could not load the queue.")
    }
    const post: Post = {
      id: row.id,
      content: row.content,
      platforms,
      scheduledAt: row.scheduledAt,
      status: status as Status,
    }
    if (typeof row.mediaUrl === "string" && row.mediaUrl) post.mediaUrl = row.mediaUrl
    if (typeof row.errorMessage === "string" && row.errorMessage) post.errorMessage = row.errorMessage
    return post
  })
}

function readStored(): Post[] | null {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  return parsePosts(JSON.parse(raw))
}

export function savePosts(posts: Post[]) {
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

export async function createPost(): Promise<void> {
  await wait(CREATE_MS)
}

export async function retryPost(): Promise<void> {
  await wait(RETRY_MS)
  if (retryShouldFail()) {
    throw new Error("The platform rejected this retry. The post is still failed.")
  }
}
