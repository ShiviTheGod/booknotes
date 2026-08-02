import { SUPPORT_LABEL, SUPPORT_URL, supportEnabled } from '../../config/support'
import styles from './SupportProject.module.css'

/**
 * A voluntary tip jar.
 *
 * Deliberately toothless. It sits in Settings rather than anywhere on the reading
 * path, it never appears twice, it does not count how often it has been ignored,
 * and nothing in the app is withheld behind it. A reading journal that nags is
 * worse than one that earns nothing.
 *
 * The sentence about everything staying free is the important part, not the button.
 * Someone who reads it and taps nothing has understood it correctly.
 */
export default function SupportProject() {
  if (!supportEnabled()) return null

  return (
    <section className={styles.section}>
      <p className={styles.body}>
        BookNotes is free, and every part of it stays free — there is nothing here to
        unlock. If it has earned its place on your phone and you feel like it, you can
        put something in the jar.
      </p>

      <a
        className={styles.button}
        href={SUPPORT_URL}
        // Opens outside the app: in Safari on the web, and in the system browser from
        // the installed app, where a saved card and Apple Pay actually live.
        target="_blank"
        rel="noopener noreferrer"
      >
        {SUPPORT_LABEL}
      </a>

      <p className={styles.note}>Entirely optional. Nothing changes either way.</p>
    </section>
  )
}
