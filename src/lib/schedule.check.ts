import assert from "node:assert/strict"
import {
  claimRetry,
  dayLabel,
  filterPosts,
  groupPosts,
  imageUrlError,
  isCurrentAttempt,
  localInputToUtc,
  platformsOverLimit,
  releaseRetry,
  RETRY_ERROR,
  retryShouldFail,
  scheduleBlockers,
  settleRetryFailure,
  settleRetrySuccess,
  shiftSeed,
  toLocalInputValue,
  type Post,
} from "./schedule"

function post(partial: Pick<Post, "id" | "scheduledAt" | "status"> & Partial<Post>): Post {
  return {
    content: partial.content ?? "Hello",
    platforms: partial.platforms ?? ["x"],
    ...partial,
  }
}

const now = new Date(2026, 9, 14, 12, 0, 0, 0)
const at = (day: number, hour: number) => new Date(2026, 9, day, hour, 0, 0, 0).toISOString()

assert.equal(dayLabel(at(14, 15), now), "Today")
assert.equal(dayLabel(at(15, 9), now), "Tomorrow")
assert.equal(dayLabel(at(13, 9), now) === "Today", false)
assert.equal(dayLabel(at(13, 9), now) === "Tomorrow", false)

const groups = groupPosts(
  [
    post({ id: "past", scheduledAt: at(13, 9), status: "published" }),
    post({ id: "later", scheduledAt: at(18, 9), status: "scheduled" }),
    post({ id: "today-late", scheduledAt: at(14, 18), status: "scheduled" }),
    post({ id: "today-early", scheduledAt: at(14, 8), status: "published" }),
    post({ id: "tomorrow", scheduledAt: at(15, 9), status: "scheduled" }),
  ],
  now,
)

assert.deepEqual(
  groups.map((group) => group.label),
  ["Today", "Tomorrow", dayLabel(at(18, 9), now), dayLabel(at(13, 9), now)],
)
assert.deepEqual(
  groups[0].posts.map((item) => item.id),
  ["today-early", "today-late"],
)
assert.equal(groups[3].posts[0].id, "past")

assert.deepEqual(platformsOverLimit("a".repeat(280), ["x", "facebook"]), [])
assert.deepEqual(platformsOverLimit("a".repeat(281), ["facebook", "x"]), ["x"])
assert.deepEqual(platformsOverLimit("a".repeat(2200), ["instagram", "tiktok"]), [])
assert.deepEqual(platformsOverLimit("a".repeat(2201), ["tiktok", "instagram", "facebook"]), [
  "instagram",
  "tiktok",
])
assert.deepEqual(platformsOverLimit("a".repeat(5000), ["facebook"]), [])
assert.deepEqual(platformsOverLimit("a".repeat(5001), ["facebook"]), ["facebook"])

const future = at(14, 18)
const blockersNow = now.getTime()
assert.deepEqual(
  scheduleBlockers({ content: "Hello", platforms: ["x"], scheduledAt: future, now: blockersNow }),
  [],
)
assert.equal(
  scheduleBlockers({ content: "  ", platforms: ["x"], scheduledAt: future, now: blockersNow }).length > 0,
  true,
)
assert.equal(
  scheduleBlockers({ content: "Hello", platforms: [], scheduledAt: future, now: blockersNow }).some((reason) =>
    reason.includes("platform"),
  ),
  true,
)
assert.equal(
  scheduleBlockers({
    content: "a".repeat(281),
    platforms: ["x"],
    scheduledAt: future,
    now: blockersNow,
  }).some((reason) => reason.includes("X")),
  true,
)
assert.equal(
  scheduleBlockers({
    content: "Hello",
    platforms: ["facebook"],
    scheduledAt: new Date(blockersNow).toISOString(),
    now: blockersNow,
  }).some((reason) => reason.includes("future")),
  true,
)

assert.equal(retryShouldFail(0), true)
assert.equal(retryShouldFail(0.19), true)
assert.equal(retryShouldFail(0.2), false)
assert.equal(retryShouldFail(0.99), false)

const local = new Date(2026, 9, 14, 15, 45, 0, 0)
const roundTrip = new Date(localInputToUtc(toLocalInputValue(local)))
assert.equal(roundTrip.getFullYear(), 2026)
assert.equal(roundTrip.getMonth(), 9)
assert.equal(roundTrip.getDate(), 14)
assert.equal(roundTrip.getHours(), 15)
assert.equal(roundTrip.getMinutes(), 45)

const shifted = shiftSeed(
  [post({ id: "seed", scheduledAt: "2026-10-14T12:00:00.000Z", status: "scheduled" })],
  Date.UTC(2026, 9, 16, 8, 0, 0),
)
assert.equal(shifted[0].scheduledAt, "2026-10-16T12:00:00.000Z")

const visible = filterPosts(
  [
    post({ id: "a", scheduledAt: future, status: "failed", content: "Launch day menu", platforms: ["instagram", "x"] }),
    post({ id: "b", scheduledAt: future, status: "scheduled", content: "Office hours", platforms: ["facebook"] }),
  ],
  { platform: "x", status: "failed", q: "launch" },
)
assert.deepEqual(visible.map((item) => item.id), ["a"])
assert.deepEqual(
  filterPosts(
    [post({ id: "mix", scheduledAt: future, status: "scheduled", content: "Launch notes", platforms: ["x"] })],
    { platform: "instagram", status: "", q: "launch" },
  ),
  [],
)

assert.equal(imageUrlError(""), "")
assert.equal(imageUrlError("  "), "")
assert.equal(imageUrlError("https://picsum.photos/id/1015/960/640"), "")
assert.equal(imageUrlError("notaurl").includes("https://"), true)
assert.equal(imageUrlError("ftp://files.example/photo.jpg").includes("http"), true)
assert.equal(
  scheduleBlockers({
    content: "Hello",
    platforms: ["facebook"],
    scheduledAt: future,
    mediaUrl: "not a url",
    now: blockersNow,
  }).some((reason) => reason.includes("https://")),
  true,
)

const failed = post({
  id: "failed",
  scheduledAt: future,
  status: "failed",
  content: "Keep this copy",
  platforms: ["tiktok"],
  errorMessage: "Old failure",
})
const succeeded = settleRetrySuccess(failed)
assert.equal(succeeded.status, "scheduled")
assert.equal(succeeded.errorMessage, undefined)
assert.equal(succeeded.content, "Keep this copy")
assert.equal(succeeded.scheduledAt, failed.scheduledAt)
const rolled = settleRetryFailure(failed, RETRY_ERROR)
assert.equal(rolled.status, "failed")
assert.equal(rolled.errorMessage, RETRY_ERROR)
assert.equal(rolled.content, failed.content)
assert.equal(rolled.platforms[0], "tiktok")
assert.equal(claimRetry([], "failed")?.includes("failed"), true)
assert.equal(claimRetry(["failed"], "failed"), null)
assert.deepEqual(releaseRetry(["failed", "other"], "failed"), ["other"])
assert.equal(isCurrentAttempt(2, 1), false)
assert.equal(isCurrentAttempt(2, 2), true)

console.log("schedule checks passed")
