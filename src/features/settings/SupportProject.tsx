import { supportLinks } from '../../config/support'
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
  const links = supportLinks()
  if (links.length === 0) return null

  return (
    <section className={styles.section}>
      <p className={styles.body}>
        BookNotes is free, and every part of it stays free — there is nothing here to
        unlock. If it has earned its place on your phone and you feel like it, you can
        put something in the jar.
      </p>

      {/* Every jar looks the same. Styling one as the primary action would be picking
          a payment service on someone's behalf, and the app has no stake in which. */}
      <div className={styles.buttons}>
        {links.map((link) => (
          <a
            key={link.url}
            className={styles.button}
            href={link.url}
            // Opens outside the app: in Safari on the web, and in the system browser
            // from the installed app, where a saved card and Apple Pay actually live.
            target="_blank"
            rel="noopener noreferrer"
          >
            {link.label}
          </a>
        ))}
      </div>

      <p className={styles.note}>
        {links.length > 1
          ? 'Either one, whichever you already have. Entirely optional — nothing changes either way.'
          : 'Entirely optional. Nothing changes either way.'}
      </p>
    </section>
  )
}
