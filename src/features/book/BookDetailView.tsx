import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../data/db'
import {
  createChapter,
  generateChapters,
  listChapters,
  suggestChapterCount,
} from '../../data/repo/chapters'
import { deleteBook, markFinished, markReading } from '../../data/repo/books'
import BookCover from '../../components/BookCover'
import PageHeader from '../../components/PageHeader'
import BookDetailsForm from './BookDetailsForm'
import styles from './BookDetailView.module.css'

export default function BookDetailView() {
  const { bookId = '' } = useParams()
  const navigate = useNavigate()

  const book = useLiveQuery(() => db.books.get(bookId), [bookId])
  const chapters = useLiveQuery(() => listChapters(bookId), [bookId])
  const noteCounts = useLiveQuery(async () => {
    const notes = await db.notes.where('bookId').equals(bookId).toArray()
    const counts = new Map<string, number>()
    for (const note of notes) {
      counts.set(note.chapterId, (counts.get(note.chapterId) ?? 0) + 1)
    }
    return counts
  }, [bookId])

  const [newChapterTitle, setNewChapterTitle] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [editingDetails, setEditingDetails] = useState(false)

  if (book === undefined) return <p className={styles.loading}>Loading…</p>
  if (book === null) return <p className={styles.loading}>That book is no longer on your shelf.</p>

  const totalNotes = [...(noteCounts?.values() ?? [])].reduce((sum, n) => sum + n, 0)
  const isFinished = book.status === 'finished'

  async function addChapter() {
    const title = newChapterTitle.trim()
    await createChapter(bookId, title)
    setNewChapterTitle('')
  }

  async function fillChapters() {
    const suggested = suggestChapterCount(book?.pageCount)
    await generateChapters(bookId, suggested)
  }

  async function toggleFinished() {
    if (isFinished) await markReading(bookId)
    else await markFinished(bookId)
  }

  async function handleDelete() {
    await deleteBook(bookId)
    navigate('/')
  }

  return (
    <>
      <PageHeader title={book.title} subtitle={book.authors.join(', ') || undefined} backTo="/" />

      <div className={styles.hero}>
        <BookCover book={book} className={styles.heroCover} />

        <div className={styles.heroMeta}>
          <dl className={styles.facts}>
            {book.pageCount ? (
              <div className={styles.fact}>
                <dt>Pages</dt>
                <dd>{book.pageCount}</dd>
              </div>
            ) : null}
            <div className={styles.fact}>
              <dt>Notes</dt>
              <dd>{totalNotes}</dd>
            </div>
            <div className={styles.fact}>
              <dt>Chapters</dt>
              <dd>{chapters?.length ?? 0}</dd>
            </div>
          </dl>

          {book.genres.length > 0 && (
            <div className={styles.genres}>
              {book.genres.map((genre) => (
                <span key={genre} className={styles.genre}>
                  {genre}
                </span>
              ))}
            </div>
          )}

          <button
            type="button"
            className={isFinished ? styles.finishedButton : styles.finishButton}
            onClick={() => void toggleFinished()}
          >
            {isFinished ? `Finished ${formatDate(book.dateFinished)}` : 'Mark as finished'}
          </button>

          {!editingDetails && (
            <button
              type="button"
              className={styles.editDetailsLink}
              onClick={() => setEditingDetails(true)}
            >
              Edit details
            </button>
          )}
        </div>
      </div>

      {editingDetails && <BookDetailsForm book={book} onDone={() => setEditingDetails(false)} />}

      {totalNotes > 0 && (
        <Link to={`/book/${bookId}/summary`} className={styles.summaryLink}>
          <span>
            <strong>Read the summary</strong>
            <span className={styles.summaryHint}>
              All {totalNotes} {totalNotes === 1 ? 'note' : 'notes'} in one place
            </span>
          </span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
      )}

      <section className={styles.chaptersSection}>
        <h2 className={styles.sectionTitle}>Chapters</h2>

        {chapters && chapters.length > 0 ? (
          <ul className={styles.chapterList}>
            {chapters.map((chapter) => {
              const count = noteCounts?.get(chapter.id) ?? 0
              return (
                <li key={chapter.id}>
                  <Link
                    to={`/book/${bookId}/chapter/${chapter.id}`}
                    className={styles.chapterRow}
                  >
                    <span className={styles.chapterNumber}>{chapter.number}</span>
                    <span className={styles.chapterTitle}>{chapter.title}</span>
                    <span className={count > 0 ? styles.chapterCount : styles.chapterCountEmpty}>
                      {count > 0 ? count : '—'}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className={styles.emptyChapters}>
            No chapters yet. Add them as you read, or lay them all out at once.
          </p>
        )}

        <div className={styles.addChapterRow}>
          <input
            className={styles.chapterInput}
            value={newChapterTitle}
            onChange={(event) => setNewChapterTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void addChapter()
            }}
            placeholder="New chapter title"
            aria-label="New chapter title"
            enterKeyHint="done"
          />
          <button type="button" className={styles.addChapterButton} onClick={() => void addChapter()}>
            Add
          </button>
        </div>

        {(chapters?.length ?? 0) === 0 && (
          <button type="button" className={styles.ghostButton} onClick={() => void fillChapters()}>
            Generate {suggestChapterCount(book.pageCount)} chapters from the page count
          </button>
        )}
      </section>

      <section className={styles.danger}>
        {confirmingDelete ? (
          <div className={styles.confirmRow}>
            <p className={styles.confirmText}>
              Delete “{book.title}” and all {totalNotes} of its notes? This can't be undone.
            </p>
            <div className={styles.confirmActions}>
              <button
                type="button"
                className={styles.ghostButton}
                onClick={() => setConfirmingDelete(false)}
              >
                Keep it
              </button>
              <button
                type="button"
                className={styles.deleteButton}
                onClick={() => void handleDelete()}
              >
                Delete
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className={styles.removeLink}
            onClick={() => setConfirmingDelete(true)}
          >
            Remove from shelf
          </button>
        )}
      </section>
    </>
  )
}

function formatDate(iso?: string): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}
