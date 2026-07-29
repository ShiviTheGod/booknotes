import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import PageHeader from '../../components/PageHeader'
import BookCover from '../../components/BookCover'
import { searchLibrary, splitOnMatch, type NoteHit, type SearchResults } from '../../services/noteSearch'
import styles from './NoteSearchView.module.css'

const DEBOUNCE_MS = 200

export default function NoteSearchView() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResults>()
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults(undefined)
      setSearching(false)
      return
    }

    setSearching(true)
    // Debounced so a fast typist doesn't kick off a full-library scan per keystroke.
    const timer = setTimeout(() => {
      let cancelled = false

      void searchLibrary(query).then((found) => {
        if (cancelled) return
        setResults(found)
        setSearching(false)
      })

      return () => {
        cancelled = true
      }
    }, DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [query])

  const total = (results?.books.length ?? 0) + (results?.notes.length ?? 0)
  const tooShort = query.trim().length > 0 && query.trim().length < 2

  return (
    <>
      <PageHeader title="Search" subtitle="Across every note, including text read from photos" />

      <div className={styles.searchRow}>
        <svg
          className={styles.searchIcon}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
        </svg>

        <input
          className={styles.searchInput}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="An idea, a phrase, an author…"
          aria-label="Search your notes"
          autoFocus
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
        />
      </div>

      {tooShort && <p className={styles.hint}>Keep going — two letters at least.</p>}

      {searching && <p className={styles.hint}>Searching…</p>}

      {results && !searching && total === 0 && (
        <p className={styles.hint}>
          Nothing matches “{results.query}”.
        </p>
      )}

      {results && !searching && total > 0 && (
        <p className={styles.count}>
          {total} {total === 1 ? 'match' : 'matches'}
        </p>
      )}

      {results && results.books.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Books</h2>
          <div className={styles.bookRow}>
            {results.books.map((book) => (
              <Link key={book.id} to={`/book/${book.id}`} className={styles.bookCard}>
                <BookCover book={book} />
                <span className={styles.bookTitle}>
                  <Highlight text={book.title} query={results.query} />
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {results && results.notes.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Notes</h2>
          <ul className={styles.hits}>
            {results.notes.map((hit) => (
              <li key={hit.note.id}>
                <NoteHitRow hit={hit} query={results.query} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}

function NoteHitRow({ hit, query }: { hit: NoteHit; query: string }) {
  const target = hit.chapter
    ? `/book/${hit.note.bookId}/chapter/${hit.chapter.id}`
    : `/book/${hit.note.bookId}`

  const location = useMemo(() => {
    const parts: string[] = []
    if (hit.book) parts.push(hit.book.title)
    if (hit.chapter) parts.push(`Ch. ${hit.chapter.number}`)
    return parts.join(' · ')
  }, [hit.book, hit.chapter])

  return (
    <Link to={target} className={styles.hit}>
      <span className={styles.hitMeta}>
        <span className={styles.hitLocation}>{location || 'Unfiled note'}</span>
        {hit.matchedIn !== 'content' && (
          // Worth calling out: this text came off a photograph rather than being
          // typed, which explains any odd spacing or OCR artefacts in the snippet.
          <span className={styles.hitBadge}>
            {hit.matchedIn === 'ocrText' ? 'from photo' : 'translated'}
          </span>
        )}
      </span>

      <span className={styles.hitSnippet}>
        <Highlight text={hit.snippet} query={query} />
      </span>

      <span className={styles.hitDate}>{formatDate(hit.note.createdAt)}</span>
    </Link>
  )
}

/** Marks matches without ever injecting note text as HTML. */
function Highlight({ text, query }: { text: string; query: string }) {
  const parts = splitOnMatch(text, query)

  return (
    <>
      {parts.map((part, index) =>
        part.hit ? (
          <mark key={index} className={styles.mark}>
            {part.text}
          </mark>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </>
  )
}

function formatDate(iso: string): string {
  const date = new Date(iso)
  const sameYear = date.getFullYear() === new Date().getFullYear()
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: sameYear ? undefined : 'numeric',
  })
}
