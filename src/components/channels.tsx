"use client"

import { useMemo, useState, useSyncExternalStore } from "react"
import { Eye, EyeOff } from "lucide-react"
import {
  PLATFORMS,
  PLATFORM_LABEL,
  blankChannel,
  channelProblems,
  channelReady,
  type ChannelDraft,
  type Platform,
} from "@/lib/schedule"
import { PlatformIcon } from "./platform-icon"
import styles from "./channels.module.css"

const STORAGE_KEY = "dispatch.channels.v1"

const HINT: Record<Platform, string> = {
  facebook: "Page access token as the API key, and the Meta app secret as the secret key.",
  instagram: "Instagram token as the API key, and the Meta app secret as the secret key.",
  x: "API key and API key secret from the X developer portal.",
  tiktok: "Client key as the API key, and client secret as the secret key.",
}

const listeners = new Set<() => void>()

function emptyStore(): Record<Platform, ChannelDraft> {
  return {
    facebook: blankChannel(),
    instagram: blankChannel(),
    x: blankChannel(),
    tiktok: blankChannel(),
  }
}

function parseStore(raw: string): Record<Platform, ChannelDraft> {
  const next = emptyStore()
  if (!raw) return next
  try {
    const parsed = JSON.parse(raw) as Partial<Record<Platform, Partial<ChannelDraft>>>
    for (const platform of PLATFORMS) {
      const item = parsed[platform]
      if (!item || typeof item !== "object") continue
      next[platform] = {
        name: typeof item.name === "string" ? item.name : "",
        apiKey: typeof item.apiKey === "string" ? item.apiKey : "",
        secret: typeof item.secret === "string" ? item.secret : "",
        webhook: typeof item.webhook === "string" ? item.webhook : "",
      }
    }
  } catch {
    return emptyStore()
  }
  return next
}

function readRaw(): string {
  return localStorage.getItem(STORAGE_KEY) ?? ""
}

export function useChannelStore(): Record<Platform, ChannelDraft> {
  const raw = useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    readRaw,
    () => "",
  )
  return useMemo(() => parseStore(raw), [raw])
}

export function writeChannelStore(store: Record<Platform, ChannelDraft>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  listeners.forEach((listener) => listener())
}

export function ChannelSetup({
  platform,
  onPlatform,
  onNotice,
}: {
  platform: Platform
  onPlatform: (platform: Platform) => void
  onNotice: (message: string) => void
}) {
  const store = useChannelStore()
  return (
    <div className={styles.wrap}>
      <div className={styles.switcher} role="tablist" aria-label="Channels">
        {PLATFORMS.map((item) => {
          const ready = channelReady(store[item])
          return (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={item === platform}
              aria-label={`${PLATFORM_LABEL[item]} setup`}
              onClick={() => onPlatform(item)}
            >
              <PlatformIcon platform={item} />
              <span>{PLATFORM_LABEL[item]}</span>
              <small>{ready ? "Saved" : "Not set up"}</small>
            </button>
          )
        })}
      </div>
      <ChannelForm
        key={platform}
        platform={platform}
        initial={store[platform]}
        onNotice={onNotice}
        onCommit={(draft) => writeChannelStore({ ...store, [platform]: draft })}
      />
    </div>
  )
}

function ChannelForm({
  platform,
  initial,
  onCommit,
  onNotice,
}: {
  platform: Platform
  initial: ChannelDraft
  onCommit: (draft: ChannelDraft) => void
  onNotice: (message: string) => void
}) {
  const [draft, setDraft] = useState(initial)
  const [reveal, setReveal] = useState(false)
  const problem = channelProblems(draft)
  const started = Boolean(draft.name.trim() || draft.apiKey.trim() || draft.secret.trim() || draft.webhook.trim())
  const label = PLATFORM_LABEL[platform]
  const stored = channelReady(initial)

  function update(patch: Partial<ChannelDraft>) {
    setDraft((current) => ({ ...current, ...patch }))
  }

  function save() {
    if (problem) return
    const next = {
      name: draft.name.trim(),
      apiKey: draft.apiKey.trim(),
      secret: draft.secret.trim(),
      webhook: draft.webhook.trim(),
    }
    onCommit(next)
    setDraft(next)
    onNotice(`${label} setup saved on this device.`)
  }

  function remove() {
    onCommit(blankChannel())
    setDraft(blankChannel())
    onNotice(`${label} setup removed.`)
  }

  return (
    <form
      className={styles.card}
      onSubmit={(event) => {
        event.preventDefault()
        save()
      }}
    >
      <header>
        <PlatformIcon platform={platform} />
        <div>
          <h2>{label}</h2>
          <p className={stored ? styles.ready : styles.waiting}>{stored ? "Saved on this device" : "Not set up"}</p>
        </div>
      </header>
      <p className={styles.hint}>{HINT[platform]} Keys stay in this browser. Dispatch does not call the platform.</p>
      <label className={styles.field}>
        <span>Account name</span>
        <input value={draft.name} autoComplete="off" placeholder="Page or account name" onChange={(event) => update({ name: event.target.value })} />
      </label>
      <label className={styles.field}>
        <span>API key</span>
        <input
          value={draft.apiKey}
          type={reveal ? "text" : "password"}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => update({ apiKey: event.target.value })}
        />
      </label>
      <label className={styles.field}>
        <span>Secret key</span>
        <input
          value={draft.secret}
          type={reveal ? "text" : "password"}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => update({ secret: event.target.value })}
        />
      </label>
      <label className={styles.field}>
        <span>Webhook</span>
        <input
          value={draft.webhook}
          type="url"
          inputMode="url"
          autoComplete="off"
          placeholder="https://example.com/dispatch/webhook"
          onChange={(event) => update({ webhook: event.target.value })}
        />
      </label>
      <p className={styles.hint}>Optional. Where the platform would send publish and failure callbacks.</p>
      {started && problem ? <p className={styles.error}>{problem}</p> : null}
      <div className={styles.actions}>
        <button type="submit" className={styles.save} disabled={Boolean(problem)}>
          Save setup
        </button>
        <button type="button" className={styles.ghost} aria-pressed={reveal} onClick={() => setReveal((open) => !open)}>
          {reveal ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
          {reveal ? "Hide keys" : "Show keys"}
        </button>
        {stored ? (
          <button type="button" className={styles.ghost} onClick={remove}>
            Remove
          </button>
        ) : null}
      </div>
    </form>
  )
}
