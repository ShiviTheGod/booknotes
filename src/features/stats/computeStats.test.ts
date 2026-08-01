import { describe, expect, it } from 'vitest'
import type { Book, Note } from '../../data/types'
import {
  computeCurrentStreak,
  computeFinishedPerMonth,
  computeGoalProgress,
  computeLongestStreak,
  computeStats,
  localDayKey,
} from './computeStats'

/** A local-day key `offset` days from today, matching how notes are bucketed. */
function day(offset: number): string {
  const date = new Date()
  date.setDate(date.getDate() + offset)
  return localDayKey(date)
}

function book(overrides: Partial<Book> = {}): Book {
  return {
    id: crypto.randomUUID(),
    title: 'A Book',
    authors: ['An Author'],
    genres: [],
    status: 'reading',
    source: 'manual',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

function note(createdAt: string, overrides: Partial<Note> = {}): Note {
  return {
    id: crypto.randomUUID(),
    bookId: 'b',
    chapterId: 'c',
    type: 'text',
    content: 'An idea',
    ocrStatus: 'none',
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  }
}

describe('computeCurrentStreak', () => {
  it('counts consecutive days ending today', () => {
    expect(computeCurrentStreak(new Set([day(0), day(-1), day(-2)]), day(0))).toBe(3)
  })

  it('still counts a streak that ends yesterday', () => {
    // Deliberate: otherwise the streak reads zero every morning until the first
    // note of the day, which is both wrong and discouraging.
    expect(computeCurrentStreak(new Set([day(-1), day(-2)]), day(0))).toBe(2)
  })

  it('breaks once a full day has been missed', () => {
    expect(computeCurrentStreak(new Set([day(-2), day(-3)]), day(0))).toBe(0)
  })

  it('is zero with no notes at all', () => {
    expect(computeCurrentStreak(new Set(), day(0))).toBe(0)
  })

  it('ignores days after today', () => {
    expect(computeCurrentStreak(new Set([day(0), day(3)]), day(0))).toBe(1)
  })
})

describe('computeLongestStreak', () => {
  it('finds the longest run, not the most recent', () => {
    const days = new Set([day(-20), day(-19), day(-18), day(-17), day(-5), day(-4)])
    expect(computeLongestStreak(days)).toBe(4)
  })

  it('is 1 when no two days are adjacent', () => {
    expect(computeLongestStreak(new Set([day(-10), day(-8), day(-6)]))).toBe(1)
  })

  it('is 0 with no notes', () => {
    expect(computeLongestStreak(new Set())).toBe(0)
  })

  it('crosses month boundaries', () => {
    // Naive day arithmetic breaks exactly here.
    expect(computeLongestStreak(new Set(['2026-01-31', '2026-02-01', '2026-02-02']))).toBe(3)
  })

  it('crosses year boundaries', () => {
    expect(computeLongestStreak(new Set(['2025-12-31', '2026-01-01']))).toBe(2)
  })

  it('handles a leap day', () => {
    expect(computeLongestStreak(new Set(['2028-02-28', '2028-02-29', '2028-03-01']))).toBe(3)
  })
})

describe('computeFinishedPerMonth', () => {
  it('returns a fixed-length window including months with no finishes', () => {
    // Gaps are information; skipping empty months would distort the chart's shape.
    const months = computeFinishedPerMonth([], 12)
    expect(months).toHaveLength(12)
    expect(months.every((month) => month.count === 0)).toBe(true)
  })

  it('counts only finished books', () => {
    const now = new Date().toISOString()
    const months = computeFinishedPerMonth(
      [
        book({ status: 'finished', dateFinished: now }),
        book({ status: 'finished', dateFinished: now }),
        book({ status: 'reading' }),
      ],
      12,
    )

    expect(months.at(-1)?.count).toBe(2)
  })

  it('ignores a finished book with no finish date', () => {
    const months = computeFinishedPerMonth([book({ status: 'finished' })], 12)
    expect(months.reduce((sum, month) => sum + month.count, 0)).toBe(0)
  })
})

describe('computeStats', () => {
  it('ignores an unbookmarked book still being read', () => {
    // Its full length is not evidence of anything: without a bookmark there is no way
    // to know whether the reader is on page 2 or page 900.
    const stats = computeStats(
      [
        book({ status: 'finished', pageCount: 300, dateFinished: new Date().toISOString() }),
        book({ status: 'reading', pageCount: 999 }),
      ],
      [],
    )

    expect(stats.pagesRead).toBe(300)
    expect(stats.finishedBooks).toBe(1)
    expect(stats.readingBooks).toBe(1)
  })

  it('counts a book in progress as far as its bookmark', () => {
    const stats = computeStats(
      [
        book({ status: 'finished', pageCount: 300, dateFinished: new Date().toISOString() }),
        book({ status: 'reading', pageCount: 400, currentPage: 120 }),
      ],
      [],
    )

    expect(stats.pagesRead).toBe(420)
  })

  it('does not let a stale bookmark report more pages than the book has', () => {
    // Shortening a book's page count can strand its bookmark past the end. Summing it
    // raw would claim more pages read than exist.
    const stats = computeStats([book({ status: 'reading', pageCount: 320, currentPage: 500 })], [])

    expect(stats.pagesRead).toBe(320)
  })

  it('treats a bookmark with no known length as pages read all the same', () => {
    // Page 80 of a book of unknown length is still 80 pages of reading.
    const stats = computeStats([book({ status: 'reading', currentPage: 80 })], [])

    expect(stats.pagesRead).toBe(80)
  })

  it('reports how many finished books lack a page count', () => {
    const stats = computeStats(
      [
        book({ status: 'finished', dateFinished: new Date().toISOString() }),
        book({ status: 'finished', pageCount: 100, dateFinished: new Date().toISOString() }),
      ],
      [],
    )

    expect(stats.booksMissingPageCount).toBe(1)
  })

  it('tracks whether a note was added today', () => {
    const today = computeStats([], [note(new Date().toISOString())])
    expect(today.notedToday).toBe(true)

    const threeDaysAgo = new Date()
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)
    expect(computeStats([], [note(threeDaysAgo.toISOString())]).notedToday).toBe(false)
  })

  it('does not divide by zero on an empty library', () => {
    const stats = computeStats([], [])
    expect(stats.averageNotesPerBook).toBe(0)
    expect(stats.pagesRead).toBe(0)
    expect(stats.currentStreak).toBe(0)
  })

  it('counts several notes on one day as a single streak day', () => {
    const now = new Date().toISOString()
    const stats = computeStats([], [note(now), note(now), note(now)])
    expect(stats.currentStreak).toBe(1)
    expect(stats.totalNotes).toBe(3)
  })
})

describe('computeGoalProgress', () => {
  /** A book finished on a fixed calendar date, so pace can be checked against a fixed "now". */
  function finishedOn(iso: string): Book {
    return book({ status: 'finished', dateFinished: new Date(`${iso}T12:00:00`).toISOString() })
  }

  const midYear = new Date(2026, 6, 2, 12) // 2 July 2026 — just past halfway.

  it('is absent until a goal is set', () => {
    expect(computeGoalProgress([finishedOn('2026-01-05')], 0, midYear)).toBeUndefined()
  })

  it('counts only books finished in the current year', () => {
    const books = [finishedOn('2026-01-05'), finishedOn('2025-12-30'), book()]
    expect(computeGoalProgress(books, 12, midYear)?.finished).toBe(1)
  })

  it('measures pace against how far into the year it is', () => {
    // Half a year gone, goal of 12, so six is the pace.
    const onPace = Array.from({ length: 6 }, (_, i) => finishedOn(`2026-0${i + 1}-10`))
    const progress = computeGoalProgress(onPace, 12, midYear)

    expect(progress?.expectedByNow).toBe(6)
    expect(progress?.aheadBy).toBe(0)
    expect(progress?.remaining).toBe(6)
  })

  it('reports being ahead and behind that pace', () => {
    const eight = Array.from({ length: 8 }, (_, i) => finishedOn(`2026-0${(i % 6) + 1}-1${i}`))
    expect(computeGoalProgress(eight, 12, midYear)?.aheadBy).toBe(2)
    expect(computeGoalProgress([finishedOn('2026-02-01')], 12, midYear)?.aheadBy).toBe(-5)
  })

  it('does not overfill the bar once the goal is passed', () => {
    const many = Array.from({ length: 20 }, (_, i) => finishedOn(`2026-0${(i % 6) + 1}-0${(i % 9) + 1}`))
    const progress = computeGoalProgress(many, 12, midYear)

    expect(progress?.done).toBe(true)
    expect(progress?.fraction).toBe(1)
    expect(progress?.remaining).toBe(0)
  })

  it('counts books finished before the goal was set, not just after', () => {
    // Setting a goal in July is not a fresh start — January's reading still counts,
    // which is the difference between an encouraging number and a discouraging one.
    const progress = computeGoalProgress([finishedOn('2026-01-05')], 12, midYear)
    expect(progress?.finished).toBe(1)
  })

  it('leaves no days and no pace credit on the last day of the year', () => {
    const lastDay = new Date(2026, 11, 31, 23)
    const progress = computeGoalProgress([finishedOn('2026-03-01')], 12, lastDay)

    expect(progress?.daysLeft).toBe(0)
    expect(progress?.remaining).toBe(11)
  })
})
