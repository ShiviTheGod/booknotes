import { NavLink, Outlet } from 'react-router-dom'
import styles from './AppLayout.module.css'

/** Bottom tab bar + scrollable content area. Mobile-first; widens to a centred column on tablets. */
export default function AppLayout() {
  return (
    <div className={styles.shell}>
      <main className={styles.content}>
        <Outlet />
      </main>

      <nav className={styles.nav} aria-label="Main">
        <NavLink to="/" end className={navClass}>
          <ShelfIcon />
          <span>Shelf</span>
        </NavLink>
        <NavLink to="/stats" className={navClass}>
          <StatsIcon />
          <span>Stats</span>
        </NavLink>
        <NavLink to="/settings" className={navClass}>
          <SettingsIcon />
          <span>Settings</span>
        </NavLink>
      </nav>
    </div>
  )
}

function navClass({ isActive }: { isActive: boolean }) {
  return isActive ? `${styles.navLink} ${styles.navLinkActive}` : styles.navLink
}

/* Icons are inline so there is no icon dependency and no extra network request.
   stroke="currentColor" lets them inherit the active/inactive nav colour. */

function ShelfIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <rect x="3" y="4" width="4.5" height="16" rx="1" />
      <rect x="9.5" y="4" width="4.5" height="16" rx="1" />
      <path d="M16.2 5.4l3.6 1 -3.1 15.1 -3.6-1z" />
    </svg>
  )
}

function StatsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M4 20V10" strokeLinecap="round" />
      <path d="M10 20V4" strokeLinecap="round" />
      <path d="M16 20v-7" strokeLinecap="round" />
      <path d="M22 20H2" strokeLinecap="round" />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1" />
    </svg>
  )
}
