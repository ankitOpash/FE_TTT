# Dispatch

Frontend-only scheduler for Facebook, Instagram, X, and TikTok. Compose a post, place it on a dated queue, and retry anything that failed. The app never calls a social network, never authenticates, and never publishes.

Live demo: [https://fetest-alpha.vercel.app](https://fetest-alpha.vercel.app)

## Installation

```bash
npm install
```

Requires Node.js 20 and npm. The app lives in this folder.

## Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Build

```bash
npm run build
npm start
```

`npm run build` produces the production bundle. `npm start` serves that bundle.

## Testing

```bash
npm run check
npm run lint
```

`npm run check` typechecks `src/lib/schedule.ts` and runs `src/lib/schedule.check.ts` with Node's built-in assert. Those checks cover:

- Today, Tomorrow, Yesterday, later dates, and earlier dates, compared on local calendar days
- Character limits at the boundary: X 280/281, Instagram and TikTok 2200/2201, Facebook 5000/5001
- Grapheme clusters: 30 family emoji count as 30, not as UTF-16 code units
- Combined platform, status, search, and local date-range filters
- A local week starting Sunday, and an invalid day such as 2026-02-31 rejected
- Publishing health from resolved posts, and the next future scheduled post
- Image URL validation
- Local date-time converted to a UTC ISO string and read back
- Seed dates shifted from 14 October 2026 UTC onto the current UTC day
- Retry failure when the random value is below 0.2, and success at 0.2 and above
- A future failed post becomes `scheduled` on a successful retry. A past failed post becomes `published`
- A failed retry restores the original post, including its original error message
- A second retry claim for the same id is rejected, and a stale attempt token is ignored

`npm run test:e2e` builds the app, serves it on port 3100, and runs `e2e/scheduler.spec.ts` with Playwright in the installed Chrome. No browser download is needed, but Chrome must be installed. The tests cover:

- Fast typing in search keeps every character and reaches the URL
- Platform and status filters stack and survive reload and Back
- A failed retry restores the original error and shows the toast. A successful retry of a past post marks it published
- Reset during a retry keeps all 32 posts, including after a reload
- The composer cannot be closed or escaped while a post is saving
- Grapheme counters, and the over-limit block
- A post at 00:30 tomorrow in Pacific/Auckland lands under Tomorrow and is stored in UTC
- On a 375px screen the collapsed filter button shows how many filters are active

`npm test` runs the checks and then the e2e tests. `npm run lint` runs ESLint. There is no backend.

## Architecture

| Path | Role |
| --- | --- |
| `src/app/page.tsx` | Server page. Suspense wraps the client dashboard. |
| `src/components/scheduler.tsx` | Queue state, URL filters, retry, and which view is open. |
| `src/components/shell.tsx` | Sidebar, page header, and settings. |
| `src/components/filter-bar.tsx` | Search, platform chips, status tabs, and the mobile filter sheet. |
| `src/components/stats-strip.tsx` | Scheduled, published, failed, and draft counts for the current filters. |
| `src/components/overview.tsx` | Home summary: counts, failed posts, and the next scheduled posts. |
| `src/components/channels.tsx` | Per-platform API key, secret, and webhook. Stored in this browser only. |
| `src/components/insights.tsx` | Publishing health, this week's results, and the media library. |
| `src/components/composer.tsx` | Create post dialog, validation, and preview. |
| `src/components/post-card.tsx` | One post in the queue. |
| `src/components/views.tsx` | Calendar and board. |
| `src/components/queue-boundary.tsx` | Error boundary around the dashboard. |
| `src/components/platform-icon.tsx` | Platform icons. |
| `src/lib/schedule.ts` | Post type, platform limits, grouping, filtering, timezone conversion, retry outcome. |
| `src/lib/api.ts` | Mock load, create, and retry. Reads and writes `localStorage`. |
| `public/posts.json` | 32 seeded posts. |
| `src/app/globals.css` | Design tokens and layout. |

Filtering and date grouping stay in pure functions so they can be checked without rendering.

## Mock API

`fetchPosts` waits 700ms. `?forceError=1` rejects before any posts are shown. Try again clears that flag and reloads.

On a first visit the client fetches `/posts.json`, shifts the seed dates, and saves the result. After that, `localStorage` key `dispatch.posts.v1` is the source of truth. Reset demo data deletes that key and loads the file again.

`createPost` waits 400ms, then runs the same schedule checks as the form. The first failing reason is thrown and shown on the form. On success the mock API reads the stored queue, prepends the post, and writes it back. It does not write if the queue was reset while it was waiting, or if storage is missing. In that case the form shows "The queue changed in another tab. Reload to see the latest posts." While a post is saving, Close, Escape, and the backdrop do nothing and the fields are read-only.

`retryPost` takes the post id and waits 1000ms. It fails when `Math.random()` is below 0.2. Tests pass a fixed number instead of `Math.random`. The card changes as soon as Retry is clicked: a future post becomes `scheduled`, and a post whose time is already past becomes `published`. That optimistic row is not written until the mock call succeeds, so a refresh during the wait still shows the failed post. On failure storage is left untouched, the original post is put back on screen, including its original `errorMessage`, and a toast says "The platform rejected this retry. The post is still failed." A reset during the wait bumps a revision stored in `localStorage` key `dispatch.posts.rev`, so a reset in another tab counts too, and the late call does not save. A second click on the same post is ignored while the request is in flight. An older request cannot overwrite a newer one.

## UTC and local time

`scheduledAt` is always a UTC ISO string (`...Z`). The composer reads the datetime input as the browser's local time and converts it with `localInputToUtc`. If that clock time does not exist because of a daylight-saving gap, the field warns and names the time that will actually be stored. The queue prints the instant with `toLocaleTimeString`, and each day group uses the local midnight via `localDayStart`. Group order is Today, Tomorrow, later local dates ascending, then Yesterday and older dates with the most recent first. Posts inside a day are chronological.

The seed file is anchored to 14 October 2026 UTC. `shiftSeed` moves every timestamp by whole UTC days so Today and Tomorrow still exist when the file is opened later. The stored field remains `scheduledAt` in UTC.

## Design

Inter, a light slate canvas, and an optional dark theme stored in `localStorage` as `dispatch.theme`. Indigo is the action color and the scheduled color. Published is green. Failed is rose. Cards use a 14px radius and a hairline border. The sidebar lists Overview, Queue, Calendar, Analytics, Media library, and Settings. Overview is the summary. Queue is the post list. On a phone it stays off-canvas behind Open menu. A right-hand rail on wide screens shows publishing health, the busiest published hour, and the next scheduled post. Those numbers come from the posts in the queue. Drafts stay at 0 because a post is scheduled, published, or failed.

Lucide icons are used for Create post, Close, Retry, and a missing image. Platform marks are inline SVGs because Lucide does not ship those logos. Counts use grapheme clusters (`Intl.Segmenter`), so an emoji is one character. Text is never truncated to fit a limit. Counters turn amber from 81% of a limit and red only when the caption is over the limit.

## Assumptions

- Several platforms can be selected. A platform filter matches a post that includes any selected platform. One status can be selected at a time.
- Search is a case-insensitive trim of the post text. The box keeps its own text and writes `q` to the URL after a short pause, so fast typing is not dropped. Each filter change is applied on top of the latest query, not a stale copy. Platform, status, and date changes push a history entry. Search replaces the current entry. Unknown `platform` and `status` values are removed. `from` and `to` must be real `YYYY-MM-DD` days or they are removed.
- Query names are `platform`, `status`, `q`, `from`, and `to`. This week writes the local Sunday-through-Saturday range. Stat counts and the status tabs follow platform, search, and date, and still show every status so the queue and the counts stay in step.
- Publishing health is published posts divided by published plus failed posts. Scheduled posts are not in that rate. The week bars count published and failed posts on each local day. The busiest hour is the local hour with the most published posts. The next post is the earliest scheduled post still in the future.
- The sidebar channels open Channel setup. Each platform can store an account name, API key, secret key, and optional webhook in `localStorage` key `dispatch.channels.v1`. Nothing is sent to a platform. The account chip says Demo account.
- View opens the full post. Edit saves caption, platforms, image, and time back onto a scheduled or failed post and keeps its status. A published post stays as it went out: Edit is unavailable, and the calendar will not move it. Duplicate adds a scheduled copy. Delete removes the post from this browser after a confirmation. These actions stay in local storage.
- The composer starts with Instagram selected. An image is optional on every platform, including Instagram. A non-http(s) URL, or one that fails to load, blocks scheduling.
- A successful retry of a future post is `scheduled`. A successful retry of a past post is `published`, so the queue does not contain a scheduled post in the past. This demo still does not call a network to publish.
- Empty content, no platform, an over-limit platform, a bad image URL, or a time that is not strictly in the future disables Schedule post. The empty-caption message stays quiet until there is something else to correct.
- Closing a composer that has text, an image URL, or a changed time asks before discarding the draft.
- Character counts are grapheme clusters. They are not X's weighted count, where a URL counts as 23 and some emoji count as 2.
- There is no login.

## Verification

Checked on 15 October 2026 in this folder:

- `npx tsc --noEmit --pretty false --incremental false` exited 0.
- `npm run check` printed `schedule checks passed`.
- `npx eslint src e2e --max-warnings 0` exited 0.
- `npm run test:e2e` built the app, served it on port 3100, and passed all 9 tests in `e2e/scheduler.spec.ts` in 58.7s.
- `npm run build` compiled successfully, finished its TypeScript check, and prerendered `/`.

The queue was also exercised in the browser: This week wrote `from` and `to` and changed the visible count from 32 to 21, Clear filters restored 32, search wrote `q`, Create post opened with Schedule disabled for an empty caption, theme toggled, and at 375px the button read `Filters, 2 active` while the sidebar sat off-canvas.

## Deployment

The production build is a standard Next.js app. No extra config file is required.

Vercel, from this folder:

```bash
npx vercel
```

Netlify: connect the repository, set the build command to `npm run build`, and publish the Next.js output with the official Next.js runtime.

The live demo is [https://fetest-alpha.vercel.app](https://fetest-alpha.vercel.app).
