import { useState, type FormEvent } from 'react'
import type { Book } from '../../data/types'
import { updateBook } from '../../data/repo/books'
import styles from './BookDetailsForm.module.css'

/**
 * Correct what a book search got wrong.
 *
 * Metadata arrives from Google Books or Open Library and is often close but not right —
 * a page count for a different edition, a genre nobody would choose, an author listed
 * surname-first. Without this the only fix was deleting the book and re-adding it by
 * hand, which throws away every note attached to it.
 *
 * The cover is deliberately not editable here. It is cached as a blob when the book is
 * added, and replacing it is a different job from correcting a typo.
 */
export default function BookDetailsForm({
  book,
  onDone,
}: {
  book: Book
  onDone: () => void
}) {
  const [title, setTitle] = useState(book.title)
  const [authors, setAuthors] = useState(book.authors.join(', '))
  const [pageCount, setPageCount] = useState(book.pageCount ? String(book.pageCount) : '')
  const [genres, setGenres] = useState(book.genres.join(', '))
  const [saving, setSaving] = useState(false)

  const canSave = title.trim().length > 0 && !saving

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canSave) return

    setSaving(true)
    try {
      const parsedPages = Number.parseInt(pageCount, 10)

      await updateBook(book.id, {
        title: title.trim(),
        authors: splitList(authors),
        // Clearing the field removes the page count rather than storing 0, which would
        // otherwise be counted as a real length in the pages-read estimate.
        pageCount: Number.isFinite(parsedPages) && parsedPages > 0 ? parsedPages : undefined,
        genres: splitList(genres),
      })
      onDone()
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <label className={styles.field}>
        <span className={styles.label}>Title</span>
        <input
          className={styles.input}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          required
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Author</span>
        <input
          className={styles.input}
          value={authors}
          onChange={(event) => setAuthors(event.target.value)}
          placeholder="Who wrote it"
        />
        <span className={styles.help}>Separate several with commas.</span>
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Pages</span>
        <input
          className={styles.input}
          value={pageCount}
          onChange={(event) => setPageCount(event.target.value)}
          placeholder="e.g. 320"
          inputMode="numeric"
          pattern="[0-9]*"
        />
        <span className={styles.help}>Used for the pages-read estimate on your stats.</span>
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Genres</span>
        <input
          className={styles.input}
          value={genres}
          onChange={(event) => setGenres(event.target.value)}
          placeholder="Psychology, Essays"
        />
        <span className={styles.help}>
          The first one decides which shelf section this book files under.
        </span>
      </label>

      <div className={styles.actions}>
        <button type="button" className={styles.cancel} onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className={styles.save} disabled={!canSave}>
          {saving ? 'Saving…' : 'Save details'}
        </button>
      </div>
    </form>
  )
}

function splitList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}
