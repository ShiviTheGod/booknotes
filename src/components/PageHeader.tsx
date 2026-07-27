import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import styles from './PageHeader.module.css'

interface PageHeaderProps {
  title: string
  subtitle?: string
  /** Shows a back chevron. Falls back to browser history when no explicit target is given. */
  backTo?: string | true
  action?: ReactNode
}

export default function PageHeader({ title, subtitle, backTo, action }: PageHeaderProps) {
  const navigate = useNavigate()

  return (
    <header className={styles.header}>
      {backTo && (
        <button
          type="button"
          className={styles.back}
          onClick={() => (backTo === true ? navigate(-1) : navigate(backTo))}
          aria-label="Go back"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}

      <div className={styles.titles}>
        <h1 className={styles.title}>{title}</h1>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      </div>

      {action && <div className={styles.action}>{action}</div>}
    </header>
  )
}
