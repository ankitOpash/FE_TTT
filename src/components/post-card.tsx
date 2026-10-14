"use client"

import { useState } from "react"
import { RefreshCw } from "lucide-react"
import { clipGraphemes, formatClock, PLATFORM_LABEL, sortPlatforms, type Post } from "@/lib/schedule"
import { PlatformIcon } from "./platform-icon"

export function clip(content: string): string {
  return clipGraphemes(content)
}

export function PostCard({
  post,
  retrying,
  onRetry,
}: {
  post: Post
  retrying: boolean
  onRetry: (post: Post) => void
}) {
  const [broken, setBroken] = useState(false)
  return (
    <article className="card" data-status={post.status} aria-busy={retrying}>
      <div className="card-top">
        <time dateTime={post.scheduledAt}>{formatClock(post.scheduledAt)}</time>
        <span className={`pill pill-${post.status}`}>{post.status}</span>
      </div>
      <p className="preview">{post.content}</p>
      {post.mediaUrl && !broken ? (
        <img
          className="thumb"
          src={post.mediaUrl}
          alt=""
          width={960}
          height={640}
          loading="lazy"
          decoding="async"
          onError={() => setBroken(true)}
        />
      ) : null}
      {post.mediaUrl && broken ? <p className="hint">Image unavailable.</p> : null}
      <ul className="platforms">
        {sortPlatforms(post.platforms).map((platform) => (
          <li key={platform}>
            <PlatformIcon platform={platform} />
            <span>{PLATFORM_LABEL[platform]}</span>
          </li>
        ))}
      </ul>
      {retrying ? <p className="hint">Saving this retry…</p> : null}
      {post.status === "failed" && !retrying ? <p className="error-line">{post.errorMessage}</p> : null}
      {post.status === "failed" ? (
        <button
          type="button"
          className="retry"
          aria-label={`Retry: ${clip(post.content)}`}
          onClick={() => onRetry(post)}
          disabled={retrying}
        >
          <RefreshCw size={16} aria-hidden="true" />
          {retrying ? "Retrying" : "Retry"}
        </button>
      ) : null}
    </article>
  )
}
