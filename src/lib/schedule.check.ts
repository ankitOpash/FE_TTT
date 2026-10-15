import assert from "node:assert/strict"
import {
  applyEdit,
  applyStoredCreate,
  applyStoredDelete,
  applyStoredRetry,
  applyStoredUpdate,
  blankChannel,
  canEditPost,
  canMovePost,
  channelProblems,
  channelReady,
  duplicateFrom,
  canSaveQueue,
  claimRetry,
  clipGraphemes,
  clockShiftNotice,
  countGraphemes,
  dayLabel,
  earlierShouldOpen,
  earlierSummary,
  failedCount,
  filterPosts,
  formatPlatformParam,
  formatRelative,
  isEarlierGroup,
  parsePlatforms,
  schedulePreset,
  visiblePosts,
  groupPosts,
  imageUrlError,
  isCurrentAttempt,
  isFutureTime,
  isUtcTimestamp,
  localInputToUtc,
  mergeQuery,
  platformsOverLimit,
  nextPostWhen,
  nextScheduledPost,
  parseDayParam,
  publishingHealth,
  releaseRetry,
  retargetLocalDay,
  retryShouldFail,
  scheduleBlockers,
  settleRetryFailure,
  settleRetrySuccess,
  shiftNotice,
  shiftSeed,
  currentWeekRange,
  toLocalInputValue,
  withinRange,
  type Post,
} from "./schedule"

function post(partial: {
  id: string
  scheduledAt: string
  status: Post["status"]
  content?: string
  platforms?: Post["platforms"]
  errorMessage?: string
  mediaUrl?: string
}): Post {
  const base = {
    id: partial.id,
    content: partial.content ?? "Hello",
    platforms: partial.platforms ?? (["x"] as Post["platforms"]),
    scheduledAt: partial.scheduledAt,
    ...(partial.mediaUrl ? { mediaUrl: partial.mediaUrl } : {}),
  }
  if (partial.status === "failed") {
    return { ...base, status: "failed", errorMessage: partial.errorMessage ?? "Failed" }
  }
  return { ...base, status: partial.status }
}

const now = new Date(2026, 9, 14, 12, 0, 0, 0)
const at = (day: number, hour: number) => new Date(2026, 9, day, hour, 0, 0, 0).toISOString()

assert.equal(dayLabel(at(14, 15), now), "Today")
assert.equal(dayLabel(at(15, 9), now), "Tomorrow")
assert.equal(dayLabel(at(13, 9), now), "Yesterday")

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
const family = "\u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467}\u{200D}\u{1F466}"
assert.equal(countGraphemes(family.repeat(30)), 30)
assert.equal(family.repeat(30).length > 280, true)
assert.deepEqual(platformsOverLimit(family.repeat(30), ["x"]), [])
assert.deepEqual(platformsOverLimit(family.repeat(281), ["x"]), ["x"])

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
assert.equal(isUtcTimestamp("2026-10-14T12:00:00.000Z"), true)
assert.equal(isUtcTimestamp("2026-10-14T12:00:00Z"), true)
assert.equal(isUtcTimestamp("October 14, 2026"), false)
assert.equal(isUtcTimestamp("2026-10-14"), false)
assert.equal(isUtcTimestamp("2026-02-31T00:00:00.000Z"), false)
assert.equal(isUtcTimestamp("2026-10-14T10:00:00+05:30"), false)
const clipped = clipGraphemes(`${family.repeat(49)} tail`)
assert.equal(clipped.endsWith("…"), true)
assert.equal(countGraphemes(clipped.slice(0, -1)), 48)

