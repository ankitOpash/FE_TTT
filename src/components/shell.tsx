"use client"

import { useEffect, useState } from "react"
import {
  BarChart3,
  CalendarDays,
  Columns3,
  ImageIcon,
  LayoutDashboard,
  List,
  Plus,
  Settings,
  X,
} from "lucide-react"
import { PLATFORMS, PLATFORM_LABEL, channelReady, type Platform } from "@/lib/schedule"
import { useChannelStore } from "./channels"
import { PlatformIcon } from "./platform-icon"
import styles from "./shell.module.css"

export type SchedulerView = "overview" | "queue" | "calendar" | "analytics" | "media" | "settings" | "channels" | "board"

const NAV: { id: SchedulerView; label: string; icon: typeof List }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "queue", label: "Queue", icon: List },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "board", label: "Board", icon: Columns3 },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "media", label: "Media library", icon: ImageIcon },
  { id: "settings", label: "Settings", icon: Settings },
]

export function Sidebar({
  view,
  open,
  channel,
  onView,
  onClose,
  onChannel,
}: {
  view: SchedulerView
  open: boolean
  channel: Platform
  onView: (view: SchedulerView) => void
  onClose: () => void
  onChannel: (platform: Platform) => void
}) {
  const channels = useChannelStore()
  return (
    <aside className={open ? `${styles.side} ${styles.sideOpen}` : styles.side} aria-label="Application">
      <div className={styles.brandRow}>
        <span className={styles.mark} aria-hidden="true">
          D
        </span>
        <strong>Dispatch</strong>
        <button type="button" className={styles.closeNav} onClick={onClose}>
          <X size={16} aria-hidden="true" />
          Close
        </button>
      </div>
      <nav className={styles.nav} aria-label="Primary">
        {NAV.map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.id}
              type="button"
              aria-current={view === item.id ? "page" : undefined}
              onClick={() => {
                onView(item.id)
                onClose()
              }}
            >
              <Icon size={16} aria-hidden="true" />
              {item.label}
            </button>
          )
        })}
      </nav>
      <div className={styles.channels}>
        <p>Channels</p>
        <ul>
          {PLATFORMS.map((platform) => {
            const ready = channelReady(channels[platform])
            const name = channels[platform].name.trim()
            return (
              <li key={platform}>
                <button
                  type="button"
                  aria-label={`Set up ${PLATFORM_LABEL[platform]}`}
                  aria-current={view === "channels" && channel === platform ? "true" : undefined}
                  data-ready={ready ? "true" : "false"}
                  onClick={() => {
                    onChannel(platform)
                    onClose()
                  }}
                >
                  <PlatformIcon platform={platform} />
                  <span>
                    <strong>{PLATFORM_LABEL[platform]}</strong>
                    <small>{ready ? name || "Saved" : "Not set up"}</small>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
      <div className={styles.account}>
        <span aria-hidden="true">D</span>
        <div>
          <strong>Demo account</strong>
          <small>Local preview</small>
        </div>
      </div>
    </aside>
  )
}

export function PageHeader({
  title,
  description,
  ready,
  weekOn,
  onWeek,
  onNew,
  onMenu,
  onTheme,
  onPalette,
}: {
  title: string
  description: string
  ready: boolean
  weekOn: boolean
  onWeek: () => void
  onNew: () => void
  onMenu: () => void
  onTheme: () => void
  onPalette: () => void
}) {
  const setNode = useNavHeight(true)
  return (
    <header ref={setNode} className={styles.pageHead}>
      <button type="button" className={styles.menu} onClick={onMenu}>
        Open menu
      </button>
      <div className={styles.titles}>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.ghost} aria-label="Open commands" onClick={onPalette}>
          Commands
        </button>
        <button type="button" className={styles.ghost} aria-label="Color theme" onClick={onTheme}>
          Theme
        </button>
        <button type="button" className={styles.week} aria-pressed={weekOn} onClick={onWeek}>
          This week
        </button>
        <button type="button" className={styles.create} onClick={onNew} disabled={!ready}>
          <Plus size={16} aria-hidden="true" />
          Create post
        </button>
      </div>
    </header>
  )
}

export function SettingsPanel({ zone, onTheme }: { zone: string; onTheme: () => void }) {
  return (
    <section className={styles.settings}>
      <h2>Appearance</h2>
      <p>Light is the default. Theme follows this browser until you change it.</p>
      <button type="button" onClick={onTheme}>
        Color theme
      </button>
      <h2>Time</h2>
      <p>Scheduled times are stored as UTC and shown in {zone}.</p>
    </section>
  )
}

export function useNavHeight(active: boolean) {
  const [node, setNode] = useState<HTMLElement | null>(null)
  useEffect(() => {
    if (!node || !active) return
    const apply = () => document.documentElement.style.setProperty("--nav-h", `${node.offsetHeight}px`)
    apply()
    const observer = new ResizeObserver(apply)
    observer.observe(node)
    return () => observer.disconnect()
  }, [active, node])
  return setNode
}
