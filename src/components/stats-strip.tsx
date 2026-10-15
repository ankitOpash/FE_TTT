"use client"

import { AlertTriangle } from "lucide-react"
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
  return (
    <ul className={styles.strip}>
      {STATUSES.map((item) => (
        <li key={item}>
          <button
            type="button"
            aria-pressed={status === item}
            className={item === "failed" && counts.failed > 0 ? styles.failed : undefined}
            onClick={() => onStatus(item)}
          >
            {item[0].toUpperCase() + item.slice(1)} {counts[item]}
            {item === "failed" && counts.failed > 0 ? (
              <span className={styles.note}>
                <AlertTriangle size={14} aria-hidden="true" />
                Needs attention
              </span>
            ) : null}
          </button>
        </li>
      ))}
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
