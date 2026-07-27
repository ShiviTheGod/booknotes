import { db, newId, nowIso } from './db'
import type { Book, Chapter, Note } from './types'
import { SETTING_KEYS, getSetting, setSetting } from './repo/settings'

/**
 * A small starter library.
 *
 * This exists so the shelf, summary, and stats screens have something real to render
 * before any network code is wired up. It installs exactly once — after that the
 * `seeded` flag keeps it out of the way, so it never fights with real data.
 *
 * Covers come from Open Library's cover CDN, which is addressable by ISBN with no
 * lookup call. If a cover 404s the UI falls back to a typographic cover, so a missing
 * image is a cosmetic non-event rather than a broken shelf.
 */

interface SeedBook {
  title: string
  authors: string[]
  isbn: string
  pageCount: number
  genres: string[]
  finishedOn?: string
  startedOn: string
  /** [chapter title, ...notes] */
  chapters?: Array<[string, ...string[]]>
}

const SEED_BOOKS: SeedBook[] = [
  {
    title: 'Atomic Habits',
    authors: ['James Clear'],
    isbn: '9780735211292',
    pageCount: 320,
    genres: ['Self-help', 'Psychology'],
    startedOn: '2026-01-08',
    finishedOn: '2026-02-14',
    chapters: [
      [
        'The Surprising Power of Tiny Habits',
        '1% better every day compounds to ~37x over a year. The maths is the whole argument.',
        'Outcomes are lagging indicators of habits — you get what you repeat, not what you want.',
      ],
      [
        'How Habits Shape Identity',
        'The goal is not to read a book, it is to become a reader. Identity first, outcomes second.',
        'Every action is a vote for the type of person you wish to become.',
      ],
      [
        'Make It Obvious',
        'Implementation intention: "I will [behaviour] at [time] in [location]." Specificity beats motivation.',
      ],
    ],
  },
  {
    title: 'Thinking, Fast and Slow',
    authors: ['Daniel Kahneman'],
    isbn: '9780374533557',
    pageCount: 499,
    genres: ['Psychology', 'Economics'],
    startedOn: '2026-02-20',
    finishedOn: '2026-04-03',
    chapters: [
      [
        'Two Systems',
        'System 1 is fast, automatic, always on. System 2 is slow, effortful, and lazy by default.',
        'Most errors come from System 2 endorsing System 1 without checking.',
      ],
      [
        'Anchors',
        'Arbitrary numbers contaminate estimates even when you know they are arbitrary. Knowing does not immunise you.',
      ],
      [
        'Loss Aversion',
        'Losses loom roughly twice as large as equivalent gains. Explains far more stubbornness than it should.',
      ],
    ],
  },
  {
    title: 'The Design of Everyday Things',
    authors: ['Don Norman'],
    isbn: '9780465050659',
    pageCount: 368,
    genres: ['Design', 'Psychology'],
    startedOn: '2026-04-10',
    finishedOn: '2026-05-19',
    chapters: [
      [
        'The Psychopathology of Everyday Things',
        'If a door needs a sign saying PUSH, the door has failed, not the person.',
        'Affordances tell you what is possible; signifiers tell you where to act.',
      ],
      [
        'The Psychology of Everyday Actions',
        'Gulf of execution vs gulf of evaluation — the two places a design can lose someone.',
      ],
    ],
  },
  {
    title: 'Sapiens: A Brief History of Humankind',
    authors: ['Yuval Noah Harari'],
    isbn: '9780062316097',
    pageCount: 443,
    genres: ['History', 'Anthropology'],
    startedOn: '2026-05-22',
    finishedOn: '2026-06-28',
    chapters: [
      [
        'The Cognitive Revolution',
        'Shared fictions — money, nations, companies — are what let strangers cooperate at scale.',
        'Language did not just describe reality, it let us invent realities together.',
      ],
      [
        'The Agricultural Revolution',
        'Called "history\'s biggest fraud": more calories, worse lives. Wheat domesticated us.',
      ],
    ],
  },
  {
    title: 'Educated',
    authors: ['Tara Westover'],
    isbn: '9780399590504',
    pageCount: 334,
    genres: ['Memoir', 'Biography'],
    startedOn: '2026-06-30',
    finishedOn: '2026-07-18',
    chapters: [
      [
        'Part One',
        'Memory as contested ground — she footnotes her own disagreements with family accounts.',
      ],
      [
        'Part Two',
        'Education framed not as credentials but as the ability to hold two contradictory ideas at once.',
      ],
    ],
  },
  {
    title: 'Braiding Sweetgrass',
    authors: ['Robin Wall Kimmerer'],
    isbn: '9781571313560',
    pageCount: 391,
    genres: ['Nature', 'Essays'],
    startedOn: '2026-07-06',
    finishedOn: '2026-07-24',
    chapters: [
      [
        'The Gift of Strawberries',
        'A gift economy creates relationship; a market transaction ends it. Same object, different world.',
      ],
      [
        'Learning the Grammar of Animacy',
        'English makes almost everything an "it". Potawatomi does not — and that changes what you can care about.',
      ],
    ],
  },
  {
    title: 'Deep Work',
    authors: ['Cal Newport'],
    isbn: '9781455586691',
    pageCount: 296,
    genres: ['Productivity', 'Business'],
    startedOn: '2026-07-20',
    chapters: [
      [
        'Deep Work Is Valuable',
        'The ability to concentrate without distraction is becoming rare exactly as it becomes valuable.',
      ],
      ['Deep Work Is Rare', 'Open offices and instant messaging optimise for responsiveness, not output.'],
    ],
  },
  {
    title: 'The Sense of Style',
    authors: ['Steven Pinker'],
    isbn: '9780143127796',
    pageCount: 368,
    genres: ['Writing', 'Language'],
    startedOn: '2026-07-25',
    chapters: [['Good Writing', 'Classic style: the writer shows the reader something in the world.']],
  },
]

