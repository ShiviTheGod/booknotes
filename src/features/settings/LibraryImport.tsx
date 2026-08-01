import { useRef, useState } from 'react'
import { parseGoodreadsCsv } from '../../services/import/goodreads'
import { importBooks } from '../../services/import/importLibrary'
import styles from './SettingsView.module.css'

/**
 * Bringing an existing reading history in.
 *
 * Deliberately not next to "Restore from file" in the Backup section, even though
 * both are a file picker: restoring replaces the whole library, importing adds to
 * it, and those two sitting side by side is how someone loses a shelf.
 */
export default function LibraryImport() {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number }>()
  const [message, setMessage] = useState<string>()
  const [error, setError] = useState<string>()

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setBusy(true)
    setMessage(undefined)
    setError(undefined)
    setProgress(undefined)

    try {
      const parsed = parseGoodreadsCsv(await file.text())

      if (parsed.books.length === 0) {
        setMessage(
          parsed.skippedToRead > 0
            ? `Everything in that file is on your to-read shelf (${parsed.skippedToRead} books), so there was nothing to add yet.`
            : 'That file has no books in it.',
        )
        return
      }

      const summary = await importBooks(parsed.books, (done, total) =>
        setProgress({ done, total }),
      )

      // Every row is accounted for. A count that does not add up to the file is the
      // fastest way to make someone think an import silently ate something.
      const parts = [`Added ${summary.added} ${summary.added === 1 ? 'book' : 'books'}`]
      if (summary.reviews > 0) parts.push(`${summary.reviews} with your rating or review`)
      if (summary.alreadyThere > 0) parts.push(`${summary.alreadyThere} were already here`)
      if (parsed.skippedToRead > 0) parts.push(`${parsed.skippedToRead} to-read left out`)
      if (parsed.skippedUnusable > 0) parts.push(`${parsed.skippedUnusable} unreadable`)

      setMessage(`${parts.join(' · ')}.`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That file could not be read.')
    } finally {
      setBusy(false)
      setProgress(undefined)
    }
  }

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>Import a library</h2>
      <p className={styles.help}>
        Adds the books from a Goodreads export, with their covers, page counts, finish
        dates, and any rating or review you wrote. In Goodreads that file is under{' '}
        <strong>My Books → Import and export → Export Library</strong>.
      </p>
      <p className={styles.help}>
        This <strong>adds to your shelf</strong> rather than replacing it, and running the
        same file twice will not duplicate anything. Books on your <em>to-read</em> shelf are
        left out — this app is for notes on what you are actually reading.
      </p>

      <div className={styles.buttonRow}>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={() => inputRef.current?.click()}
          disabled={busy}
        >
          {busy
            ? progress
              ? `Importing ${progress.done} of ${progress.total}…`
              : 'Reading the file…'
            : 'Choose a Goodreads export'}
        </button>

        <input
          ref={inputRef}
          type="file"
          accept="text/csv,.csv"
          className="sr-only"
          onChange={(event) => void handleFile(event)}
          tabIndex={-1}
        />
      </div>

      {message && <p className={styles.message}>{message}</p>}
      {error && <p className={styles.error}>{error}</p>}
    </section>
  )
}
