import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageHeader from '../../components/PageHeader'
import { searchBooks, type BookCandidate } from '../../services/bookSearch'
import { createBook, findByExternalId } from '../../data/repo/books'
import { cacheRemoteImage } from '../../data/repo/images'
import ManualBookForm from './ManualBookForm'
import styles from './AddBookView.module.css'

const DEBOUNCE_MS = 350

export default function AddBookView() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<BookCandidate[]>([])
  const [status, setStatus] = useState<'idle' | 'searching' | 'error' | 'done'>('idle')
  const [errorMessage, setErrorMessage] = useState<string>()
  const [manualMode, setManualMode] = useState(false)
  const [addingId, setAddingId] = useState<string>()

  // Holds the in-flight request so a new keystroke can cancel the previous one.
  const requestRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const trimmed = query.trim()

    if (trimmed.length < 2) {
      setResults([])
      setStatus('idle')
      return
    }

    const timer = setTimeout(() => {
      requestRef.current?.abort()
      const controller = new AbortController()
      requestRef.current = controller

      setStatus('searching')
      setErrorMessage(undefined)

      searchBooks(trimmed, controller.signal)
        .then((found) => {
          if (controller.signal.aborted) return
          setResults(found)
          setStatus('done')
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return
          setErrorMessage(error instanceof Error ? error.message : 'Search failed.')
          setStatus('error')
        })
    }, DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [query])

  // Cancel any outstanding request when leaving the screen.
  useEffect(() => () => requestRef.current?.abort(), [])

  async function addCandidate(candidate: BookCandidate) {
    setAddingId(candidate.externalId)
    try {
      const existing = await findByExternalId(candidate.externalId)
      if (existing) {
        navigate(`/book/${existing.id}`)
        return
      }

      // Cache the cover up front so the shelf works offline. A failure here is fine —
      // the remote URL stays as a fallback.
      const coverBlobId = candidate.coverUrl
        ? await cacheRemoteImage(candidate.coverUrl)
        : undefined

      const book = await createBook({
        title: candidate.title,
        authors: candidate.authors,
        coverUrl: candidate.coverUrl,
        coverBlobId,
        pageCount: candidate.pageCount,
        genres: candidate.genres,
        source: candidate.source,
        externalId: candidate.externalId,
      })

      navigate(`/book/${book.id}`)
    } finally {
      setAddingId(undefined)
    }
  }

  return (
    <>
      <PageHeader title="Add a book" backTo="/" />

      {manualMode ? (
        <ManualBookForm onCancel={() => setManualMode(false)} />
      ) : (
        <>
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
              placeholder="Title or author"
              aria-label="Search for a book by title or author"
              autoFocus
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="search"
            />
          </div>

          {status === 'searching' && <p className={styles.hint}>Looking…</p>}

          {status === 'error' && (
            <div className={styles.error}>
              <p>{errorMessage}</p>
            </div>
          )}

          {status === 'done' && results.length === 0 && (
            <p className={styles.hint}>
              Nothing found for “{query.trim()}”. You can still add it by hand.
            </p>
          )}

          {results.length > 0 && (
            <ul className={styles.results}>
              {results.map((candidate) => (
                <li key={candidate.externalId}>
                  <button
                    type="button"
                    className={styles.result}
                    onClick={() => void addCandidate(candidate)}
                    disabled={addingId !== undefined}
                  >
                    <span className={styles.thumb}>
                      {candidate.coverUrl ? (
                        <img src={candidate.coverUrl} alt="" loading="lazy" decoding="async" />
                      ) : (
                        <span className={styles.thumbBlank} aria-hidden="true" />
                      )}
                    </span>

                    <span className={styles.resultMeta}>
                      <span className={styles.resultTitle}>{candidate.title}</span>
                      <span className={styles.resultAuthor}>
                        {candidate.authors.join(', ') || 'Unknown author'}
                      </span>
                      <span className={styles.resultDetail}>
                        {[
                          candidate.publishedYear,
                          candidate.pageCount ? `${candidate.pageCount} pages` : undefined,
                          candidate.genres[0],
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>

                    <span className={styles.resultAdd} aria-hidden="true">
                      {addingId === candidate.externalId ? '…' : '+'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <button type="button" className={styles.manualLink} onClick={() => setManualMode(true)}>
            Can't find it? Add it by hand
          </button>
        </>
      )}
    </>
  )
}