function coverUrl(isbn: string): string {
  return `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`
}

/**
 * Spread note timestamps backward from the book's finish date so the stats screen
 * has a believable streak to compute instead of everything landing on one instant.
 */
function noteTimestamp(anchorDate: string, dayOffset: number, index: number): string {
  const date = new Date(`${anchorDate}T19:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() - dayOffset)
  date.setUTCMinutes(date.getUTCMinutes() + index * 7)
  return date.toISOString()
}

export async function seedIfEmpty(): Promise<void> {
  const alreadySeeded = await getSetting(SETTING_KEYS.seeded, false)
  if (alreadySeeded) return

  // Belt and braces: never seed on top of real data.
  const existingCount = await db.books.count()
  if (existingCount > 0) {
    await setSetting(SETTING_KEYS.seeded, true)
    return
  }

  const books: Book[] = []
  const chapters: Chapter[] = []
  const notes: Note[] = []
  const timestamp = nowIso()

  SEED_BOOKS.forEach((seed) => {
    const bookId = newId()
    const anchor = seed.finishedOn ?? seed.startedOn

    books.push({
      id: bookId,
      title: seed.title,
      authors: seed.authors,
      coverUrl: coverUrl(seed.isbn),
      pageCount: seed.pageCount,
      genres: seed.genres,
      status: seed.finishedOn ? 'finished' : 'reading',
      dateStarted: new Date(`${seed.startedOn}T09:00:00.000Z`).toISOString(),
      dateFinished: seed.finishedOn
        ? new Date(`${seed.finishedOn}T21:00:00.000Z`).toISOString()
        : undefined,
      source: 'manual',
      externalId: `seed:${seed.isbn}`,
      createdAt: timestamp,
      updatedAt: timestamp,
    })

    seed.chapters?.forEach(([chapterTitle, ...noteBodies], chapterIndex) => {
      const chapterId = newId()
      chapters.push({
        id: chapterId,
        bookId,
        number: chapterIndex + 1,
        title: chapterTitle,
        createdAt: timestamp,
      })

      noteBodies.forEach((body, noteIndex) => {
        const created = noteTimestamp(anchor, seed.chapters!.length - chapterIndex, noteIndex)
        notes.push({
          id: newId(),
          bookId,
          chapterId,
          type: 'text',
          content: body,
          ocrStatus: 'none',
          createdAt: created,
          updatedAt: created,
        })
      })
    })
  })

  await db.transaction('rw', db.books, db.chapters, db.notes, db.settings, async () => {
    await db.books.bulkAdd(books)
    await db.chapters.bulkAdd(chapters)
    await db.notes.bulkAdd(notes)
  })

  await setSetting(SETTING_KEYS.seeded, true)
}

/** Wipe everything and reinstall the starter library. Exposed on the Settings screen. */
export async function resetToSeed(): Promise<void> {
  await db.transaction('rw', db.books, db.chapters, db.notes, db.images, db.settings, async () => {
    await Promise.all([
      db.books.clear(),
      db.chapters.clear(),
      db.notes.clear(),
      db.images.clear(),
      db.settings.clear(),
    ])
  })
  await seedIfEmpty()
}
