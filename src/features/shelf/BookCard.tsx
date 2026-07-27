import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../data/db'
import type { Book } from '../../data/types'
import BookCover from '../../components/BookCover'
import styles from './BookCard.module.css'

/**
 * One book on the shelf. Tapping it opens that book's notes — never the book's text,
 * which this app deliberately never stores.
 */
export default function BookCard({
  book,
  showFinishedDate = false,
}: {
  book: Book
  showFinishedDate?: boolean
}) {
  const noteCount = useLiveQuery(
    () => db.notes.where('bookId').equals(book.id).count(),
    [book.id],
    // Third arg is the value shown before the query resolves — avoids a "0 notes" flash.
    undefined,
  )

  const isFinished = book.status === 'finished'

  return (
    <Link to={`/book/${book.id}`} className={styles.card}>
      <div className={styles.coverWrap}>
        <BookCover book={book} className={isFinished ? styles.coverFinished : undefined} />

        {isFinished && (
          <span className={styles.seal} aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <path d="M4 12.5l5.2 5.2L20 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        )}
      </div>

      <div className={styles.meta}>
        <span className={styles.title}>{book.title}</span>
        {book.authors.length > 0 && <span className={styles.author}>{book.authors[0]}</span>}

        <span className={styles.detail}>
          {noteCount !== undefined && noteCount > 0
            ? `${noteCount} ${noteCount === 1 ? 'note' : 'notes'}`
            : 'No notes yet'}
          {showFinishedDate && book.dateFinished && ` · ${formatDay(book.dateFinished)}`}
        </span>
      </div>

      {isFinished && <span className="sr-only">Finished</span>}
    </Link>
  )
}

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}
