import { useEffect, useState } from 'react'
import type { Book } from '../../data/types'
import { setBookmark } from '../../data/repo/books'
import styles from './Bookmark.module.css'

/**
 * Where the reader stopped.
 *
 * The one thing this app was missing that a physical bookmark does for free. It sits
 * on the book screen rather than behind an edit form because moving it is the most
 * frequent thing anyone does with a book they are part-way through — it should be one
 * tap and a number, not a form to open and save.
 *
 * A finished book shows its final page as a fact rather than an input. Nothing is
 * being tracked any more, and an editable field there invites a stray tap that would
 * quietly reopen the question of how far in the reader is.
 */
export default function Bookmark({ book }: { book: Book }) {
  const [draft, setDraft] = useState(book.currentPage ? String(book.currentPage) : '')
  const [saving, setSaving] = useState(false)

  // Keeps the field honest when the value changes underneath — finishing the book
  // moves the bookmark to the end, and sync can move it from the other device.
  useEffect(() => {
    setDraft(book.currentPage ? String(book.currentPage) : '')
  }, [book.currentPage])

  const finished = book.status === 'finished'
  const percent = progressPercent(book)

  async function save() {
    setSaving(true)
    try {
      const parsed = Number.parseInt(draft, 10)
      await setBookmark(book.id, Number.isFinite(parsed) ? parsed : undefined)
    } finally {
      setSaving(false)
    }
  }

  if (finished) {
    return (
      <div className={styles.done}>
        <span className={styles.doneLabel}>Read to the end</span>
        {book.pageCount ? <span className={styles.doneMeta}>all {book.pageCount} pages</span> : null}
      </div>
    )
  }

  return (
    <div className={styles.bookmark}>
      <div className={styles.row}>
        <label className={styles.label} htmlFor={`bookmark-${book.id}`}>
          Stopped on page
        </label>
        <input
          id={`bookmark-${book.id}`}
          className={styles.input}
          value={draft}
          onChange={(event) => setDraft(event.target.value.replace(/[^0-9]/g, ''))}
          onBlur={() => void save()}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
          }}
          inputMode="numeric"
          pattern="[0-9]*"
          enterKeyHint="done"
          placeholder="—"
          disabled={saving}
        />
        {book.pageCount ? <span className={styles.of}>of {book.pageCount}</span> : null}
      </div>

      {percent !== undefined && (
        <>
          {/* A bar rather than only a number: "page 214" means nothing without the
              length, and most people read progress as a shape before a figure. */}
          <div
            className={styles.track}
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Reading progress"
          >
            <div className={styles.fill} style={{ width: `${percent}%` }} />
          </div>
          <p className={styles.percent}>
            {percent}% in
            {book.pageCount && book.currentPage
              ? ` · ${book.pageCount - book.currentPage} pages left`
              : ''}
          </p>
        </>
      )}
    </div>
  )
}

/** Undefined when there is nothing honest to show — no bookmark, or no known length. */
export function progressPercent(book: Book): number | undefined {
  if (!book.pageCount || !book.currentPage) return undefined
  return Math.min(100, Math.round((book.currentPage / book.pageCount) * 100))
}
