"use client"

import { AlertTriangle, CalendarClock, Check, CircleAlert, FileText } from "lucide-react"
import { STATUSES, type Status } from "@/lib/schedule"
import styles from "./stats-strip.module.css"

export function StatsStrip({
  counts,
  status,
  retrying,
  onStatus,
  onRetryAll,
}: {
  counts: Record<Status, number>
  status: Status | ""
  retrying: boolean
  onStatus: (status: Status) => void
  onRetryAll: () => void
}) {
  const icons = {
    scheduled: CalendarClock,
    published: Check,
    failed: CircleAlert,
  }
  return (
    <ul className={styles.strip}>
      {STATUSES.map((item) => {
        const Icon = icons[item]
        return (
          <li key={item}>
            <button
              type="button"
              aria-pressed={status === item}
              data-status={item}
              className={item === "failed" && counts.failed > 0 ? styles.failed : undefined}
              onClick={() => onStatus(item)}
            >
              <Icon size={16} aria-hidden="true" />
              <span>{item[0].toUpperCase() + item.slice(1)}</span>
              <strong>{counts[item]}</strong>
              {item === "failed" && counts.failed > 0 ? (
                <span className={styles.note}>
                  <AlertTriangle size={14} aria-hidden="true" />
                  Needs attention
                </span>
              ) : null}
            </button>
          </li>
        )
      })}
      <li>
        <div className={styles.metric} data-status="draft">
          <FileText size={16} aria-hidden="true" />
          <span>Drafts</span>
          <strong>0</strong>
        </div>
      </li>
      {counts.failed > 0 ? (
        <li>
          <button type="button" className={styles.retryAll} onClick={onRetryAll} disabled={retrying}>
            {retrying ? "Retrying…" : "Retry all"}
          </button>
        </li>
      ) : null}
    </ul>
  )
}
