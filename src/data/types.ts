/**
 * Core domain types for BookNotes.
 *
 * A note on dates: everything is stored as an ISO-8601 string rather than a Date.
 * IndexedDB can store Date objects, but strings survive JSON export/import
 * unchanged, and the "which day was this?" logic in stats is far easier to reason
 * about when the value is already a `YYYY-MM-DD...` string.
 */

export type BookStatus = 'reading' | 'finished'

/** Where a book's metadata came from, so we can tell hand-typed entries from API ones. */
export type BookSource = 'google' | 'openlibrary' | 'manual'

export type NoteType = 'text' | 'voice' | 'photo'

/**
 * OCR runs in the background after a photo is saved, so a photo note is visible
 * (and editable) before its text has been extracted. This tracks that lifecycle.
 * 'none' is used by text/voice notes, which never run OCR.
 */
export type OcrStatus = 'none' | 'pending' | 'done' | 'failed'

export interface Book {
  id: string
  title: string
  authors: string[]
  /** Remote cover URL. Always https — see normalizeCoverUrl in services/bookSearch.ts. */
  coverUrl?: string
  /** Local cached copy of the cover, so the shelf renders offline. */
  coverBlobId?: string
  pageCount?: number
  /**
   * The bookmark: the page the reader last stopped on.
   *
   * Kept separate from pageCount so "how far in" and "how long" stay independent —
   * a book can have a bookmark with no known length, and a length with no bookmark.
   */
  currentPage?: number
  genres: string[]
  status: BookStatus
  dateStarted?: string
  dateFinished?: string
  source: BookSource
  /** The provider's own id (Google volume id / Open Library work key), for de-duping. */
  externalId?: string
  createdAt: string
  updatedAt: string
}

export interface Chapter {
  id: string
  bookId: string
  /** 1-based. Used for ordering and for the [bookId+number] compound index. */
  number: number
  title: string
  createdAt: string
  /**
   * Optional because chapters predate sync and existing rows have none. Sync falls
   * back to createdAt when it is missing, which is correct: a chapter that was never
   * edited has not changed since it was made.
   */
  updatedAt?: string
}

export interface Note {
  id: string
  /**
   * Denormalized from the chapter. This is deliberate: the book summary view needs
   * every note for a book, and this turns that into one indexed range query instead
   * of "load chapters, then fan out one query per chapter".
   */
  bookId: string
  chapterId: string
  type: NoteType
  /** The note body. For photo notes this is the user's own caption, which may be empty. */
  content: string
  imageBlobId?: string
  /** Text extracted from the photo. Searchable metadata — never written back onto the image. */
  ocrText?: string
  ocrStatus: OcrStatus
  /** BCP-47-ish language tag detected from the OCR output, when we can tell. */
  ocrLang?: string
  /**
   * How much the recognizer trusts its own reading, 0–100.
   *
   * Worth storing because OCR fails loudly in the logs and silently in the data:
   * a photograph it cannot read still yields confident-looking nonsense, which
   * would otherwise land in the reader's searchable notes with nothing to flag it.
   * Normalized across engines — Tesseract reports 0–100, Vision reports 0–1.
   */
  ocrConfidence?: number
  /** Populated only if a translation provider is configured; null default in v1. */
  translatedText?: string
  createdAt: string
  updatedAt: string
}

/**
 * Images live in their own table rather than inline on the Note.
 * Dexie deserializes every field of every row it reads, so keeping multi-megabyte
 * blobs out of the notes table keeps chapter and summary queries cheap — the blob
 * is only fetched when a photo is actually rendered.
 */
export interface ImageBlob {
  id: string
  /** The original file, byte-for-byte. Never re-encoded, resized, or rotated. */
  blob: Blob
  mimeType: string
  width?: number
  height?: number
  createdAt: string
}

export interface Setting {
  key: string
  value: unknown
}

/**
 * Your own writing about a book, meant to be read by someone else.
 *
 * Kept apart from notes on purpose, and that separation is the whole safety model of
 * sharing. Notes are private working material and can carry `ocrText` — the book's own
 * words, photographed and transcribed. A review is written deliberately, in the
 * reader's voice, knowing a friend will see it. Only this ever leaves the device.
 */
export interface Review {
  /** One review per book on your shelf, so the local book id is the key. */
  bookId: string
  /** Cross-shelf identity, so a friend's review of the same book lines up with yours. */
  bookKey: string
  /** 1–5, optional: some books are worth writing about without being ranked. */
  rating?: number
  body: string
  createdAt: string
  updatedAt: string
}

/** The three tables sync carries. Images are deliberately not among them. */
export type SyncEntity = 'book' | 'chapter' | 'note'

/**
 * A record that something was deleted here.
 *
 * Without these, deleting on one device cannot reach the other: the second device
 * would see a row it still has, decide the first is simply missing it, and push it
 * straight back. The row would be undeletable.
 *
 * Kept in their own table rather than as a `deletedAt` column so that every existing
 * query stays as it is — a soft-delete column would mean remembering to filter it out
 * in a dozen places, and forgetting once means deleted notes reappearing in the UI.
 */
export interface Tombstone {
  /** The deleted row's own id. UUIDs are unique across tables, so this is safe as a key. */
  id: string
  entity: SyncEntity
  deletedAt: string
}
