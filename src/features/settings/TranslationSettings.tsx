import { useEffect, useState } from 'react'
import {
  defaultUserLanguage,
  getSetting,
  setSetting,
  SETTING_KEYS,
} from '../../data/repo/settings'
import {
  initTranslation,
  supportedTargetLanguages,
  translationAvailability,
} from '../../services/translation'
import { isNativeIos, type TranslationStatus } from '../../services/native/plugins'
import styles from './SettingsView.module.css'

/**
 * Choose the language photographed pages get translated into.
 *
 * The picker is filled from the device, not from a list written here. Apple's set of
 * translatable languages changes between iOS releases and does not cover everything,
 * and offering a language that then silently never translates anything would be worse
 * than saying plainly that it is not supported.
 */
export default function TranslationSettings() {
  const [language, setLanguage] = useState<string>()
  const [languages, setLanguages] = useState<string[]>([])
  const [status, setStatus] = useState<TranslationStatus>()
  const [saving, setSaving] = useState(false)

  const native = isNativeIos()

  useEffect(() => {
    let cancelled = false

    void (async () => {
      const current = await getSetting(SETTING_KEYS.userLanguage, defaultUserLanguage())
      const [list, state] = await Promise.all([
        supportedTargetLanguages(),
        translationAvailability(current),
      ])
      if (cancelled) return

      setLanguage(current)
      setLanguages(list)
      setStatus(state)
    })()

    return () => {
      cancelled = true
    }
  }, [])

  async function choose(next: string) {
    setSaving(true)
    try {
      setLanguage(next)
      await setSetting(SETTING_KEYS.userLanguage, next)
      // Re-registers the provider against the new target, so the change takes effect
      // on the next photo without needing a restart.
      setStatus(await initTranslation(next))
    } finally {
      setSaving(false)
    }
  }

  // The current choice is always offered, even when the device cannot translate into
  // it — otherwise the picker would silently show a different language than the one
  // actually saved.
  const options = language && !languages.includes(language) ? [language, ...languages] : languages

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>Translation</h2>
      <p className={styles.help}>
        Text read out of a photographed page gets translated into your language and kept
        alongside the original. The photo and the extracted text are never replaced.
      </p>

      {language && options.length > 0 && (
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Translate into</span>
          <select
            className={styles.select}
            value={language}
            disabled={saving}
            onChange={(event) => void choose(event.target.value)}
          >
            {options.map((code) => (
              <option key={code} value={code}>
                {languageName(code)}
              </option>
            ))}
          </select>
        </label>
      )}

      <p className={styles.help}>{explain(status, language, native)}</p>
    </section>
  )
}

function explain(
  status: TranslationStatus | undefined,
  language: string | undefined,
  native: boolean,
): string {
  if (status === undefined) return 'Checking what this device can translate…'

  switch (status) {
    case 'installed':
      return `Ready. ${languageName(language)} is downloaded and works offline.`
    case 'supported':
      return `Available. iOS downloads ${languageName(language)} the first time a page needs it, then it works offline.`
    case 'unsupported':
      return `Apple's on-device translation doesn't cover ${languageName(language)} yet. Extracted text will be kept in its original language.`
    case 'unavailable':
      return native
        ? 'On-device translation needs iOS 18 or later. Extracted text will be kept in its original language.'
        : 'Translation only works in the installed app. It runs entirely on the phone — a website would have to send your notes to someone else’s server to do it, which this app will not do.'
  }
}

/**
 * 'cs' → 'Czech'. Falls back to the raw code where there is no name for it.
 *
 * Named in English rather than in the device's locale, which is what leaving the
 * first argument undefined would do. These names are read inside English sentences —
 * "Ready. Czech is downloaded and works offline." — and a Czech phone turned that
 * into "Ready. čeština is downloaded", one word of another language mid-sentence.
 * The picker had the same problem: an English screen listing "čeština".
 *
 * Dates elsewhere in the app deliberately still follow the device. A date format is a
 * regional convention rather than UI copy, so 2. 8. 2026 is right for whoever reads it.
 */
function languageName(code: string | undefined): string {
  if (!code) return 'your language'

  try {
    return new Intl.DisplayNames('en', { type: 'language' }).of(code) ?? code
  } catch {
    return code
  }
}
