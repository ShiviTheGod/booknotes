import { parseCsv, toRecords } from './csv'

/**
 * Reads a Goodreads library export into books this app can hold.
 *
 * Everyone arriving here already has a reading history somewhere, and typing it back
 * in one search at a time is the reason a new shelf stays empty. Goodreads is the
 * common denominator: the export is a plain CSV from Account settings, and it carries
 * the shelf, the page count, the dates, the rating and the review text.
 *
 * The mapping is deliberately lossy in one direction. A "to-read" shelf has nowhere
 * to live in an app about notes on books you are reading, so those rows are counted
 * and skipped rather than quietly turned into books you never opened.
 */

export interface ImportedBook {
  externalId: string
  title: string
  authors: string[]
  isbn?: string
  pageCount?: number
  genres: string[]
  status: 'reading' | 'finished'
  dateStarted?: string
  dateFinished?: string
  /** 1–5. Goodreads writes 0 for "not rated", which becomes undefined here. */
  rating?: number
  review?: string
}

export interface ParsedLibrary {
  books: ImportedBook[]
  /** Counted rather than imported, so the summary can account for every row. */
  skippedToRead: number
  skippedUnusable: number
}

/** Goodreads' own shelves, which are states rather than subjects. */
const EXCLUSIVE_SHELVES = new Set(['read', 'currently-reading', 'to-read'])

/** How many of someone's own shelves to keep as genres before it turns into noise. */
const MAX_GENRES = 3

/**
 * Goodreads writes identifiers as `="9780735211292"`.
 *
 * That is an Excel formula wrapper, there to stop a spreadsheet from reading a long
 * ISBN as a number in scientific notation. It is not part of the value.
 */
function unwrapSpreadsheetFormula(value: string): string {
  const match = /^="(.*)"$/.exec(value.trim())
  return (match ? match[1] : value).trim()
}

/**
 * `YYYY/MM/DD` to an ISO instant, anchored at local midday.
 *
 * Midday rather than midnight because these are calendar dates with no time in them.
 * Anchoring at midnight and converting to UTC moves the date back a day for anyone
 * west of Greenwich, which would show books finished the day before they were.
 */
function parseDate(value: string): string | undefined {
  const match = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(value.trim())
  if (!match) return undefined

  const [, year, month, day] = match
  const date = new Date(Number(year), Number(month) - 1, Number(day), 12)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

function parseCount(value: string): number | undefined {
  const parsed = Number.parseInt(value.replace(/[^\d]/g, ''), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function parseAuthors(record: Record<string, string>): string[] {
  const primary = record['Author']?.trim()
  const additional = (record['Additional Authors'] ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)

  return [primary, ...additional].filter((name): name is string => Boolean(name))
}

function parseGenres(record: Record<string, string>): string[] {
  return (record['Bookshelves'] ?? '')
    .split(',')
    .map((shelf) => shelf.trim())
    .filter((shelf) => shelf !== '' && !EXCLUSIVE_SHELVES.has(shelf.toLowerCase()))
    .slice(0, MAX_GENRES)
}

/** Thrown for a file that parses as CSV but plainly is not this export. */
export class NotAGoodreadsExport extends Error {
  constructor() {
    super(
      "That doesn't look like a Goodreads export. It should be the CSV from Goodreads → My Books → Import and export.",
    )
    this.name = 'NotAGoodreadsExport'
  }
}

export function parseGoodreadsCsv(text: string): ParsedLibrary {
  const rows = parseCsv(text)

  // Checked against the header row itself, not the first record: a file with the
  // right columns and no books yet is an empty library, not a wrong file.
  const header = (rows[0] ?? []).map((name) => name.trim())
  if (!header.includes('Title') || !header.includes('Author')) {
    throw new NotAGoodreadsExport()
  }

  const records = toRecords(rows)

  const books: ImportedBook[] = []
  let skippedToRead = 0
  let skippedUnusable = 0

  for (const record of records) {
    const title = record['Title']?.trim()
    if (!title) {
      skippedUnusable += 1
      continue
    }

    const shelf = (record['Exclusive Shelf'] ?? '').trim().toLowerCase()
    const dateFinished = parseDate(record['Date Read'] ?? '')

    if (shelf === 'to-read') {
      skippedToRead += 1
      continue
    }

    // Fall back to the date rather than the shelf when the column is missing: an
    // export edited in a spreadsheet often loses it, and a finish date is still
    // unambiguous evidence the book was read.
    const status: ImportedBook['status'] =
      shelf === 'read' || (shelf === '' && dateFinished) ? 'finished' : 'reading'

    const rating = parseCount(record['My Rating'] ?? '')
    const review = record['My Review']?.trim()
    const isbn =
      unwrapSpreadsheetFormula(record['ISBN13'] ?? '') ||
      unwrapSpreadsheetFormula(record['ISBN'] ?? '') ||
      undefined

    const bookId = record['Book Id']?.trim()

    books.push({
      // Falls back to title and author so a file without the id column still
      // de-duplicates against a second import of itself.
      externalId: bookId
        ? `goodreads:${bookId}`
        : `goodreads:${title.toLowerCase()}|${(record['Author'] ?? '').toLowerCase()}`,
      title,
      authors: parseAuthors(record),
      isbn,
      pageCount: parseCount(record['Number of Pages'] ?? ''),
      genres: parseGenres(record),
      status,
      dateStarted: parseDate(record['Date Added'] ?? ''),
      dateFinished: status === 'finished' ? dateFinished : undefined,
      rating: rating && rating >= 1 && rating <= 5 ? rating : undefined,
      review: review || undefined,
    })
  }

  return { books, skippedToRead, skippedUnusable }
}
