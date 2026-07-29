import { db } from '../data/db'
import type { Book, Chapter, Note } from '../data/types'

/**
 * Search across the whole library.
 *
 * `searchNotes` in the notes repository finds matching notes but returns them bare,
 * which is useless in a results list — "1% better every day" means nothing without
 * "Atomic Habits, chapter 1" attached. This layer does that join, and picks the
 * snippet around the match rather than showing the note from the start.
 *
 * Photo notes are the reason this matters most: their extracted OCR text is stored
 * as metadata the reader never typed and cannot browse, so search is the only way
 * to reach it.
 */

export type MatchField = 'content' | 'ocrText' | 'translatedText'

export interface NoteHit {
  note: Note
  book: Book | undefined
  chapter: Chapter | undefined
  matchedIn: MatchField
  snippet: string
}

export interface SearchResults {
  query: string
  books: Book[]
  notes: NoteHit[]
}

/** Characters of context to keep either side of a match. */
const SNIPPET_RADIUS = 55

export async function searchLibrary(rawQuery: string): Promise<SearchResults> {
  const query = rawQuery.trim()
  const needle = query.toLowerCase()

  if (needle.length < 2) {
    return { query, books: [], notes: [] }
  }

  // One read of each table, then everything is matched in memory. A personal
  // library is small enough that this is instant, and it avoids N queries to
  // resolve the book and chapter for every hit.
  const [books, chapters, notes] = await Promise.all([
    db.books.toArray(),
    db.chapters.toArray(),
    db.notes.toArray(),
  ])

  const bookById = new Map(books.map((book) => [book.id, book]))
  const chapterById = new Map(chapters.map((chapter) => [chapter.id, chapter]))

  const matchingBooks = books.filter(
    (book) =>
      book.title.toLowerCase().includes(needle) ||
      book.authors.some((author) => author.toLowerCase().includes(needle)) ||
      book.genres.some((genre) => genre.toLowerCase().includes(needle)),
  )

  const noteHits: NoteHit[] = []

  for (const note of notes) {
    const field = firstMatchingField(note, needle)
    if (!field) continue

    noteHits.push({
      note,
      book: bookById.get(note.bookId),
      chapter: chapterById.get(note.chapterId),
      matchedIn: field,
      snippet: makeSnippet(note[field] ?? '', needle),
    })
  }

  // Newest first: when you half-remember something you read, it's usually recent.
  noteHits.sort((a, b) => b.note.createdAt.localeCompare(a.note.createdAt))

  return { query, books: matchingBooks, notes: noteHits }
}

/**
 * Which field matched, in the order the reader would expect to see it.
 * Their own words beat machine-extracted text.
 */
function firstMatchingField(note: Note, needle: string): MatchField | undefined {
  if (note.content.toLowerCase().includes(needle)) return 'content'
  if (note.ocrText?.toLowerCase().includes(needle)) return 'ocrText'
  if (note.translatedText?.toLowerCase().includes(needle)) return 'translatedText'
  return undefined
}

/** Text around the match, with ellipses where it has been cut. */
function makeSnippet(text: string, needle: string): string {
  const index = text.toLowerCase().indexOf(needle)
  if (index === -1) return text.slice(0, SNIPPET_RADIUS * 2)

  const start = Math.max(0, index - SNIPPET_RADIUS)
  const end = Math.min(text.length, index + needle.length + SNIPPET_RADIUS)

  const prefix = start > 0 ? '…' : ''
  const suffix = end < text.length ? '…' : ''

  return `${prefix}${text.slice(start, end).trim()}${suffix}`
}

/**
 * Split text into alternating non-matching / matching parts for highlighting.
 * Done here rather than with dangerouslySetInnerHTML so note text — which can
 * contain anything the reader typed or a camera picked up — is never treated as markup.
 */
export function splitOnMatch(text: string, rawQuery: string): Array<{ text: string; hit: boolean }> {
  const needle = rawQuery.trim().toLowerCase()
  if (!needle) return [{ text, hit: false }]

  const parts: Array<{ text: string; hit: boolean }> = []
  const haystack = text.toLowerCase()

  let cursor = 0
  for (;;) {
    const index = haystack.indexOf(needle, cursor)
    if (index === -1) break

    if (index > cursor) parts.push({ text: text.slice(cursor, index), hit: false })
    parts.push({ text: text.slice(index, index + needle.length), hit: true })
    cursor = index + needle.length
  }

  if (cursor < text.length) parts.push({ text: text.slice(cursor), hit: false })

  return parts
}
