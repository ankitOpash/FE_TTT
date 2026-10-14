"use client"

import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react"
import { ImageOff, X } from "lucide-react"
import {
  charactersLeft,
  clockShiftNotice,
  countGraphemes,
  imageUrlError,
  LIMITS,
  localInputToUtc,
  PLATFORM_LABEL,
  PLATFORMS,
  scheduleBlockers,
  sortPlatforms,
  toLocalInputValue,
  type Platform,
  type Post,
} from "@/lib/schedule"
import { PlatformIcon } from "./platform-icon"

export function Composer({
  onClose,
  onCreate,
}: {
  onClose: () => void
  onCreate: (post: Post) => Promise<void>
}) {
  const titleId = useId()
  const imageErrorId = useId()
  const fieldRef = useRef<HTMLTextAreaElement>(null)
  const dialogRef = useRef<HTMLFormElement>(null)
  const [content, setContent] = useState("")
  const [platforms, setPlatforms] = useState<Platform[]>(["instagram"])
  const [mediaUrl, setMediaUrl] = useState("")
  const [imageBroken, setImageBroken] = useState(false)
  const [when, setWhen] = useState(() => toLocalInputValue(new Date(Date.now() + 60 * 60 * 1000)))
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState("")
  const [min] = useState(() => toLocalInputValue(new Date(Date.now() + 60 * 1000)))
  const [openedAt] = useState(when)
  const draftRef = useRef({ content: "", media: "", when: openedAt, initialWhen: openedAt, saving: false })
  const scheduledAt = localInputToUtc(when)
  const imageError = imageUrlError(mediaUrl) || (mediaUrl.trim() && imageBroken ? "That image URL did not load." : "")
  const shiftWarning = clockShiftNotice(when)
  const blockers = [
    ...scheduleBlockers({ content, platforms, scheduledAt, mediaUrl }),
    ...(imageBroken && mediaUrl.trim() ? ["That image URL did not load."] : []),
  ]
  const visibleBlockers = blockers.filter((reason) => !(reason.startsWith("Write the post") && !content.trim()))

  const requestClose = useCallback(() => {
    const draftState = draftRef.current
    if (draftState.saving) return
    const dirty = Boolean(draftState.content.trim() || draftState.media.trim() || draftState.when !== draftState.initialWhen)
    if (dirty && !window.confirm("Discard this draft?")) return
    onClose()
  }, [onClose])

  useEffect(() => {
    draftRef.current = { content, media: mediaUrl, when, initialWhen: openedAt, saving }
  }, [content, mediaUrl, openedAt, when, saving])

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    fieldRef.current?.focus()
    return () => {
      previousFocus?.focus()
    }
  }, [])

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        requestClose()
        return
      }
      if (event.key !== "Tab") return
      const dialog = dialogRef.current
      if (!dialog) return
      const items = [...dialog.querySelectorAll<HTMLElement>("button, input, textarea, select, a[href]")].filter(
        (node) => !node.hidden && !node.hasAttribute("disabled"),
      )
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener("keydown", onKey)
    }
  }, [requestClose])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (blockers.length > 0 || saving) return
    draftRef.current.saving = true
    setSaving(true)
    setFormError("")
    const post: Post = {
      id: crypto.randomUUID(),
      content,
      platforms: sortPlatforms(platforms),
      scheduledAt,
      status: "scheduled",
    }
    const image = mediaUrl.trim()
    if (image) post.mediaUrl = image
    try {
      await onCreate(post)
    } catch (error) {
      draftRef.current.saving = false
      setSaving(false)
      setFormError(error instanceof Error ? error.message : "Could not schedule this post.")
    }
  }

  return (
    <div className="composer">
      <button
        type="button"
        className="backdrop"
        aria-label="Close composer"
        onClick={requestClose}
        disabled={saving}
      />
      <form
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={saving}
        className="dialog"
        onSubmit={onSubmit}
      >
        <div className="dialog-head">
          <h2 id={titleId}>New post</h2>
          <button type="button" className="text-button" onClick={requestClose} disabled={saving}>
            <X size={16} aria-hidden="true" />
            Close
          </button>
        </div>
        <label>
          Post
          <textarea
            ref={fieldRef}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            rows={6}
            placeholder="Write the caption"
            readOnly={saving}
          />
        </label>
        <fieldset disabled={saving}>
          <legend>Platforms</legend>
          <div className="choices">
            {PLATFORMS.map((platform) => {
              const selected = platforms.includes(platform)
              return (
                <button
                  key={platform}
                  type="button"
                  className="choice"
                  aria-pressed={selected}
                  onClick={() =>
                    setPlatforms((current) =>
                      current.includes(platform)
                        ? current.filter((item) => item !== platform)
                        : [...current, platform],
                    )
                  }
                >
                  <PlatformIcon platform={platform} />
                  {PLATFORM_LABEL[platform]}
                </button>
              )
            })}
          </div>
        </fieldset>
        {platforms.length > 0 ? (
          <ul className="counters">
            {sortPlatforms(platforms).map((platform) => {
              const limit = LIMITS[platform]
              const count = countGraphemes(content)
              const left = charactersLeft(content, platform)
              const over = left < 0
              const near = !over && left <= 20
              const width = Math.min(count / limit, 1) * 100
              return (
                <li
                  key={platform}
                  data-over={over}
                  data-near={near}
                  aria-label={
                    over
                      ? `${PLATFORM_LABEL[platform]} is ${(-left).toLocaleString()} over its ${limit.toLocaleString()} limit`
                      : `${PLATFORM_LABEL[platform]} ${count.toLocaleString()} of ${limit.toLocaleString()}`
                  }
                >
                  <span>{PLATFORM_LABEL[platform]}</span>
                  <span className="meter" aria-hidden="true">
                    <span style={{ width: `${width}%` }} />
                  </span>
                  <span>
                    {count.toLocaleString()} / {limit.toLocaleString()}
                  </span>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="hint">Select a platform to see its character limit.</p>
        )}
        <label>
          Image URL
          <input
            value={mediaUrl}
            onChange={(event) => {
              setMediaUrl(event.target.value)
              setImageBroken(false)
            }}
            placeholder="https://example.com/photo.jpg"
            inputMode="url"
            readOnly={saving}
            aria-invalid={Boolean(imageError)}
            aria-describedby={imageError ? imageErrorId : undefined}
          />
        </label>
        {imageError ? (
          <p id={imageErrorId} className="error-line">
            {imageError}
          </p>
        ) : null}
        {mediaUrl.trim() && !imageUrlError(mediaUrl) ? (
          <MediaPreview url={mediaUrl.trim()} onBroken={() => setImageBroken(true)} />
        ) : null}
        <label>
          Schedule
          <input
            type="datetime-local"
            value={when}
            min={min}
            onChange={(event) => setWhen(event.target.value)}
            readOnly={saving}
            required
          />
        </label>
        <p className="hint">Saved in UTC. The queue shows this time in your timezone.</p>
        {shiftWarning ? <p className="error-line">{shiftWarning}</p> : null}
        {!content.trim() ? <p className="hint">Write a caption to schedule.</p> : null}
        {visibleBlockers.length > 0 ? (
          <ul className="blockers">
            {visibleBlockers.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        ) : null}
        {formError ? (
          <p className="error-line" role="alert">
            {formError}
          </p>
        ) : null}
        <div className="submit-bar">
          <button type="submit" className="primary" disabled={blockers.length > 0 || saving}>
            {saving ? "Scheduling…" : "Schedule post"}
          </button>
        </div>
      </form>
    </div>
  )
}

function MediaPreview({ url, onBroken }: { url: string; onBroken: () => void }) {
  const [broken, setBroken] = useState(false)
  if (broken) {
    return (
      <p className="hint">
        <ImageOff size={16} aria-hidden="true" /> Image unavailable.
      </p>
    )
  }
  return (
    <img
      className="preview-image"
      src={url}
      alt=""
      width={960}
      height={640}
      decoding="async"
      onError={() => {
        setBroken(true)
        onBroken()
      }}
    />
  )
}
