import { useEffect, useState } from 'react'
import type { Book } from '../data/types'
import { getImageBlob } from '../data/repo/images'
import styles from './BookCover.module.css'

/**
 * A book cover, with a typographic fallback.
 *
 * Resolution order: locally cached blob → remote URL → generated cover. That last step
 * matters more than it sounds: manually-added books have no cover at all, and Open
 * Library 404s a fair number of ISBNs. A designed fallback makes those look deliberate
 * rather than broken, so the shelf never shows a torn-image icon.
 */
export default function BookCover({ book, className }: { book: Book; className?: string }) {
  const [blobUrl, setBlobUrl] = useState<string>()
  const [remoteFailed, setRemoteFailed] = useState(false)

  useEffect(() => {
    if (!book.coverBlobId) return

    let objectUrl: string | undefined
    let cancelled = false

    void getImageBlob(book.coverBlobId).then((blob) => {
      if (!blob || cancelled) return
      objectUrl = URL.createObjectURL(blob)
      setBlobUrl(objectUrl)
    })

    return () => {
      cancelled = true
      // Object URLs leak until explicitly revoked.
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [book.coverBlobId])

  const source = blobUrl ?? (remoteFailed ? undefined : book.coverUrl)
  const wrapperClass = className ? `${styles.cover} ${className}` : styles.cover

  if (!source) {
    return <GeneratedCover book={book} className={wrapperClass} />
  }

  return (
    <div className={wrapperClass}>
      <img
        className={styles.image}
        src={source}
        alt={`Cover of ${book.title}`}
        loading="lazy"
        decoding="async"
        onError={() => setRemoteFailed(true)}
      />
    </div>
  )
}

/** Title-and-author cover on a cloth-coloured ground, tinted deterministically per book. */
function GeneratedCover({ book, className }: { book: Book; className: string }) {
  const hue = hueFromString(book.title)

  return (
    <div
      className={`${className} ${styles.generated}`}
      style={{
        // Two stops plus a hairline give it a bound-cloth feel rather than a flat swatch.
        background: `linear-gradient(160deg,
          hsl(${hue} 26% 42%) 0%,
          hsl(${hue} 30% 32%) 100%)`,
      }}
      role="img"
      aria-label={`Cover of ${book.title}`}
    >
      <span className={styles.generatedRule} aria-hidden="true" />
      <span className={styles.generatedTitle}>{book.title}</span>
      {book.authors.length > 0 && (
        <span className={styles.generatedAuthor}>{book.authors[0]}</span>
      )}
    </div>
  )
}

/**
 * Stable hue from the title, so a given book always gets the same colour across
 * reloads and devices. Plain FNV-style accumulation — no randomness anywhere.
 */
function hueFromString(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0
  }
  // Skew away from the green band, which reads as "success state" rather than bookbinding.
  return ((Math.abs(hash) % 300) + 330) % 360
}
