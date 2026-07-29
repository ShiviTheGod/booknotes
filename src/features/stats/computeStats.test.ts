import { describe, expect, it } from 'vitest'
import type { Book, Note } from '../../data/types'
import {
  computeCurrentStreak,
  computeFinishedPerMonth,
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
  it('counts only finished books toward pages read', () => {
    // Counting a part-read book's full page count would make the number meaningless.
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
