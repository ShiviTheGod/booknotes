import { db, newId, nowIso } from '../db'
import type { Book, BookStatus } from '../types'
import { deleteImage } from './images'
import { recordTombstone, recordTombstones } from './tombstones'

export type NewBook = Omit<Book, 'id' | 'createdAt' | 'updatedAt' | 'status'> &
  Partial<Pick<Book, 'status'>>

export async function createBook(input: NewBook): Promise<Book> {
  const timestamp = nowIso()
  const book: Book = {
    ...input,
    id: newId(),
    status: input.status ?? 'reading',
    dateStarted: input.dateStarted ?? timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  await db.books.add(book)
  return book
}

export function getBook(id: string): Promise<Book | undefined> {
  return db.books.get(id)
}

export function listBooks(): Promise<Book[]> {
  return db.books.orderBy('createdAt').reverse().toArray()
}

export function listBooksByStatus(status: BookStatus): Promise<Book[]> {
  return db.books.where('status').equals(status).toArray()
}

/** Finished books, most recently finished first. Backs the shelf's Timeline view. */
export async function listFinishedByDate(): Promise<Book[]> {
  const finished = await db.books.where('status').equals('finished').toArray()
  return finished.sort((a, b) => (b.dateFinished ?? '').localeCompare(a.dateFinished ?? ''))
}

/** Has this book already been added? Guards against duplicate adds from search. */
export async function findByExternalId(externalId: string): Promise<Book | undefined> {
  return db.books.where('externalId').equals(externalId).first()
}

export async function updateBook(id: string, changes: Partial<Book>): Promise<void> {
  await db.books.update(id, { ...changes, updatedAt: nowIso() })
}

/**
 * Move the bookmark, or clear it when given nothing.
 *
 * Clamped to the book's length rather than rejected: typing 500 for a 320-page book is
 * a slip, and refusing the whole edit over it is more annoying than quietly landing on
 * the last page. Zero and below clears the bookmark instead of pinning it to page 0,
 * which would read as "I have started" when the reader meant the opposite.
 */
export async function setBookmark(id: string, page: number | undefined): Promise<void> {
  if (page === undefined || !Number.isFinite(page) || page <= 0) {
    await updateBook(id, { currentPage: undefined })
    return
  }

  const book = await db.books.get(id)
  const capped = book?.pageCount ? Math.min(Math.round(page), book.pageCount) : Math.round(page)
  await updateBook(id, { currentPage: capped })
}

export async function markFinished(id: string, when = nowIso()): Promise<void> {
  const book = await db.books.get(id)
  // Finishing a book means the bookmark is at the end, whether or not it was ever
  // moved there by hand. Leaving it mid-book would make the shelf show a finished
  // book as half-read.
  await updateBook(id, {
    status: 'finished',
    dateFinished: when,
    currentPage: book?.pageCount ?? book?.currentPage,
  })
}

export async function markReading(id: string): Promise<void> {
  // Clearing dateFinished keeps the stats honest if a book is un-finished by mistake.
  await updateBook(id, { status: 'reading', dateFinished: undefined })
}

/**
 * Delete a book and everything hanging off it.
 *
 * Runs in one transaction so a failure part-way through cannot leave orphaned
 * chapters, notes or a review pointing at a book that no longer exists.
 *
 * A review that has been shared stops being reachable here but is not withdrawn from
 * the friends who could see it — that needs the network, and this has to work on a
 * train. Stop sharing before deleting the book if that matters.
 */
export async function deleteBook(id: string): Promise<void> {
  const imageIds: string[] = []

  await db.transaction('rw', db.books, db.chapters, db.notes, db.reviews, db.tombstones, async () => {
    const notes = await db.notes.where('bookId').equals(id).toArray()
    for (const note of notes) {
      if (note.imageBlobId) imageIds.push(note.imageBlobId)
    }

    const book = await db.books.get(id)
    if (book?.coverBlobId) imageIds.push(book.coverBlobId)

    const chapters = await db.chapters.where('bookId').equals(id).toArray()

    await db.notes.where('bookId').equals(id).delete()
    await db.chapters.where('bookId').equals(id).delete()
    // Keyed by book id, so a review left behind is unreachable for good: nothing can
    // ever open it again, but it still travels in every backup from then on.
    await db.reviews.delete(id)
    await db.books.delete(id)

    // Every removed row needs its own marker, not just the book: the other device
    // deletes by id and knows nothing about what hung off what.
    await recordTombstones(
      'note',
      notes.map((note) => note.id),
    )
    await recordTombstones(
      'chapter',
      chapters.map((chapter) => chapter.id),
    )
    await recordTombstone('book', id)
  })

  // Blobs are cleaned up after the transaction commits: the images table is large,
  // and holding it inside the same transaction would lock it for the whole cascade.
  await Promise.all(imageIds.map(deleteImage))
}
