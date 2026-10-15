"use client"

import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react"
import { ImageOff, X } from "lucide-react"
import {
  charactersLeft,
  clockShiftNotice,
  countGraphemes,
  formatScheduleSummary,
  imageUrlError,
  LIMITS,
  localInputToUtc,
  PLATFORM_LABEL,
  PLATFORMS,
  scheduleBlockers,
  schedulePreset,
  sortPlatforms,
  toLocalInputValue,
  type Platform,
  type Post,
} from "@/lib/schedule"
import { PlatformIcon } from "./platform-icon"
import styles from "./composer.module.css"

type Field = "content" | "platforms" | "media" | "when"
type Preset = "hour" | "tomorrow" | "monday" | "custom"

const SAMPLES = [
  "https://picsum.photos/id/1015/960/640",
  "https://picsum.photos/id/1060/960/640",
  "https://picsum.photos/id/1027/960/640",
  "https://picsum.photos/id/225/960/640",
]

function fieldFor(reason: string): Field {
  if (reason.startsWith("Write the post")) return "content"
  if (reason.startsWith("Select at least")) return "platforms"
  if (reason.includes(" over its ")) return "content"
  if (reason.startsWith("Choose a time")) return "when"
  return "media"
}

export function Composer({
  onClose,
  onCreate,
  initial,
}: {
  onClose: () => void
  onCreate: (post: Post) => Promise<void>
  initial?: Post
}) {
  const titleId = useId()
  const hintId = useId()
  const imageErrorId = useId()
  const fieldRef = useRef<HTMLTextAreaElement>(null)
  const dialogRef = useRef<HTMLFormElement>(null)
  const [content, setContent] = useState(initial?.content ?? "")
  const [platforms, setPlatforms] = useState<Platform[]>(initial?.platforms ?? ["instagram"])
  const [preview, setPreview] = useState<Platform>(initial?.platforms[0] ?? "instagram")
  const [mediaUrl, setMediaUrl] = useState(initial?.mediaUrl ?? "")
  const [imageBroken, setImageBroken] = useState(false)
  const [when, setWhen] = useState(() =>
    initial ? toLocalInputValue(new Date(initial.scheduledAt)) : toLocalInputValue(new Date(Date.now() + 60 * 60 * 1000)),
  )
  const [preset, setPreset] = useState<Preset>(initial ? "custom" : "hour")
  const [pane, setPane] = useState<"write" | "preview">("write")
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState("")
  const [submitted, setSubmitted] = useState(false)
  const [over, setOver] = useState(false)
  const [dropNote, setDropNote] = useState("")
  const [touched, setTouched] = useState<Record<Field, boolean>>({
    content: false,
    platforms: false,
    media: false,
    when: false,
  })
  const [min] = useState(() => toLocalInputValue(new Date(Date.now() + 60 * 1000)))
  const [openedAt] = useState(when)
  const draftRef = useRef({ content: "", media: "", when: openedAt, initialWhen: openedAt, saving: false })
  const scheduledAt = localInputToUtc(when)
  const imageError = imageUrlError(mediaUrl) || (mediaUrl.trim() && imageBroken ? "That image URL did not load." : "")
  const shiftWarning = clockShiftNotice(when)
  const blockers = [
    ...scheduleBlockers({ content, platforms, scheduledAt, mediaUrl }).filter(
      (reason) => !(initial && scheduledAt === initial.scheduledAt && reason === "Choose a time in the future."),
    ),
    ...(imageBroken && mediaUrl.trim() ? ["That image URL did not load."] : []),
  ]
  const shown = blockers.filter((reason) => submitted || touched[fieldFor(reason)])
  const summary = scheduledAt ? formatScheduleSummary(scheduledAt) : ""

  function touch(field: Field) {
    setTouched((current) => (current[field] ? current : { ...current, [field]: true }))
  }

  const requestClose = useCallback(() => {
    const draftState = draftRef.current
    if (draftState.saving) return
    const dirty = initial
      ? draftState.content !== initial.content ||
        draftState.media !== (initial.mediaUrl ?? "") ||
        draftState.when !== toLocalInputValue(new Date(initial.scheduledAt))
      : Boolean(draftState.content.trim() || draftState.media.trim() || draftState.when !== draftState.initialWhen)
    if (dirty && !window.confirm("Discard this draft?")) return
    onClose()
  }, [initial, onClose])

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
        (node) => {
          if (node.hidden || node.getClientRects().length === 0) return false
          return !("disabled" in node && Boolean((node as HTMLButtonElement).disabled))
        },
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

  function applyPreset(next: Exclude<Preset, "custom">) {
    setPreset(next)
    setWhen(schedulePreset(next))
    touch("when")
  }

  function togglePlatform(platform: Platform) {
    touch("platforms")
    const next = platforms.includes(platform)
      ? platforms.filter((item) => item !== platform)
      : [...platforms, platform]
    setPlatforms(next)
    if (next.includes(platform)) setPreview(platform)
    else if (!next.includes(preview)) setPreview(next[0] ?? "instagram")
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    if (blockers.length > 0 || saving) return
    draftRef.current.saving = true
    setSaving(true)
    setFormError("")
    const image = mediaUrl.trim()
    const post: Post = initial
      ? initial.status === "failed"
        ? {
            id: initial.id,
            content,
            platforms: sortPlatforms(platforms),
            scheduledAt,
            status: "failed",
            errorMessage: initial.errorMessage,
            ...(image ? { mediaUrl: image } : {}),
          }
        : {
            id: initial.id,
            content,
            platforms: sortPlatforms(platforms),
            scheduledAt,
            status: initial.status,
            ...(image ? { mediaUrl: image } : {}),
          }
      : {
          id: crypto.randomUUID(),
          content,
          platforms: sortPlatforms(platforms),
          scheduledAt,
          status: "scheduled",
          ...(image ? { mediaUrl: image } : {}),
        }
    try {
      await onCreate(post)
    } catch (error) {
      draftRef.current.saving = false
      setSaving(false)
      setFormError(error instanceof Error ? error.message : "Could not schedule this post.")
    }
  }

  const hint = shown.length === 0 && blockers.length > 0 ? blockers[0] : ""

  return (
    <div className={styles.composer}>
      <button
        type="button"
        className={styles.backdrop}
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
        className={styles.dialog}
        data-platform={platforms.includes(preview) ? preview : (platforms[0] ?? "instagram")}
        onSubmit={onSubmit}
      >
        <div className={styles.head}>
          <h2 id={titleId}>{initial ? "Edit post" : "Create post"}</h2>
          <button type="button" className={styles.close} onClick={requestClose} disabled={saving}>
            <X size={16} aria-hidden="true" />
            Close
          </button>
        </div>
        <div className={styles.tabs} role="tablist" aria-label="Composer sections">
          <button type="button" role="tab" aria-selected={pane === "write"} onClick={() => setPane("write")}>
            Write
          </button>
          <button type="button" role="tab" aria-selected={pane === "preview"} onClick={() => setPane("preview")}>
            Preview
          </button>
        </div>
        <div className={pane === "preview" ? styles.hideMobile : styles.fields}>
          <label>
            Post
            <textarea
              ref={fieldRef}
              value={content}
              onChange={(event) => {
                setContent(event.target.value)
                touch("content")
              }}
              rows={6}
              placeholder="Write the caption"
              readOnly={saving}
              aria-invalid={shown.some((reason) => fieldFor(reason) === "content") || undefined}
            />
          </label>
          <fieldset disabled={saving}>
            <legend>Platforms</legend>
            <div className={styles.choices}>
              {PLATFORMS.map((platform) => (
                <button
                  key={platform}
                  type="button"
                  className={styles.choice}
                  data-platform={platform}
                  aria-pressed={platforms.includes(platform)}
                  onClick={() => togglePlatform(platform)}
                >
                  <PlatformIcon platform={platform} />
                  {PLATFORM_LABEL[platform]}
                </button>
              ))}
            </div>
          </fieldset>
          <CharacterRings content={content} platforms={platforms} />
          <div
            className={over ? `${styles.drop} ${styles.dropHot}` : styles.drop}
            onDragEnter={(event) => {
              event.preventDefault()
              setOver(true)
            }}
            onDragOver={(event) => {
              event.preventDefault()
              setOver(true)
            }}
            onDragLeave={(event) => {
              if (event.currentTarget.contains(event.relatedTarget as Node)) return
              setOver(false)
            }}
            onDrop={(event) => {
              event.preventDefault()
              setOver(false)
              if (saving) return
              if (event.dataTransfer.files.length > 0) {
                setDropNote("Paste an image URL or choose a sample. This demo does not upload files.")
                return
              }
              const text = event.dataTransfer.getData("text/uri-list") || event.dataTransfer.getData("text/plain")
              const url = text.trim().split(/\s+/)[0] ?? ""
              if (!url) return
              setDropNote("")
              setMediaUrl(url)
              setImageBroken(false)
              touch("media")
            }}
          >
            <p className={styles.hint}>Drop an image link here, paste a URL, or choose a sample.</p>
            {dropNote ? <p className={styles.error}>{dropNote}</p> : null}
            <label>
              Image URL
              <input
                value={mediaUrl}
                onChange={(event) => {
                  setMediaUrl(event.target.value)
                  setImageBroken(false)
                  setDropNote("")
                  touch("media")
                }}
                placeholder="https://example.com/photo.jpg"
                inputMode="url"
                readOnly={saving}
                aria-invalid={Boolean(imageError) && (submitted || touched.media) ? true : undefined}
                aria-describedby={imageError && (submitted || touched.media) ? imageErrorId : undefined}
              />
            </label>
            <div className={styles.samples}>
              {SAMPLES.map((url) => {
                const id = url.match(/id\/(\d+)/)?.[1] ?? url
                return (
                  <button
                    key={url}
                    type="button"
                    className={styles.sample}
                    aria-pressed={mediaUrl.trim() === url}
                    aria-label={`Use sample image ${id}`}
                    disabled={saving}
                    onClick={() => {
                      setDropNote("")
                      setMediaUrl(url)
                      setImageBroken(false)
                      touch("media")
                    }}
                  >
                    <img src={url.replace("/960/640", "/96/96")} alt="" width={48} height={48} />
                  </button>
                )
              })}
            </div>
          </div>
          {imageError && (submitted || touched.media) ? (
            <p id={imageErrorId} className={styles.error}>
              {imageError}
            </p>
          ) : null}
          {mediaUrl.trim() && !imageUrlError(mediaUrl) ? (
            <MediaPreview key={mediaUrl.trim()} url={mediaUrl.trim()} onBroken={() => setImageBroken(true)} />
          ) : null}
          <fieldset disabled={saving}>
            <legend>Schedule</legend>
            <div className={styles.presets}>
              <button type="button" className={styles.preset} aria-pressed={preset === "hour"} onClick={() => applyPreset("hour")}>
                In 1 hour
              </button>
              <button type="button" className={styles.preset} aria-pressed={preset === "tomorrow"} onClick={() => applyPreset("tomorrow")}>
                Tomorrow 9 AM
              </button>
              <button type="button" className={styles.preset} aria-pressed={preset === "monday"} onClick={() => applyPreset("monday")}>
                Next Monday 9 AM
              </button>
              <button type="button" className={styles.preset} aria-pressed={preset === "custom"} onClick={() => setPreset("custom")}>
                Custom
              </button>
            </div>
          </fieldset>
          {preset === "custom" ? (
            <label>
              Schedule
              <input
                type="datetime-local"
                value={when}
                min={min}
                onChange={(event) => {
                  setWhen(event.target.value)
                  touch("when")
                }}
                readOnly={saving}
                required
              />
            </label>
          ) : null}
          {summary ? <p className={styles.hint}>{summary}</p> : null}
          {shiftWarning ? <p className={styles.error}>{shiftWarning}</p> : null}
        </div>
        <div className={pane === "write" ? `${styles.preview} ${styles.hideMobile}` : styles.preview}>
          <PreviewTabs
            platforms={platforms}
            preview={platforms.includes(preview) ? preview : (platforms[0] ?? "instagram")}
            onPreview={setPreview}
          />
          <PlatformPreview
            platform={platforms.includes(preview) ? preview : (platforms[0] ?? "instagram")}
            content={content}
            mediaUrl={mediaUrl.trim() && !imageError ? mediaUrl.trim() : ""}
          />
        </div>
        <div className={styles.submit}>
          {shown.length > 0 ? (
            <ul className={styles.blockers} id={hintId}>
              {shown.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          ) : null}
          {hint ? (
            <p id={hintId} className={styles.hint}>
              {hint}
            </p>
          ) : null}
          {formError ? (
            <p className={styles.error} role="alert">
              {formError}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={blockers.length > 0 || saving}
            aria-describedby={blockers.length > 0 ? hintId : undefined}
          >
            {saving ? (initial ? "Saving…" : "Scheduling…") : initial ? "Save changes" : "Schedule post"}
          </button>
        </div>
      </form>
    </div>
  )
}

function ringTone(count: number, limit: number) {
  if (count > limit) return "over" as const
  if (limit > 0 && count / limit >= 0.81) return "warn" as const
  return "ok" as const
}

function CountRing({ count, limit, numerals }: { count: number; limit: number; numerals: boolean }) {
  const tone = ringTone(count, limit)
  const radius = 16
  const circumference = 2 * Math.PI * radius
  const ratio = limit === 0 ? 0 : Math.min(count / limit, 1)
  const left = limit - count
  return (
    <svg viewBox="0 0 40 40" width="40" height="40" aria-hidden="true">
      <circle className={styles.ringTrack} cx="20" cy="20" r={radius} />
      <circle
        className={tone === "over" ? styles.ringOver : tone === "warn" ? styles.ringNear : styles.ringOk}
        cx="20"
        cy="20"
        r={radius}
        strokeDasharray={`${ratio * circumference} ${circumference}`}
        transform="rotate(-90 20 20)"
      />
      {numerals ? (
        <text x="20" y="23" textAnchor="middle">
          {tone === "over" ? `−${(-left).toLocaleString()}` : count.toLocaleString()}
        </text>
      ) : null}
    </svg>
  )
}

function CharacterRings({ content, platforms }: { content: string; platforms: Platform[] }) {
  if (platforms.length === 0) return <p className={styles.hint}>Select a platform to see its character limit.</p>
  const count = countGraphemes(content)
  return (
    <ul className={styles.rings}>
      {sortPlatforms(platforms).map((platform) => {
        const limit = LIMITS[platform]
        const left = charactersLeft(content, platform)
        const tone = ringTone(count, limit)
        const name =
          tone === "over"
            ? `${PLATFORM_LABEL[platform]} is ${(-left).toLocaleString()} over its ${limit.toLocaleString()} limit`
            : `${PLATFORM_LABEL[platform]} ${count.toLocaleString()} of ${limit.toLocaleString()}`
        return (
          <li key={platform} aria-label={name} data-tone={tone}>
            <CountRing count={count} limit={limit} numerals />
            <span className={styles.ringMeta}>
              <strong>{PLATFORM_LABEL[platform]}</strong>
              <span>
                {count.toLocaleString()} / {limit.toLocaleString()}
              </span>
            </span>
          </li>
        )
      })}
    </ul>
  )
}

function PreviewTabs({
  platforms,
  preview,
  onPreview,
}: {
  platforms: Platform[]
  preview: Platform
  onPreview: (platform: Platform) => void
}) {
  const selected = sortPlatforms(platforms)
  if (selected.length < 2) return null
  return (
    <div className={styles.previewTabs} role="tablist" aria-label="Platform previews">
      {selected.map((platform) => (
        <button key={platform} type="button" role="tab" aria-selected={preview === platform} onClick={() => onPreview(platform)}>
          <PlatformIcon platform={platform} />
          {PLATFORM_LABEL[platform]} preview
        </button>
      ))}
    </div>
  )
}

function Glyph({ d, tone }: { d: string; tone?: "liked" | "tiktok" }) {
  return (
    <svg className={tone ? `${styles.glyph} ${styles[tone]}` : styles.glyph} viewBox="0 0 24 24" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}

const heart = "M12 20s-7-4.4-7-9a4 4 0 0 1 7-2 4 4 0 0 1 7 2c0 4.6-7 9-7 9Z"
const comment = "M6 6h12a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H11l-4 3v-3H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z"
const share = "M12 4v11M8 8l4-4 4 4M6 20h12"
const send = "M4 12 20 5l-6 15-2-6-8-2Z"
const bookmark = "M7 4h10a1 1 0 0 1 1 1v15l-6-3-6 3V5a1 1 0 0 1 1-1Z"
const repeat = "M7 7h9l-2.2-2.2M17 17H8l2.2 2.2"

function Shot({ url, shape }: { url: string; shape: "square" | "wide" | "story" }) {
  if (!url) return <div className={`${styles.shot} ${styles.scene} ${styles[shape]}`} aria-hidden="true" />
  return <img className={`${styles.shot} ${styles[shape]}`} src={url} alt="" />
}

function PlatformPreview({
  platform,
  content,
  mediaUrl,
}: {
  platform: Platform
  content: string
  mediaUrl: string
}) {
  const empty = content.trim().length === 0
  const caption = empty ? "Your caption will show up here." : content.trim()
  const ghost = empty ? styles.ghost : undefined
  const count = countGraphemes(content)
  return (
    <aside className={styles.stage} data-platform={platform} aria-label={`${PLATFORM_LABEL[platform]} preview`}>
      <p className={styles.kicker}>
        <PlatformIcon platform={platform} />
        Live {PLATFORM_LABEL[platform]} preview
      </p>
      {platform === "instagram" ? (
        <article className={styles.ig}>
          <header>
            <span className={styles.igRing}>
              <span className={styles.avatar}>D</span>
            </span>
            <div>
              <strong>dispatch</strong>
              <span>Scheduled</span>
            </div>
            <PlatformIcon platform="instagram" />
          </header>
          <Shot url={mediaUrl} shape="square" />
          <div className={styles.actions}>
            <Glyph d={heart} tone="liked" />
            <Glyph d={comment} />
            <Glyph d={send} />
            <Glyph d={bookmark} />
          </div>
          <p className={styles.likes}>1,284 likes</p>
          <p className={styles.igCaption}>
            <strong>dispatch</strong> <span className={ghost}>{caption}</span>
          </p>
          <p className={styles.quiet}>View all 24 comments</p>
          <p className={styles.ago}>2 hours ago</p>
        </article>
      ) : null}
      {platform === "facebook" ? (
        <article className={styles.fb}>
          <header>
            <span className={`${styles.avatar} ${styles.fbAvatar}`}>
              <PlatformIcon platform="facebook" />
            </span>
            <div>
              <strong>Dispatch</strong>
              <span>Just now · Public</span>
            </div>
          </header>
          <p className={styles.caption}><span className={ghost}>{caption}</span></p>
          <Shot url={mediaUrl} shape="wide" />
          <p className={styles.reactions}>
            <span className={styles.likeDot} />
            <span className={styles.loveDot} />
            248
          </p>
          <div className={styles.fbBar}>
            <span>Like</span>
            <span>Comment</span>
            <span>Share</span>
          </div>
        </article>
      ) : null}
      {platform === "x" ? (
        <article className={styles.tweet}>
          <header>
            <span className={`${styles.avatar} ${styles.xAvatar}`}>
              <PlatformIcon platform="x" />
            </span>
            <div>
              <strong>Dispatch</strong>
              <span>@dispatch · 2h</span>
            </div>
            <span className={styles.xRing}>
              <CountRing count={count} limit={LIMITS.x} numerals={false} />
            </span>
          </header>
          <p className={styles.caption}><span className={ghost}>{caption}</span></p>
          {mediaUrl ? <Shot url={mediaUrl} shape="wide" /> : null}
          <div className={styles.xActions}>
            <span><Glyph d={comment} /> 24</span>
            <span><Glyph d={repeat} /> 86</span>
            <span><Glyph d={heart} tone="liked" /> 1,204</span>
            <span><Glyph d={share} /> 18K</span>
          </div>
        </article>
      ) : null}
      {platform === "tiktok" ? (
        <article className={styles.tt}>
          <Shot url={mediaUrl} shape="story" />
          <div className={styles.ttCopy}>
            <strong>@dispatch</strong>
            <p className={ghost}>{caption}</p>
            <span>♪ original sound — dispatch</span>
          </div>
          <div className={styles.ttRail}>
            <span className={styles.ttAvatar}>D</span>
            <span><Glyph d={heart} tone="tiktok" />12.4K</span>
            <span><Glyph d={comment} tone="tiktok" />186</span>
            <span><Glyph d={bookmark} tone="tiktok" />940</span>
            <span><Glyph d={share} tone="tiktok" />Share</span>
          </div>
        </article>
      ) : null}
    </aside>
  )
}

function MediaPreview({ url, onBroken }: { url: string; onBroken: () => void }) {
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading")
  if (phase === "error") {
    return (
      <p className={styles.hint}>
        <ImageOff size={16} aria-hidden="true" /> Couldn’t load image
      </p>
    )
  }
  return (
    <div className={styles.media}>
      {phase === "loading" ? <span className={styles.mediaSkeleton} /> : null}
      <img
        className={phase === "ready" ? undefined : styles.pending}
        src={url}
        alt=""
        width={120}
        height={80}
        decoding="async"
        onLoad={() => setPhase("ready")}
        onError={() => {
          setPhase("error")
          onBroken()
        }}
      />
    </div>
  )
}
