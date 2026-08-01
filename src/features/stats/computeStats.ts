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

/**
 * How far into a book its bookmark says the reader is.
 *
 * Capped at the book's length because a bookmark can outlive an edit: correcting a
 * 500-page book down to 320 leaves a bookmark beyond the end, and an uncapped sum
 * would then report more pages read than the book has.
 */
function bookmarkedPages(book: Book): number {
  if (!book.currentPage || book.currentPage <= 0) return 0
  return book.pageCount ? Math.min(book.currentPage, book.pageCount) : book.currentPage
}

export interface GoalProgress {
  goal: number
  finished: number
  remaining: number
  /** 0–1, clamped, for the bar. Passing the goal does not overfill it. */
  fraction: number
  /** How many should be done by today to finish on time, rounded down. */
  expectedByNow: number
  /** Positive when ahead of that pace, negative when behind. */
  aheadBy: number
  daysLeft: number
  done: boolean
}

/**
 * Progress against a books-per-year goal.
 *
 * Pace is measured against where the year is, not against a monthly quota: reading
 * is lumpy, and "you are 2 behind" in November means something quite different from
 * the same sentence in February. The year fraction handles that without any special
 * cases, and it is why a goal set halfway through the year does not immediately
 * report a hopeless deficit for books read before it was set — those still count.
 */
export function computeGoalProgress(
  books: Book[],
  goal: number,
  now = new Date(),
): GoalProgress | undefined {
  if (!goal || goal <= 0) return undefined

  const year = now.getFullYear()
  const finished = books.filter(
    (book) =>
      book.status === 'finished' &&
      book.dateFinished &&
      new Date(book.dateFinished).getFullYear() === year,
  ).length

  // Whole calendar days, never a difference of timestamps. Subtracting two instants
  // and dividing by 86,400,000 is off by an hour on either side of a daylight-saving
  // change, which is enough to drop the expected count by one for half the year —
  // and the report of being a book behind would have been the clock's fault.
  const elapsedDays = dayOfYear(now) + 1
  const yearLength = daysInYear(year)
  const daysLeft = yearLength - elapsedDays

  const expectedByNow = Math.floor(goal * (elapsedDays / yearLength))

  return {
    goal,
    finished,
    remaining: Math.max(0, goal - finished),
    fraction: Math.min(1, finished / goal),
    expectedByNow,
    aheadBy: finished - expectedByNow,
    daysLeft: Math.max(0, daysLeft),
    done: finished >= goal,
  }
}

/** Days from 1 January to `date`, counting 1 January as 0. */
function dayOfYear(date: Date): number {
  const millisecondsPerDay = 24 * 60 * 60 * 1000
  // The local Y/M/D are re-read as UTC, so the subtraction happens in a calendar
  // with no daylight saving in it at all.
  const start = Date.UTC(date.getFullYear(), 0, 1)
  const today = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  return Math.round((today - start) / millisecondsPerDay)
}

function daysInYear(year: number): number {
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
  return isLeap ? 366 : 365
}

export function computeStats(books: Book[], notes: Note[]): Stats {
  const finished = books.filter((book) => book.status === 'finished')

  const dayKeys = new Set(notes.map((note) => localDayKey(note.createdAt)))
  const today = localDayKey(new Date())

  // A finished book counts its full length; a book still being read counts only as far
  // as its bookmark. Before bookmarks existed the second group had to be left out
  // entirely — counting a part-read book's whole length would have inflated the number
  // into meaninglessness, and there was no way to know how far in the reader was.
  const pagesRead =
    finished.reduce((sum, book) => sum + (book.pageCount ?? 0), 0) +
    books
      .filter((book) => book.status === 'reading')
      .reduce((sum, book) => sum + bookmarkedPages(book), 0)

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
