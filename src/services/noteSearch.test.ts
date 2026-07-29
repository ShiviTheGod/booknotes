import { beforeEach, describe, expect, it } from 'vitest'
import { db, newId, nowIso } from '../data/db'
import { searchLibrary, splitOnMatch } from './noteSearch'

async function seed() {
  const bookId = newId()
  const chapterId = newId()
  const timestamp = nowIso()

  await db.books.add({
    id: bookId,
    title: 'The Design of Everyday Things',
    authors: ['Don Norman'],
    genres: ['Design'],
    status: 'finished',
    source: 'manual',
    dateFinished: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
  })

  await db.chapters.add({ id: chapterId, bookId, number: 4, title: 'Knowing What To Do', createdAt: timestamp })

  await db.notes.bulkAdd([
    {
      id: newId(),
      bookId,
      chapterId,
      type: 'text',
      content: 'Affordances tell you what is possible.',
      ocrStatus: 'none',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      // The case that matters most: a photo with no typed caption, reachable only
      // through the text the OCR pass extracted.
      id: newId(),
      bookId,
      chapterId,
      type: 'photo',
      content: '',
      imageBlobId: 'img-1',
      ocrText: 'The gulf of execution is the gap between intention and action.',
      ocrStatus: 'done',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ])

  return { bookId, chapterId }
}

beforeEach(async () => {
  await Promise.all([db.books.clear(), db.chapters.clear(), db.notes.clear(), db.images.clear()])
})

describe('searchLibrary', () => {
  it('finds notes by their own text', async () => {
    await seed()
    const results = await searchLibrary('affordances')

    expect(results.notes).toHaveLength(1)
    expect(results.notes[0].matchedIn).toBe('content')
  })

  it('finds a photo note through its extracted OCR text', async () => {
    await seed()
    const results = await searchLibrary('gulf of execution')

    expect(results.notes).toHaveLength(1)
    expect(results.notes[0].matchedIn).toBe('ocrText')
    expect(results.notes[0].note.content).toBe('')
  })

  it('attaches the book and chapter a hit came from', async () => {
    await seed()
    const [hit] = (await searchLibrary('affordances')).notes

    expect(hit.book?.title).toBe('The Design of Everyday Things')
    expect(hit.chapter?.number).toBe(4)
  })

  it('matches books by title, author, and genre', async () => {
    await seed()

    expect((await searchLibrary('everyday')).books).toHaveLength(1)
    expect((await searchLibrary('norman')).books).toHaveLength(1)
    expect((await searchLibrary('design')).books).toHaveLength(1)
  })

  it('is case-insensitive', async () => {
    await seed()
    expect((await searchLibrary('AFFORDANCES')).notes).toHaveLength(1)
  })

  it('returns nothing for a query under two characters', async () => {
    await seed()
    // Otherwise a single letter matches almost every note as you start typing.
    const results = await searchLibrary('a')

    expect(results.notes).toHaveLength(0)
    expect(results.books).toHaveLength(0)
  })

  it('returns nothing for whitespace', async () => {
    await seed()
    expect((await searchLibrary('   ')).notes).toHaveLength(0)
  })

  it('trims the snippet around the match rather than starting at the beginning', async () => {
    const bookId = newId()
    const chapterId = newId()
    const timestamp = nowIso()

    await db.books.add({
      id: bookId, title: 'Long', authors: [], genres: [], status: 'reading',
      source: 'manual', createdAt: timestamp, updatedAt: timestamp,
    })
    await db.chapters.add({ id: chapterId, bookId, number: 1, title: 'One', createdAt: timestamp })
    await db.notes.add({
      id: newId(), bookId, chapterId, type: 'text',
      content: `${'padding '.repeat(40)}NEEDLE${' padding'.repeat(40)}`,
      ocrStatus: 'none', createdAt: timestamp, updatedAt: timestamp,
    })

    const [hit] = (await searchLibrary('needle')).notes

    expect(hit.snippet).toContain('NEEDLE')
    expect(hit.snippet.startsWith('…')).toBe(true)
    expect(hit.snippet.endsWith('…')).toBe(true)
    expect(hit.snippet.length).toBeLessThan(200)
  })

  it('prefers the reader’s own words over machine-extracted text', async () => {
    const bookId = newId()
    const chapterId = newId()
    const timestamp = nowIso()

    await db.books.add({
      id: bookId, title: 'Both', authors: [], genres: [], status: 'reading',
      source: 'manual', createdAt: timestamp, updatedAt: timestamp,
    })
    await db.chapters.add({ id: chapterId, bookId, number: 1, title: 'One', createdAt: timestamp })
    await db.notes.add({
      id: newId(), bookId, chapterId, type: 'photo',
      content: 'shared word here', ocrText: 'shared word there',
      ocrStatus: 'done', createdAt: timestamp, updatedAt: timestamp,
    })

    expect((await searchLibrary('shared word')).notes[0].matchedIn).toBe('content')
  })
})

describe('splitOnMatch', () => {
  it('splits into alternating plain and matching parts', () => {
    const parts = splitOnMatch('one two one', 'one')

    expect(parts.filter((part) => part.hit)).toHaveLength(2)
    expect(parts.map((part) => part.text).join('')).toBe('one two one')
  })

  it('preserves the original casing of a case-insensitive match', () => {
    const parts = splitOnMatch('Clarity and clarity', 'clarity')

    expect(parts.filter((part) => part.hit).map((part) => part.text)).toEqual([
      'Clarity',
      'clarity',
    ])
  })

  it('returns the whole string unmatched when the query is empty', () => {
    expect(splitOnMatch('anything', '')).toEqual([{ text: 'anything', hit: false }])
  })

  it('never loses or duplicates characters', () => {
    const text = 'aaa'
    expect(splitOnMatch(text, 'aa').map((part) => part.text).join('')).toBe(text)
  })
})
