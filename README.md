# Dispatch

Frontend-only scheduler for Facebook, Instagram, X, and TikTok. Compose a post, place it on a dated queue, and retry anything that failed. The app never calls a social network, never authenticates, and never publishes.

There is no live URL yet. Deploy only after that step is approved, then replace this sentence with the deployed address.

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

- Today, Tomorrow, later dates, and earlier dates, compared on local calendar days
- Character limits at the boundary: X 280/281, Instagram and TikTok 2200/2201, Facebook 5000/5001
- Combined platform, status, and search filters
- Image URL validation
- Local date-time converted to a UTC ISO string and read back
- Seed dates shifted from 14 October 2026 UTC onto the current UTC day
- Retry failure when the random value is below 0.2, and success at 0.2 and above
- Successful retry clears the error and sets status to `scheduled`
- Failed retry restores the original post and shows the new error
- A second retry claim for the same id is rejected, and a stale attempt token is ignored

`npm run lint` runs ESLint. There is no separate test runner and no backend.

## Architecture

| Path | Role |
| --- | --- |
| `src/app/page.tsx` | Server page. Suspense wraps the client dashboard. |
| `src/components/scheduler.tsx` | Queue, filters, composer, and retry UI. |
| `src/lib/schedule.ts` | Post type, platform limits, grouping, filtering, timezone conversion, retry outcome. |
| `src/lib/api.ts` | Mock load, create, and retry. Reads and writes `localStorage`. |
| `public/posts.json` | 32 seeded posts. |
| `src/app/globals.css` | Design tokens and layout. |

The dashboard is one client component. Filtering and date grouping stay in pure functions so they can be checked without rendering.

## Mock API

`fetchPosts` waits 700ms. `?forceError=1` rejects before any posts are shown. Try again clears that flag and reloads.

On a first visit the client fetches `/posts.json`, shifts the seed dates, and saves the result. After that, `localStorage` key `dispatch.posts.v1` is the source of truth. Reset demo data deletes that key and loads the file again.

`createPost` waits 400ms, then runs the same schedule checks as the form. The first failing reason is thrown and shown on the form.

`retryPost` waits 1000ms. It fails when `Math.random()` is below 0.2. Tests pass a fixed number instead of `Math.random`. A successful retry stores status `scheduled` and removes `errorMessage`. A failed retry stores the original content, platforms, time, and media, with status `failed` and the message "The platform rejected this retry. The post is still failed." The card shows "retrying" immediately, the button stays disabled until the request finishes, and a second click on the same post is ignored. An older request cannot overwrite a newer one. The optimistic change is not written until the mock call settles, so a refresh during that second can still show the previous failed post.

## UTC and local time

`scheduledAt` is always a UTC ISO string (`...Z`). The composer reads the datetime input as the browser's local time and converts it with `localInputToUtc`. The queue prints that instant with `toLocaleTimeString`, and each day group uses the local midnight via `localDayStart`. Group order is Today, Tomorrow, later local dates ascending, then earlier dates with the most recent first. Posts inside a day are chronological.

The seed file is anchored to 14 October 2026 UTC. `shiftSeed` moves every timestamp by whole UTC days so Today and Tomorrow still exist when the file is opened later. The stored field remains `scheduledAt` in UTC.

## Design

Light zinc canvas, near-black text, indigo actions, and separate colors for scheduled, published, and failed. Borders stay hairline. Lucide icons are used for New post, Close, Retry, and a missing image. Platform marks are inline SVGs because Lucide does not ship those logos. Character counts use JavaScript string length and the text is never truncated to fit a limit.

## Assumptions

- One platform and one status can be selected at a time. A platform filter matches a post that includes that platform.
- Search is a case-insensitive trim of the post text. Platform and status changes push a history entry. Search replaces the current entry so typing does not flood the back stack.
- Query names are `platform`, `status`, and `q`.
- A successful retry is `scheduled`, not `published`. This demo does not publish.
- An image URL is optional. It must be http or https when present, and a URL that fails to load blocks scheduling.
- Empty content, no platform, an over-limit platform, a bad image URL, or a time that is not strictly in the future disables Schedule post.
- There is no login.

## Deployment

The production build is a standard Next.js app. No extra config file is required.

Vercel, from this folder:

```bash
npx vercel
```

Netlify: connect the repository, set the build command to `npm run build`, and publish the Next.js output with the official Next.js runtime.

Add the live URL to the top of this file only after that deploy succeeds.
