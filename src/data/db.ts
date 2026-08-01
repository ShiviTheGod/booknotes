import Dexie, { type EntityTable } from 'dexie'
import type { Book, Chapter, ImageBlob, Note, Setting, Tombstone } from './types'

/**
 * BookNotes' local database.
 *
 * Everything lives in IndexedDB on the device — there is no server in v1. All reads
 * and writes go through the repositories in ./repo rather than touching `db` directly,
 * so that a future sync backend can be slotted in behind the same functions.
 *
 * Index notes:
 *  - `*genres` is a multi-entry index: a book with ["Psychology", "Self-help"] is
 *    indexed under both, which is what makes the shelf's Genre view a cheap lookup.
 *  - `[bookId+createdAt]` on notes is what lets the summary view pull every note for
 *    a book in reading order with a single range query.
 *  - Blobs are in their own table so note queries never deserialize image data.
 */
class BookNotesDB extends Dexie {
  books!: EntityTable<Book, 'id'>
  chapters!: EntityTable<Chapter, 'id'>
  notes!: EntityTable<Note, 'id'>
  images!: EntityTable<ImageBlob, 'id'>
  settings!: EntityTable<Setting, 'key'>
  tombstones!: EntityTable<Tombstone, 'id'>

  constructor() {
    super('booknotes')

    this.version(1).stores({
      books: 'id, status, title, dateStarted, dateFinished, createdAt, *genres, externalId',
      chapters: 'id, bookId, [bookId+number]',
      notes: 'id, bookId, chapterId, type, createdAt, [bookId+createdAt], [chapterId+createdAt]',
      images: 'id',
      settings: 'key',
    })

    // v2 adds the ocrStatus index. Without it `where('ocrStatus')` throws — IndexedDB
    // cannot query an unindexed key path — which killed the whole OCR queue: every
    // photo note stayed stuck on "Reading the text in this photo…" because
    // listPendingOcr() rejected before any work started. Only the changed table needs
    // restating; Dexie carries the rest forward and builds the new index on upgrade.
    this.version(2).stores({
      notes:
        'id, bookId, chapterId, type, ocrStatus, createdAt, [bookId+createdAt], [chapterId+createdAt]',
    })

    // v3 adds the tombstone table that sync needs to carry deletions between devices.
    // Purely additive: nothing that already worked reads or writes it.
    this.version(3).stores({
      tombstones: 'id, entity, deletedAt',
    })
  }
}

export const db = new BookNotesDB()

/** Stable id generator. crypto.randomUUID needs a secure context, which we always have. */
export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  // Fallback for the rare non-secure-context case (e.g. plain http:// LAN testing).
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function nowIso(): string {
  return new Date().toISOString()
}
