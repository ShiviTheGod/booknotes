import { useEffect, useState } from 'react'
import {
  readThemeChoice,
  resolveTheme,
  setThemeChoice,
  type ThemeChoice,
} from '../../services/theme'
import styles from './AppearanceSettings.module.css'

const OPTIONS: Array<{ value: ThemeChoice; label: string }> = [
  { value: 'auto', label: 'Automatic' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

export default function AppearanceSettings() {
  const [choice, setChoice] = useState<ThemeChoice>(readThemeChoice)

  // Reflects a system change while Automatic is selected, so the line underneath does
  // not go on claiming "currently light" after the phone has gone dark.
  const [resolved, setResolved] = useState(() => resolveTheme(readThemeChoice()))
  useEffect(() => {
    const observer = new MutationObserver(() =>
      setResolved(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'),
    )
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  function pick(value: ThemeChoice) {
    setThemeChoice(value)
    setChoice(value)
  }

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>Appearance</h2>

      <div className={styles.segmented} role="radiogroup" aria-label="Appearance">
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={choice === option.value}
            className={choice === option.value ? styles.optionOn : styles.option}
            onClick={() => pick(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <p className={styles.help}>
        {choice === 'auto'
          ? `Following your phone, which is ${resolved} right now. It changes with the system, including on a schedule if you have one set.`
          : `Staying ${choice} whatever your phone does.`}
      </p>

      <p className={styles.note}>
        Set per device. Your phone and tablet can differ, and this is not carried by sync
        or by a backup.
      </p>
    </section>
  )
}