const visible = filterPosts(
  [
    post({ id: "a", scheduledAt: future, status: "failed", content: "Launch day menu", platforms: ["instagram", "x"] }),
    post({ id: "b", scheduledAt: future, status: "scheduled", content: "Office hours", platforms: ["facebook"] }),
  ],
  { platforms: ["x"], status: "failed", q: "launch" },
)
assert.deepEqual(visible.map((item) => item.id), ["a"])
const held = visiblePosts(
  [
    post({ id: "stay", scheduledAt: future, status: "failed", errorMessage: "Failed" }),
    post({ id: "pending", scheduledAt: future, status: "scheduled", content: "Still on screen" }),
    post({ id: "other", scheduledAt: future, status: "scheduled", content: "Hidden" }),
  ],
  { platforms: [], status: "failed", q: "" },
  ["pending"],
)
assert.deepEqual(held.map((item) => item.id), ["stay", "pending"])
assert.equal(canSaveQueue(1, 1, []), true)
assert.equal(canSaveQueue(1, 1, null), false)
assert.deepEqual(
  filterPosts(
    [post({ id: "mix", scheduledAt: future, status: "scheduled", content: "Launch notes", platforms: ["x"] })],
    { platforms: ["instagram"], status: "", q: "launch" },
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
const succeeded = settleRetrySuccess(failed, blockersNow)
assert.equal(succeeded.status, "scheduled")
assert.equal("errorMessage" in succeeded, false)
assert.equal(succeeded.content, "Keep this copy")
assert.equal(succeeded.scheduledAt, failed.scheduledAt)
const pastFailed = post({
  id: "past-failed",
  scheduledAt: at(11, 9),
  status: "failed",
  errorMessage: "Old failure",
})
assert.equal(settleRetrySuccess(pastFailed, now.getTime()).status, "published")
assert.equal(canSaveQueue(1, 2, [failed]), false)
assert.equal(applyStoredCreate(null, failed), null)
assert.equal(applyStoredRetry(null, "failed", blockersNow), null)
const created = applyStoredCreate([failed], post({ id: "new", scheduledAt: future, status: "scheduled" }))
assert.equal(created?.[0].id, "new")
assert.equal(created?.[1].status, "failed")
assert.equal(created?.[1].status === "failed" ? created[1].errorMessage : "", "Old failure")
const retried = applyStoredRetry([failed], "failed", blockersNow)
assert.equal(retried?.[0].status, "scheduled")
assert.equal(applyStoredRetry([failed], "missing", blockersNow), null)
const rolled = settleRetryFailure(failed)
assert.equal(rolled.status, "failed")
assert.equal(rolled.errorMessage, "Old failure")
assert.equal(rolled.content, failed.content)
assert.equal(rolled.platforms[0], "tiktok")
const stacked = mergeQuery(mergeQuery("", { platform: "tiktok" }), { status: "scheduled" })
assert.equal(new URLSearchParams(stacked).get("platform"), "tiktok")
assert.equal(new URLSearchParams(stacked).get("status"), "scheduled")
assert.equal(shiftNotice("2027-03-14T02:30", "2027-03-14T03:30").includes("03:30"), true)
assert.equal(shiftNotice("2027-03-14T02:30", "2027-03-14T02:30"), "")
assert.equal(clockShiftNotice(toLocalInputValue(local)), "")
assert.equal(claimRetry([], "failed")?.includes("failed"), true)
assert.equal(claimRetry(["failed"], "failed"), null)
assert.deepEqual(releaseRetry(["failed", "other"], "failed"), ["other"])
assert.equal(isCurrentAttempt(2, 1), false)
assert.equal(isCurrentAttempt(2, 2), true)

const either = filterPosts(
  [
    post({ id: "ig", scheduledAt: future, status: "scheduled", platforms: ["instagram"], content: "One" }),
    post({ id: "fb", scheduledAt: future, status: "scheduled", platforms: ["facebook"], content: "Two" }),
    post({ id: "both", scheduledAt: future, status: "scheduled", platforms: ["x", "tiktok"], content: "Three" }),
  ],
  { platforms: ["instagram", "x"], status: "", q: "" },
)
assert.deepEqual(either.map((item) => item.id), ["ig", "both"])
assert.deepEqual(parsePlatforms("instagram"), ["instagram"])
assert.deepEqual(parsePlatforms("x,instagram,nope"), ["instagram", "x"])
assert.equal(parsePlatforms("nope").length, 0)
assert.equal(formatPlatformParam(["x", "instagram"]), "instagram,x")
const noon = new Date(2026, 9, 14, 12, 0, 0)
assert.equal(formatRelative(new Date(2026, 9, 14, 14, 0, 0).toISOString(), noon), "in 2h")
assert.equal(formatRelative(new Date(2026, 9, 15, 9, 0, 0).toISOString(), noon).startsWith("Tomorrow"), true)
const monday = new Date(schedulePreset("monday", noon))
assert.equal(monday.getDay(), 1)
assert.equal(monday.getHours(), 9)
const moved = new Date(retargetLocalDay(new Date(2026, 9, 14, 15, 30, 0).toISOString(), new Date(2026, 9, 20, 8, 0, 0)))
assert.equal(moved.getDate(), 20)
assert.equal(moved.getHours(), 15)
assert.equal(moved.getMinutes(), 30)
assert.equal(retargetLocalDay("not-a-date", new Date()), "")
const ranged = new Date(2026, 9, 14, 15, 0, 0).toISOString()
assert.equal(withinRange(ranged, "2026-10-14", "2026-10-14"), true)
assert.equal(withinRange(ranged, "2026-10-15", ""), false)
assert.equal(parseDayParam("2026-02-31"), "")
const week = currentWeekRange(new Date(2026, 9, 14, 12, 0, 0))
assert.equal(week.from, "2026-10-11")
assert.equal(week.to, "2026-10-17")
assert.deepEqual(
  publishingHealth([
    post({ id: "pub", scheduledAt: future, status: "published" }),
    post({ id: "bad", scheduledAt: future, status: "failed", errorMessage: "No" }),
    post({ id: "wait", scheduledAt: future, status: "scheduled" }),
  ]),
  { published: 1, failed: 1, rate: 50 },
)
assert.equal(
  nextScheduledPost(
    [
      post({ id: "later", scheduledAt: new Date(2026, 9, 20, 9, 0, 0).toISOString(), status: "scheduled" }),
      post({ id: "sooner", scheduledAt: new Date(2026, 9, 16, 9, 0, 0).toISOString(), status: "scheduled" }),
    ],
    new Date(2026, 9, 15, 12, 0, 0).getTime(),
  )?.id,
  "sooner",
)
const yesterdayGroup = {
  label: "Yesterday",
  posts: [post({ id: "old", scheduledAt: at(13, 9), status: "failed", errorMessage: "Still failed" })],
}
const olderGroup = {
  label: "Older",
  posts: [
    post({ id: "older-ok", scheduledAt: at(12, 9), status: "published" }),
    post({ id: "older-bad", scheduledAt: at(12, 11), status: "failed", errorMessage: "Old failure" }),
  ],
}
assert.equal(isEarlierGroup(yesterdayGroup, now), false)
assert.equal(isEarlierGroup(olderGroup, now), true)
assert.equal(isEarlierGroup({ label: "Today", posts: [post({ id: "now", scheduledAt: future, status: "scheduled" })] }, now), false)
assert.equal(failedCount(olderGroup.posts), 1)
assert.deepEqual(earlierSummary([olderGroup, { label: "Older still", posts: [post({ id: "bad-2", scheduledAt: at(11, 9), status: "failed" })] }]), {
  posts: 3,
  failed: 2,
})
assert.equal(earlierShouldOpen({ status: "failed", q: "" }), true)
assert.equal(earlierShouldOpen({ status: "", q: "menu" }), true)
assert.equal(earlierShouldOpen({ status: "scheduled", q: "" }), false)
assert.equal(earlierShouldOpen({ status: "", q: "   " }), false)
const placed = groupPosts(
  [
    ...yesterdayGroup.posts,
    ...olderGroup.posts,
    post({ id: "today", scheduledAt: at(14, 15), status: "scheduled" }),
  ],
  now,
)
assert.deepEqual(
  placed.filter((group) => !isEarlierGroup(group, now)).map((group) => group.label),
  ["Today", "Yesterday"],
)
assert.equal(placed.filter((group) => isEarlierGroup(group, now)).length, 1)

const source = post({ id: "src", scheduledAt: at(13, 9), status: "published", content: "Copy me", platforms: ["x"] })
const copy = duplicateFrom(source, "copy", now.getTime())
assert.equal(copy.id, "copy")
assert.equal(copy.content, "Copy me")
assert.equal(canEditPost(source), false)
assert.equal(canEditPost(post({ id: "open", scheduledAt: future, status: "scheduled" })), true)
assert.equal(canEditPost(post({ id: "bad", scheduledAt: at(11, 9), status: "failed" })), true)
assert.equal(canMovePost(post({ id: "open", scheduledAt: future, status: "scheduled" }), future, now.getTime()), true)
assert.equal(canMovePost(post({ id: "bad", scheduledAt: at(11, 9), status: "failed" }), future, now.getTime()), true)
assert.equal(canMovePost(post({ id: "bad", scheduledAt: at(11, 9), status: "failed" }), at(11, 9), now.getTime()), false)
assert.equal(canMovePost(source, future, now.getTime()), false)
const failedEdit = post({ id: "bad", scheduledAt: at(11, 9), status: "failed", content: "Hook", errorMessage: "Old failure" })
const rescheduled = applyEdit(failedEdit, { ...failedEdit, content: "New hook", scheduledAt: future }, now.getTime())
assert.equal(rescheduled.status, "scheduled")
assert.equal(rescheduled.content, "New hook")
assert.equal("errorMessage" in rescheduled, false)
const stillFailed = applyEdit(failedEdit, { ...failedEdit, content: "New hook" }, now.getTime())
assert.equal(stillFailed.status, "failed")
assert.equal(stillFailed.status === "failed" ? stillFailed.errorMessage : "", "Old failure")
assert.equal(nextPostWhen(at(14, 15), now), new Date(at(14, 15)).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }))
assert.equal(nextPostWhen(at(18, 9), now).startsWith(dayLabel(at(18, 9), now)), true)
assert.notEqual(nextPostWhen(at(18, 9), now), new Date(at(18, 9)).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }))
assert.equal(copy.status, "scheduled")
assert.equal(isFutureTime(copy.scheduledAt, now.getTime()), true)
assert.equal(
  duplicateFrom(post({ id: "later", scheduledAt: future, status: "scheduled", content: "Later" }), "copy-2", now.getTime()).scheduledAt,
  future,
)
assert.equal(applyStoredUpdate([source], { ...source, content: "Edited" })?.[0].content, "Edited")
assert.equal(applyStoredUpdate([source], post({ id: "missing", scheduledAt: future, status: "scheduled" })), null)
assert.deepEqual(applyStoredDelete([source], "src"), [])
assert.equal(applyStoredDelete([source], "missing"), null)
assert.equal(channelReady(blankChannel()), false)
assert.equal(channelProblems({ ...blankChannel(), name: "North door" }), "Add an API key.")
assert.equal(channelProblems({ ...blankChannel(), apiKey: "key" }), "Add a secret key.")
assert.equal(channelProblems({ ...blankChannel(), apiKey: "key", secret: "secret", webhook: "not a url" }), "Webhook must be a full URL.")
assert.equal(channelReady({ ...blankChannel(), apiKey: "key", secret: "secret" }), true)
assert.equal(channelReady({ ...blankChannel(), apiKey: "key", secret: "secret", webhook: "https://example.com/hook" }), true)

console.log("schedule checks passed")
