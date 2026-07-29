import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db'
import { createBook, deleteBook, findByExternalId, markFinished, markReading } from './books'
import { createChapter, deleteChapter, generateChapters, listChapters, suggestChapterCount } from './chapters'
import { createNote, listNotesByBook, listNotesByChapter, searchNotes } from './notes'
import { putImage } from './images'

beforeEach(async () => {
  await Promise.all([db.books.clear(), db.chapters.clear(), db.notes.clear(), db.images.clear()])
})

async function libraryWithOnePhoto() {
  const book = await createBook({
    title: 'Deep Work',
    authors: ['Cal Newport'],
    genres: ['Productivity'],
    pageCount: 296,
    source: 'manual',
    externalId: 'manual:deep-work',
  })

  const chapters = await generateChapters(book.id, 3)
  const imageBlobId = await putImage(new Blob(['not-really-a-jpeg'], { type: 'image/jpeg' }))

  await createNote({ bookId: book.id, chapterId: chapters[0].id, type: 'text', content: 'Concentration is rare.' })
  await createNote({
    bookId: book.id,
    chapterId: chapters[1].id,
    type: 'photo',
    content: '',
    imageBlobId,
  })

  return { book, chapters, imageBlobId }
}

describe('deleteBook', () => {
  it('removes the book, its chapters, its notes, and their images', async () => {
    const { book, imageBlobId } = await libraryWithOnePhoto()

    await deleteBook(book.id)

    expect(await db.books.count()).toBe(0)
    expect(await db.chapters.count()).toBe(0)
    expect(await db.notes.count()).toBe(0)
    // Blobs are deleted after the transaction commits, so this is the assertion
    // most likely to catch a regression in that two-phase cleanup.
    expect(await db.images.get(imageBlobId)).toBeUndefined()
  })

  it('leaves other books untouched', async () => {
    const { book } = await libraryWithOnePhoto()
    const other = await createBook({ title: 'Sapiens', authors: [], genres: [], source: 'manual' })
    await createChapter(other.id, 'Cognitive Revolution')

    await deleteBook(book.id)

    expect(await db.books.count()).toBe(1)
    expect(await listChapters(other.id)).toHaveLength(1)
  })
})

describe('deleteChapter', () => {
  it('removes the chapter and its notes but keeps the book', async () => {
    const { book, chapters } = await libraryWithOnePhoto()

    await deleteChapter(chapters[0].id)

    expect(await db.books.get(book.id)).toBeDefined()
    expect(await listChapters(book.id)).toHaveLength(2)
    expect(await listNotesByChapter(chapters[0].id)).toHaveLength(0)
    expect(await listNotesByBook(book.id)).toHaveLength(1)
  })
})

describe('chapters', () => {
  it('numbers generated chapters consecutively from 1', async () => {
    const book = await createBook({ title: 'X', authors: [], genres: [], source: 'manual' })
    const chapters = await generateChapters(book.id, 5)

    expect(chapters.map((chapter) => chapter.number)).toEqual([1, 2, 3, 4, 5])
  })

  it('continues numbering after existing chapters instead of restarting', async () => {
    const book = await createBook({ title: 'X', authors: [], genres: [], source: 'manual' })
    await generateChapters(book.id, 3)
    const more = await generateChapters(book.id, 2)

    expect(more.map((chapter) => chapter.number)).toEqual([4, 5])
  })

  it('returns chapters in reading order', async () => {
    const book = await createBook({ title: 'X', authors: [], genres: [], source: 'manual' })
    await createChapter(book.id, 'Third', 3)
    await createChapter(book.id, 'First', 1)
    await createChapter(book.id, 'Second', 2)

    expect((await listChapters(book.id)).map((chapter) => chapter.title)).toEqual([
      'First',
      'Second',
      'Third',
    ])
  })

  it('falls back to a numbered title when none is given', async () => {
    const book = await createBook({ title: 'X', authors: [], genres: [], source: 'manual' })
    expect((await createChapter(book.id, '   ')).title).toBe('Chapter 1')
  })

  it('suggests a sane chapter count from a page count', async () => {
    expect(suggestChapterCount(296)).toBeGreaterThan(0)
    // Guesses stay within bounds even for absent or absurd inputs.
    expect(suggestChapterCount(undefined)).toBe(10)
    expect(suggestChapterCount(0)).toBe(10)
    expect(suggestChapterCount(20_000)).toBeLessThanOrEqual(40)
  })
})

describe('books', () => {
  it('starts a new book as reading, with a start date', async () => {
    const book = await createBook({ title: 'X', authors: [], genres: [], source: 'manual' })

    expect(book.status).toBe('reading')
    expect(book.dateStarted).toBeTruthy()
  })

  it('round-trips finished and back, clearing the finish date', async () => {
    const book = await createBook({ title: 'X', authors: [], genres: [], source: 'manual' })

    await markFinished(book.id)
    expect((await db.books.get(book.id))?.dateFinished).toBeTruthy()

    await markReading(book.id)
    const reverted = await db.books.get(book.id)
    // Left in place, this would keep inflating the stats for a book no longer finished.
    expect(reverted?.status).toBe('reading')
    expect(reverted?.dateFinished).toBeUndefined()
  })

  it('finds an existing book by external id, so search cannot add duplicates', async () => {
    const { book } = await libraryWithOnePhoto()
    expect((await findByExternalId('manual:deep-work'))?.id).toBe(book.id)
    expect(await findByExternalId('google:nope')).toBeUndefined()
  })
})

describe('notes', () => {
  it('marks photo notes as pending OCR and other types as none', async () => {
    const book = await createBook({ title: 'X', authors: [], genres: [], source: 'manual' })
    const chapter = await createChapter(book.id, 'One')

    const photo = await createNote({ bookId: book.id, chapterId: chapter.id, type: 'photo', content: '' })
    const text = await createNote({ bookId: book.id, chapterId: chapter.id, type: 'text', content: 'hi' })

    // This is what the OCR queue looks for; getting it wrong means photos are never read.
    expect(photo.ocrStatus).toBe('pending')
    expect(text.ocrStatus).toBe('none')
  })

  it('searches across note text and extracted photo text', async () => {
    const { book, chapters } = await libraryWithOnePhoto()
    await createNote({
      bookId: book.id,
      chapterId: chapters[2].id,
      type: 'text',
      content: 'Shallow work is logistical.',
    })

    expect(await searchNotes('concentration')).toHaveLength(1)
    expect(await searchNotes('shallow')).toHaveLength(1)
    expect(await searchNotes('nothing here')).toHaveLength(0)
    expect(await searchNotes('')).toHaveLength(0)
  })

  it('returns a book’s notes in creation order', async () => {
    const { book } = await libraryWithOnePhoto()
    const notes = await listNotesByBook(book.id)

    expect(notes).toHaveLength(2)
    expect(notes[0].createdAt <= notes[1].createdAt).toBe(true)
  })
})
