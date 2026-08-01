import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Book } from '../../data/types'
import { getReview, saveReview } from '../../data/repo/reviews'
import { getAccount } from '../../services/sync/client'
import {
  publishReview,
  reviewsForBook,
  socialReady,
  unpublishReview,
  type SharedReview,
} from '../../services/social/social'
import styles from './BookReview.module.css'

/**
 * The reader's own writing about a book, and their friends' writing about the same one.
 *
 * Deliberately not the notes. Notes are working material and can carry text
 * transcribed from photographed pages — the book's words, not the reader's — and none
 * of that is anyone else's to receive. A review is composed knowing someone will read
 * it, which is what makes it the only thing here that can be shared.
 *
 * Writing and sharing are two separate actions for the same reason. A half-finished
 * thought should not reach anyone the moment it is typed.
 */
export default function BookReview({ book }: { book: Book }) {
  const review = useLiveQuery(() => getReview(book.id), [book.id])

  const [body, setBody] = useState('')
  const [rating, setRating] = useState<number>()
  const [dirty, setDirty] = useState(false)

  const [ready, setReady] = useState(false)
  const [myEmail, setMyEmail] = useState<string>()
  const [shared, setShared] = useState<SharedReview[]>()
  const [busy, setBusy] = useState<'save' | 'share' | 'unshare'>()
  const [error, setError] = useState<string>()

  // Only adopt the stored review while the reader is not mid-edit, or typing would be
  // overwritten the moment the record round-trips through the database.
  useEffect(() => {
    if (dirty || review === undefined) return
    setBody(review?.body ?? '')
    setRating(review?.rating)
  }, [review, dirty])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const usable = await socialReady()
      const account = usable ? await getAccount() : undefined
      if (cancelled) return
      setReady(usable)
      setMyEmail(account?.email)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const bookKey = review?.bookKey

  useEffect(() => {
    if (!ready || !bookKey) return
    let cancelled = false
    void (async () => {
      try {
        const rows = await reviewsForBook(bookKey)
        if (!cancelled) setShared(rows)
      } catch {
        // A failed fetch is not worth an error banner on a book page — the reader's own
        // review is local and unaffected.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [ready, bookKey])

  const mine = shared?.find((row) => row.email === myEmail)
  const friends = shared?.filter((row) => row.email !== myEmail) ?? []

  async function run(kind: 'save' | 'share' | 'unshare', work: () => Promise<void>) {
    setBusy(kind)
    setError(undefined)
    try {
      await work()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(undefined)
    }
  }

  const handleSave = () =>
    run('save', async () => {
      await saveReview(book, { rating, body })
      setDirty(false)
    })

  const handleShare = () =>
    run('share', async () => {
      const saved = await saveReview(book, { rating, body })
      setDirty(false)
      await publishReview(book, saved)
      setShared(await reviewsForBook(saved.bookKey))
    })

  const handleUnshare = () =>
    run('unshare', async () => {
      if (!bookKey) return
      await unpublishReview(bookKey)
      setShared(await reviewsForBook(bookKey))
    })

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>Your review</h2>

      <div className={styles.stars} role="group" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            className={value <= (rating ?? 0) ? styles.starOn : styles.star}
            aria-label={`${value} out of 5`}
            aria-pressed={value === rating}
            onClick={() => {
              // Tapping the current rating clears it: a book can be worth writing
              // about without being ranked, and there has to be a way back.
              setRating(value === rating ? undefined : value)
              setDirty(true)
            }}
          >
            ★
          </button>
        ))}
        {rating !== undefined && <span className={styles.ratingText}>{rating} / 5</span>}
      </div>

      <textarea
        className={styles.body}
        value={body}
        onChange={(event) => {
          setBody(event.target.value)
          setDirty(true)
        }}
        placeholder="What would you tell someone about this book?"
        aria-label="Your review"
      />

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.save}
          onClick={() => void handleSave()}
          disabled={busy !== undefined || !dirty}
        >
          {busy === 'save' ? 'Saving…' : dirty ? 'Save' : 'Saved'}
        </button>

        {ready &&
          (mine ? (
            <button
              type="button"
              className={styles.secondary}
              onClick={() => void handleUnshare()}
              disabled={busy !== undefined}
            >
              {busy === 'unshare' ? 'Removing…' : 'Stop sharing'}
            </button>
          ) : (
            <button
              type="button"
              className={styles.secondary}
              onClick={() => void handleShare()}
              disabled={busy !== undefined || body.trim().length === 0}
            >
              {busy === 'share' ? 'Sharing…' : 'Share with friends'}
            </button>
          ))}
      </div>

      <p className={styles.note}>
        {ready
          ? mine
            ? 'Your friends can see this review. Your notes are not shared, and never are.'
            : 'Saved on this device only, until you share it.'
          : 'Saved on this device. Connect an account in Settings to share reviews with friends.'}
      </p>

      {error && <p className={styles.error}>{error}</p>}

      {friends.length > 0 && (
        <>
          <h3 className={styles.friendsTitle}>What your friends thought</h3>
          <ul className={styles.friendList}>
            {friends.map((row) => (
              <li key={row.userId} className={styles.friendReview}>
                <div className={styles.friendHead}>
                  <span className={styles.friendName}>{row.email}</span>
                  {row.rating !== undefined && (
                    <span className={styles.friendRating}>{'★'.repeat(row.rating)}</span>
                  )}
                </div>
                <p className={styles.friendBody}>{row.body}</p>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
