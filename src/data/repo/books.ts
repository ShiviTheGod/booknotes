import { db, newId, nowIso } from '../db'
import type { Book, BookStatus } from '../types'
import { deleteImage } from './images'

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

export async function markFinished(id: string, when = nowIso()): Promise<void> {
  await updateBook(id, { status: 'finished', dateFinished: when })
}

export async function markReading(id: string): Promise<void> {
  // Clearing dateFinished keeps the stats honest if a book is un-finished by mistake.
  await updateBook(id, { status: 'reading', dateFinished: undefined })
}

/**
 * Delete a book and everything hanging off it.
 *
 * Runs in one transaction so a failure part-way through cannot leave orphaned
 * chapters or notes pointing at a book that no longer exists.
 */
export async function deleteBook(id: string): Promise<void> {
  const imageIds: string[] = []

  await db.transaction('rw', db.books, db.chapters, db.notes, async () => {
    const notes = await db.notes.where('bookId').equals(id).toArray()
    for (const note of notes) {
      if (note.imageBlobId) imageIds.push(note.imageBlobId)
    }

    const book = await db.books.get(id)
    if (book?.coverBlobId) imageIds.push(book.coverBlobId)

    await db.notes.where('bookId').equals(id).delete()
    await db.chapters.where('bookId').equals(id).delete()
    await db.books.delete(id)
  })

  // Blobs are cleaned up after the transaction commits: the images table is large,
  // and holding it inside the same transaction would lock it for the whole cascade.
  await Promise.all(imageIds.map(deleteImage))
}
