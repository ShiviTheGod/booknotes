import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { createBook } from '../../data/repo/books'
import styles from './AddBookView.module.css'

/**
 * Manual entry fallback for books the APIs don't know about — self-published titles,
 * translations, old editions, or anything where the search simply comes up short.
 * Only the title is required; everything else can be filled in later.
 */
export default function ManualBookForm({ onCancel }: { onCancel: () => void }) {
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [pageCount, setPageCount] = useState('')
  const [genres, setGenres] = useState('')
  const [saving, setSaving] = useState(false)

  const canSave = title.trim().length > 0 && !saving

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canSave) return

    setSaving(true)
    try {
      const parsedPages = Number.parseInt(pageCount, 10)

      const book = await createBook({
        title: title.trim(),
        authors: author.trim() ? [author.trim()] : [],
        pageCount: Number.isFinite(parsedPages) && parsedPages > 0 ? parsedPages : undefined,
        genres: genres
          .split(',')
          .map((genre) => genre.trim())
          .filter(Boolean),
        source: 'manual',
      })

      navigate(`/book/${book.id}`)
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
          placeholder="The book's title"
          autoFocus
          required
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Author</span>
        <input
          className={styles.input}
          value={author}
          onChange={(event) => setAuthor(event.target.value)}
          placeholder="Who wrote it"
        />
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
        <span className={styles.help}>Separate with commas. These become your shelf sections.</span>
      </label>

      <div className={styles.formActions}>
        <button type="button" className={styles.secondaryButton} onClick={onCancel}>
          Back to search
        </button>
        <button type="submit" className={styles.primaryButton} disabled={!canSave}>
          {saving ? 'Adding…' : 'Add book'}
        </button>
      </div>
    </form>
  )
}
