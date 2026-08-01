import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../data/db'
import type { Book } from '../../data/types'
import { SETTING_KEYS, setSetting } from '../../data/repo/settings'
import PageHeader from '../../components/PageHeader'
import BookCard from './BookCard'
import styles from './ShelfView.module.css'

type ShelfMode = 'genre' | 'timeline'

export default function ShelfView() {
  // useLiveQuery re-runs on any write to the underlying tables, so the shelf stays
  // current without manual invalidation after adding a book or finishing one.
  const books = useLiveQuery(() => db.books.orderBy('createdAt').reverse().toArray(), [])
  const storedMode = useLiveQuery(() => db.settings.get(SETTING_KEYS.shelfView), [])

  const mode: ShelfMode = (storedMode?.value as ShelfMode) ?? 'genre'

  function chooseMode(next: ShelfMode) {
    void setSetting(SETTING_KEYS.shelfView, next)
  }

  const reading = useMemo(() => books?.filter((b) => b.status === 'reading') ?? [], [books])
  const finished = useMemo(() => books?.filter((b) => b.status === 'finished') ?? [], [books])

  return (
    <>
      <PageHeader
        title="Your Shelf"
        subtitle={books ? shelfSubtitle(reading.length, finished.length) : undefined}
        action={
          <Link to="/add" className={styles.addButton}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
            </svg>
            <span className="sr-only">Add a book</span>
          </Link>
        }
      />

      {books === undefined ? (
        <p className={styles.loading}>Opening your shelf…</p>
      ) : books.length === 0 ? (
        <EmptyShelf />
      ) : (
        <>
          <div className={styles.toggle} role="tablist" aria-label="Shelf arrangement">
            <ModeTab label="By genre" active={mode === 'genre'} onClick={() => chooseMode('genre')} />
            <ModeTab
              label="By timeline"
              active={mode === 'timeline'}
              onClick={() => chooseMode('timeline')}
            />
          </div>

          {mode === 'genre' ? (
            <GenreShelf books={books} />
          ) : (
            <TimelineShelf reading={reading} finished={finished} />
          )}
        </>
      )}
    </>
  )
}

function shelfSubtitle(reading: number, finished: number): string {
  const parts: string[] = []
  if (reading > 0) parts.push(`${reading} in progress`)
  if (finished > 0) parts.push(`${finished} finished`)
  return parts.length > 0 ? parts.join(' · ') : 'Nothing here yet'
}

function ModeTab({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={active ? `${styles.tab} ${styles.tabActive}` : styles.tab}
      onClick={onClick}
    >
      {label}
    </button>
  )
}

/**
 * Books grouped by genre.
 *
 * Each book is filed under its *primary* genre only, the way a library shelves a
 * physical copy. Filing a book under all of its genres was the first attempt and it
 * read badly: eight books spread across sixteen mostly-single-book sections, with the
 * same cover appearing four times. The remaining genres are still kept on the book and
 * shown on its detail page — they're just not used to duplicate it across the shelf.
 */
function GenreShelf({ books }: { books: Book[] }) {
  const groups = useMemo(() => {
    const map = new Map<string, Book[]>()

    for (const book of books) {
      const genre = book.genres[0] ?? 'Unshelved'
      const bucket = map.get(genre)
      if (bucket) bucket.push(book)
      else map.set(genre, [book])
    }

    return [...map.entries()]
      .sort(([a, aBooks], [b, bBooks]) => {
        // Bigger shelves first, alphabetical within a tie. "Unshelved" always sinks.
        if (a === 'Unshelved') return 1
        if (b === 'Unshelved') return -1
        if (bBooks.length !== aBooks.length) return bBooks.length - aBooks.length
        return a.localeCompare(b)
      })
      .map(([genre, genreBooks]) => ({ genre, books: genreBooks }))
  }, [books])

  return (
    <div className={styles.sections}>
      {groups.map(({ genre, books: genreBooks }) => (
        <section key={genre} className={styles.section}>
          <h2 className={styles.sectionTitle}>
            {genre}
            <span className={styles.sectionCount}>{genreBooks.length}</span>
          </h2>
          <div className={styles.grid}>
            {genreBooks.map((book) => (
              <BookCard key={book.id} book={book} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

/** Currently-reading first, then finished books grouped by the month they were finished. */
function TimelineShelf({ reading, finished }: { reading: Book[]; finished: Book[] }) {
  const months = useMemo(() => {
    const map = new Map<string, Book[]>()

    for (const book of finished) {
      if (!book.dateFinished) continue
      // Slice rather than parse: dateFinished is an ISO string, so the first 7
      // characters are already the YYYY-MM key we want to group on.
      const key = book.dateFinished.slice(0, 7)
      const bucket = map.get(key)
      if (bucket) bucket.push(book)
      else map.set(key, [book])
    }

    return [...map.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([key, monthBooks]) => ({
        key,
        label: formatMonth(key),
        books: monthBooks.sort((x, y) =>
          (y.dateFinished ?? '').localeCompare(x.dateFinished ?? ''),
        ),
      }))
  }, [finished])

  return (
    <div className={styles.sections}>
      {reading.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            Reading now
            <span className={styles.sectionCount}>{reading.length}</span>
          </h2>
          <div className={styles.grid}>
            {reading.map((book) => (
              <BookCard key={book.id} book={book} />
            ))}
          </div>
        </section>
      )}

      {months.map(({ key, label, books: monthBooks }) => (
        <section key={key} className={styles.section}>
          <h2 className={styles.sectionTitle}>
            {label}
            <span className={styles.sectionCount}>{monthBooks.length}</span>
          </h2>
          <div className={styles.grid}>
            {monthBooks.map((book) => (
              <BookCard key={book.id} book={book} showFinishedDate />
            ))}
          </div>
        </section>
      ))}

      {reading.length === 0 && months.length === 0 && (
        <p className={styles.loading}>Nothing finished yet — notes will appear here over time.</p>
      )}
    </div>
  )
}

function formatMonth(key: string): string {
  const [year, month] = key.split('-').map(Number)
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  })
}

function EmptyShelf() {
  return (
    <div className={styles.empty}>
      <p className={styles.emptyTitle}>Your shelf is empty</p>
      <p className={styles.emptyBody}>
        Add the book you're reading now, then capture a few key ideas as you go.
      </p>
      <Link to="/add" className={styles.emptyAction}>
        Add your first book
      </Link>

      {/* The one moment this is worth saying. Someone with years of reading behind them
          should not have to find out by accident that they can bring it all in at once. */}
      <p className={styles.emptyAside}>
        Already have a library elsewhere?{' '}
        <Link to="/settings" className={styles.emptyLink}>
          Import a Goodreads export
        </Link>
      </p>
    </div>
  )
}
