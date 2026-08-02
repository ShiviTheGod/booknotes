/**
 * Light, dark, or whatever the phone is doing.
 *
 * The palette lives behind `:root[data-theme]` rather than a media query, because a
 * media query can only follow the system and cannot be overridden from inside the
 * page. This resolves the choice to a concrete `light` or `dark` and writes it to
 * the root element; the CSS then needs one selector instead of two palettes.
 *
 * Kept in localStorage rather than in the settings table, for two reasons. It has to
 * be readable synchronously before the first paint — an async read from IndexedDB
 * would show the wrong palette for a frame and then snap, which is exactly the flash
 * this is meant to avoid. And it is a property of this screen in this room, not of
 * the library: a phone read at night and a tablet read at a desk should be allowed
 * to disagree, so this deliberately does not sync.
 */

export type ThemeChoice = 'auto' | 'light' | 'dark'

const STORAGE_KEY = 'booknotes.theme'
const DARK_QUERY = '(prefers-color-scheme: dark)'

function isChoice(value: unknown): value is ThemeChoice {
  return value === 'auto' || value === 'light' || value === 'dark'
}

export function readThemeChoice(): ThemeChoice {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return isChoice(stored) ? stored : 'auto'
  } catch {
    // Private browsing can throw on access rather than return null. Following the
    // system is the right answer when the preference cannot be read.
    return 'auto'
  }
}

function systemPrefersDark(): boolean {
  return typeof matchMedia === 'function' && matchMedia(DARK_QUERY).matches
}

export function resolveTheme(choice: ThemeChoice): 'light' | 'dark' {
  if (choice === 'auto') return systemPrefersDark() ? 'dark' : 'light'
  return choice
}

/** Writes the resolved palette to the document. Safe to call as often as you like. */
export function applyResolvedTheme(choice: ThemeChoice): void {
  document.documentElement.dataset.theme = resolveTheme(choice)
}

export function setThemeChoice(choice: ThemeChoice): void {
  try {
    localStorage.setItem(STORAGE_KEY, choice)
  } catch {
    // Not being able to remember it is not a reason to refuse to apply it now.
  }
  applyResolvedTheme(choice)
}

/**
 * Follow the system while the choice is `auto`.
 *
 * Without this, "auto" would only be evaluated at startup and the app would stay
 * light through a sunset that turned the rest of the phone dark.
 */
export function watchSystemTheme(): () => void {
  if (typeof matchMedia !== 'function') return () => {}

  const query = matchMedia(DARK_QUERY)
  const onChange = () => {
    if (readThemeChoice() === 'auto') applyResolvedTheme('auto')
  }

  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}
