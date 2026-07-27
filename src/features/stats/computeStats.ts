import type { Book, Note } from '../../data/types'

/**
 * Stats derived from books and notes.
 *
 * Kept as pure functions over plain arrays so the arithmetic can be reasoned about
 * (and corrected) without touching the database or the UI.
 *
 * Days are local, not UTC. A note written at 11pm belongs to that evening from the
 * reader's point of view, and UTC bucketing would silently push it into tomorrow for
 * anyone east of Greenwich — quietly breaking streaks for no visible reason.
 */

export interface MonthCount {
  key: string
  label: string
  count: number
}

export interface Stats {
  totalBooks: number
  finishedBooks: number
  readingBooks: number
  totalNotes: number
  pagesRead: number
  /** Finished books with no page count, so the estimate can be honest about its gaps. */
  booksMissingPageCount: number
  currentStreak: number
  longestStreak: number
  notedToday: boolean
  finishedPerMonth: MonthCount[]
  averageNotesPerBook: number
}

/** Local calendar day as YYYY-MM-DD. */
export function localDayKey(input: string | Date): string {
  const date = typeof input === 'string' ? new Date(input) : input
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addDays(key: string, delta: number): string {
  const [year, month, day] = key.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  date.setDate(date.getDate() + delta)
  return localDayKey(date)
}

/**
 * Current run of consecutive days ending today.
 *
 * Yesterday still counts as "current" — otherwise the streak appears to collapse to
 * zero every morning until the first note of the day, which is both wrong and
 * discouraging. It only breaks once a full day has been missed.
 */
export function computeCurrentStreak(dayKeys: Set<string>, today = localDayKey(new Date())): number {
  let cursor = today

  if (!dayKeys.has(cursor)) {
    cursor = addDays(today, -1)
    if (!dayKeys.has(cursor)) return 0
  }

  let streak = 0
  while (dayKeys.has(cursor)) {
    streak += 1
    cursor = addDays(cursor, -1)
  }
  return streak
}

/** Longest run of consecutive days anywhere in the history. */
export function computeLongestStreak(dayKeys: Set<string>): number {
  if (dayKeys.size === 0) return 0

  const sorted = [...dayKeys].sort()
  let longest = 1
  let run = 1

  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i] === addDays(sorted[i - 1], 1)) {
      run += 1
      longest = Math.max(longest, run)
    } else {
      run = 1
    }
  }

  return longest
}

/** Finished-book counts for the trailing `months` window, oldest first. */
export function computeFinishedPerMonth(books: Book[], months = 12): MonthCount[] {
  const counts = new Map<string, number>()

  for (const book of books) {
    if (book.status !== 'finished' || !book.dateFinished) continue
    const date = new Date(book.dateFinished)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  // Build the window from a fixed cursor so months with zero finishes still appear —
  // gaps in a bar chart are information, and skipping them distorts the shape.
  const result: MonthCount[] = []
  const cursor = new Date()
  cursor.setDate(1)

  for (let i = months - 1; i >= 0; i -= 1) {
    const date = new Date(cursor.getFullYear(), cursor.getMonth() - i, 1)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    result.push({
      key,
      label: date.toLocaleDateString(undefined, { month: 'short' }),
      count: counts.get(key) ?? 0,
    })
  }

  return result
}

export function computeStats(books: Book[], notes: Note[]): Stats {
  const finished = books.filter((book) => book.status === 'finished')

  const dayKeys = new Set(notes.map((note) => localDayKey(note.createdAt)))
  const today = localDayKey(new Date())

  // Only finished books count toward pages read. Counting a partially-read book's
  // full page count would inflate the number into meaninglessness.
  const pagesRead = finished.reduce((sum, book) => sum + (book.pageCount ?? 0), 0)

  return {
    totalBooks: books.length,
    finishedBooks: finished.length,
    readingBooks: books.filter((book) => book.status === 'reading').length,
    totalNotes: notes.length,
    pagesRead,
    booksMissingPageCount: finished.filter((book) => !book.pageCount).length,
    currentStreak: computeCurrentStreak(dayKeys, today),
    longestStreak: computeLongestStreak(dayKeys),
    notedToday: dayKeys.has(today),
    finishedPerMonth: computeFinishedPerMonth(books),
    averageNotesPerBook: books.length === 0 ? 0 : notes.length / books.length,
  }
}
