import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { installSampleBooks, removeSampleBooks, sampleBookTally } from './seed'
import { createBook } from './repo/books'
import { createChapter } from './repo/chapters'
import { createNote } from './repo/notes'
import { saveReview } from './repo/reviews'

beforeEach(async () => {
  await Promise.all([
    db.books.clear(),
    db.chapters.clear(),
    db.notes.clear(),
    db.images.clear(),
    db.tombstones.clear(),
    db.reviews.clear(),
  ])
})

/** A book of the reader's own, indistinguishable from a real one. */
async function realBook() {
  const book = await createBook({
    title: 'Deep Work',
    authors: ['Cal Newport'],
    genres: ['Productivity'],
    pageCount: 296,
    source: 'manual',
    externalId: 'manual:deep-work',
  })
  const chapter = await createChapter(book.id, 'Concentration')
  await createNote({
    bookId: book.id,
    chapterId: chapter.id,
    type: 'text',
    content: 'Nothing may delete this.',
  })
  return book
}

describe('sample books', () => {
  it('installs nothing until asked', async () => {
    expect(await db.books.count()).toBe(0)
    expect(await sampleBookTally()).toEqual({ books: 0, notes: 0 })
  })

  it('counts only what it would actually remove', async () => {
    await realBook()
    await installSampleBooks()

    const tally = await sampleBookTally()
    const allNotes = await db.notes.count()

    expect(tally.books).toBe((await db.books.count()) - 1)
    // The reader's own note is not in the tally, so the confirmation cannot
    // overstate the damage.
    expect(tally.notes).toBe(allNotes - 1)
  })

  it('removes every sample and nothing else', async () => {
    const mine = await realBook()
    await installSampleBooks()
    expect(await db.books.count()).toBeGreaterThan(1)

    const removed = await removeSampleBooks()

    const left = await db.books.toArray()
    expect(removed).toBeGreaterThan(0)
    expect(left.map((book) => book.id)).toEqual([mine.id])
    expect(await db.notes.count()).toBe(1)
    expect(await db.chapters.count()).toBe(1)
  })

  it('leaves a tombstone for every removed row, so a sync cannot resurrect them', async () => {
    await installSampleBooks()
    const books = await db.books.count()
    const chapters = await db.chapters.count()
    const notes = await db.notes.count()

    await removeSampleBooks()

    const tombstones = await db.tombstones.toArray()
    const byEntity = (entity: string) => tombstones.filter((row) => row.entity === entity).length

    expect(byEntity('book')).toBe(books)
    expect(byEntity('chapter')).toBe(chapters)
    expect(byEntity('note')).toBe(notes)
  })

  it('does not strand a review behind a removed book', async () => {
    const mine = await realBook()
    await saveReview(mine, { rating: 4, body: 'Mine, and it stays.' })

    await installSampleBooks()
    const sample = (await db.books.toArray()).find((book) => book.id !== mine.id)!
    await saveReview(sample, { rating: 2, body: 'On a book about to go.' })

    await removeSampleBooks()

    const reviews = await db.reviews.toArray()
    expect(reviews.map((review) => review.bookId)).toEqual([mine.id])
  })

  it('is safe to run twice', async () => {
    await installSampleBooks()
    await removeSampleBooks()
    expect(await removeSampleBooks()).toBe(0)
    expect(await db.books.count()).toBe(0)
  })
})
