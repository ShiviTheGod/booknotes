import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { watchKeyboard } from '../services/keyboard'
import styles from './AppLayout.module.css'

/** Bottom tab bar + scrollable content area. Mobile-first; widens to a centred column on tablets. */
export default function AppLayout() {
  const [keyboardOpen, setKeyboardOpen] = useState(false)

  useEffect(() => watchKeyboard(setKeyboardOpen), [])

  return (
    <div className={styles.shell} data-keyboard={keyboardOpen ? 'open' : 'closed'}>
      {/*
        The scroll container is this element rather than the document, so the page
        itself has nothing to overscroll. See global.css for why that matters on iOS.
        The width-limited column sits inside it so that on a wide window the whole
        window scrolls, not just the centre strip.
      */}
      <main className={styles.scroll}>
        <div className={styles.content}>
          <Outlet />
        </div>
      </main>

      {/* Hidden outright while the keyboard is up: it would otherwise sit on top of
          the keyboard, covering the results of whatever is being typed. */}
      <nav className={styles.nav} aria-label="Main" inert={keyboardOpen}>
        <NavLink to="/" end className={navClass}>
          <ShelfIcon />
          <span>Shelf</span>
        </NavLink>
        <NavLink to="/search" className={navClass}>
          <SearchIcon />
          <span>Search</span>
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

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.6-3.6" strokeLinecap="round" />
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
