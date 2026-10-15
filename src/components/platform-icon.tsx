import type { Platform } from "@/lib/schedule"
import styles from "./platform-icon.module.css"

export function PlatformIcon({ platform }: { platform: Platform }) {
  return (
    <svg className={`${styles.mark} ${styles[platform]}`} viewBox="0 0 24 24" aria-hidden="true">
      {platform === "facebook" ? (
        <path d="M14.5 8.5H16V6h-1.8C11.7 6 11 7.2 11 9.1V10H9v2.5h2V18h2.6v-5.5h1.8l.4-2.5H13.6V9.2c0-.5.2-.7.9-.7Z" />
      ) : null}
      {platform === "instagram" ? (
        <>
          <rect x="4.5" y="4.5" width="15" height="15" rx="4" />
          <circle cx="12" cy="12" r="3.3" />
          <circle className={styles.dot} cx="16.6" cy="7.5" r="0.9" />
        </>
      ) : null}
      {platform === "x" ? (
        <path d="M6 6.5 10.7 12 6.2 17.5h1.8l3.4-4 2.8 4H18l-4.8-6.3L17.6 6.5h-1.8l-3 3.6-2.5-3.6H6Z" />
      ) : null}
      {platform === "tiktok" ? (
        <path d="M14 6c.4 2.2 1.6 3.4 3.5 3.6v2.2c-1.2 0-2.3-.4-3.3-1.1v5.1a4.6 4.6 0 1 1-4.6-4.6c.3 0 .5 0 .8.1v2.4a2.2 2.2 0 1 0 1.6 2.1V6H14Z" />
      ) : null}
    </svg>
  )
}
