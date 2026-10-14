# Dispatch

A frontend-only social post scheduler. Compose a post for Facebook, Instagram, X, and TikTok, put it on the queue, and retry anything that failed. Nothing here talks to a real social network.

## Run it

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
npm run check
npm run lint
npm run build
```

`npm run check` runs the scheduling rules: day grouping, character limits, a future time, the UTC round trip, and the 20% retry failure cutoff.

## Live demo

Deploy the Next.js app on Vercel (or Netlify) and paste the URL here.

```bash
npx vercel
```

Live demo: _add the deployed URL_

## What you can do

- The queue is grouped into Today, Tomorrow, later dates, then earlier dates. Each card shows a text preview, platform icons, the local time, and a status.
- Filter by platform and status, and search the text. The choices stay in the URL (`platform`, `status`, `q`), so a refresh keeps them.
- New post takes text, one or more platforms, an optional image URL, and a date-time.
- Each selected platform has a live counter. Limits are X 280, Instagram 2,200, TikTok 2,200, and Facebook 5,000. Scheduling stays disabled when any selected platform is over its limit.
- The time has to be in the future. It is stored as a UTC ISO string and shown in the browser timezone.
- Retry updates the card immediately, waits one second, and fails about 20% of the time. A failure puts the post back to failed and shows the new error.
- Loading, empty, and error states are all reachable. Add `?forceError=1` to see the error state, then use Try again.

## Decisions

- Next.js App Router and TypeScript, with plain CSS. No UI kit and no mock-server process.
- Mock data is `public/posts.json` (32 posts). The client waits before resolving, the same way a request would. `localStorage` keeps posts you create and retries you finish, so a refresh does not wipe them. Reset demo data loads the file again.
- The file is anchored to 14 October 2026 UTC. On load, those calendar days shift onto the current UTC day, so Today and Tomorrow still show up next month. The stored field is still `scheduledAt` in UTC.
- A platform filter matches a post when that platform is one of its targets.
- A successful retry sets the post back to `scheduled`. This demo does not publish.
- A refresh during the one-second retry can keep the previous failed post, because the optimistic change is not written until the mock call finishes.
- Character counts use the JavaScript string length. An image URL is optional and is not uploaded.
- There is no login. Publishing to Facebook, Instagram, X, or TikTok is out of scope.

Share the repository and the live URL with bhanu@flintzy.com when the deploy is up.
