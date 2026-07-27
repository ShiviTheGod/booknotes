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
