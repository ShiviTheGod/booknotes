import type { BookSource } from '../data/types'

/**
 * Book metadata lookup.
 *
 * Google Books is tried first — it has the better covers, page counts, and categories.
 * Open Library is the fallback, and it is not a theoretical one: the keyless Google
 * Books endpoint is rate-limited per IP and returns 429 under load (confirmed while
 * building this). Open Library has no key, no quota, and sends permissive CORS headers,
 * so it keeps search working when Google shuts the door.
 *
 * Both providers are normalized to `BookCandidate` so the UI never branches on source.
 */

export interface BookCandidate {
  externalId: string
  title: string
  authors: string[]
  coverUrl?: string
  pageCount?: number
  genres: string[]
  publishedYear?: number
  source: BookSource
}

const GOOGLE_ENDPOINT = 'https://www.googleapis.com/books/v1/volumes'
const OPENLIBRARY_ENDPOINT = 'https://openlibrary.org/search.json'

/** Abort a provider that is taking too long rather than leaving the user on a spinner. */
const REQUEST_TIMEOUT_MS = 8000

export class BookSearchError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BookSearchError'
  }
}

export async function searchBooks(query: string, signal?: AbortSignal): Promise<BookCandidate[]> {
  const trimmed = query.trim()
  if (trimmed.length < 2) return []

  try {
    const results = await searchGoogleBooks(trimmed, signal)
    if (results.length > 0) return results
    // A genuinely empty Google result still deserves a second opinion — Open Library
    // has better coverage of older and non-English titles.
    return await searchOpenLibrary(trimmed, signal)
  } catch (error) {
    if (isAbort(error)) throw error

    try {
      return await searchOpenLibrary(trimmed, signal)
    } catch (fallbackError) {
      if (isAbort(fallbackError)) throw fallbackError
      throw new BookSearchError(
        'Both book services are unreachable. Check your connection, or add the book by hand.',
      )
    }
  }
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

async function fetchJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const timeout = new AbortController()
  const timer = setTimeout(() => timeout.abort(), REQUEST_TIMEOUT_MS)

  // Forward an outer cancellation (user typed another character) into our own controller.
  const onOuterAbort = () => timeout.abort()
  signal?.addEventListener('abort', onOuterAbort)

  try {
    const response = await fetch(url, { signal: timeout.signal })
    if (!response.ok) {
      throw new BookSearchError(`Search service responded ${response.status}`)
    }
    return await response.json()
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onOuterAbort)
  }
}

/* ------------------------------------------------------------------ Google Books */

interface GoogleVolume {
  id?: string
  volumeInfo?: {
    title?: string
    subtitle?: string
    authors?: string[]
    pageCount?: number
    categories?: string[]
    publishedDate?: string
    imageLinks?: { thumbnail?: string; smallThumbnail?: string }
  }
}

async function searchGoogleBooks(query: string, signal?: AbortSignal): Promise<BookCandidate[]> {
  const url = `${GOOGLE_ENDPOINT}?q=${encodeURIComponent(query)}&maxResults=20&printType=books`
  const payload = (await fetchJson(url, signal)) as { items?: GoogleVolume[] }

  return (payload.items ?? [])
    .map(toGoogleCandidate)
    .filter((candidate): candidate is BookCandidate => candidate !== undefined)
}

function toGoogleCandidate(volume: GoogleVolume): BookCandidate | undefined {
  const info = volume.volumeInfo
  if (!info?.title || !volume.id) return undefined

  return {
    externalId: `google:${volume.id}`,
    title: info.subtitle ? `${info.title}: ${info.subtitle}` : info.title,
    authors: info.authors ?? [],
    coverUrl: normalizeGoogleCover(info.imageLinks?.thumbnail ?? info.imageLinks?.smallThumbnail),
    pageCount: info.pageCount && info.pageCount > 0 ? info.pageCount : undefined,
    genres: cleanGenres(info.categories ?? []),
    publishedYear: parseYear(info.publishedDate),
    source: 'google',
  }
}

/**
 * Google returns cover URLs over plain http, which a browser silently blocks as mixed
 * content once the app is served over https — every cover would just vanish. Force
 * https, and drop the `edge=curl` page-curl overlay while we're here.
 */
function normalizeGoogleCover(url?: string): string | undefined {
  if (!url) return undefined
  return url.replace(/^http:\/\//i, 'https://').replace(/&edge=curl/gi, '')
}

/* ---------------------------------------------------------------- Open Library */

interface OpenLibraryDoc {
  key?: string
  title?: string
  author_name?: string[]
  cover_i?: number
  number_of_pages_median?: number
  subject?: string[]
  first_publish_year?: number
}

async function searchOpenLibrary(query: string, signal?: AbortSignal): Promise<BookCandidate[]> {
  const fields =
    'key,title,author_name,cover_i,number_of_pages_median,subject,first_publish_year'
  const url = `${OPENLIBRARY_ENDPOINT}?q=${encodeURIComponent(query)}&limit=20&fields=${fields}`
  const payload = (await fetchJson(url, signal)) as { docs?: OpenLibraryDoc[] }

  return (payload.docs ?? [])
    .map(toOpenLibraryCandidate)
    .filter((candidate): candidate is BookCandidate => candidate !== undefined)
}

function toOpenLibraryCandidate(doc: OpenLibraryDoc): BookCandidate | undefined {
  if (!doc.title || !doc.key) return undefined

  return {
    externalId: `openlibrary:${doc.key}`,
    title: doc.title,
    authors: doc.author_name ?? [],
    coverUrl: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg` : undefined,
    pageCount: doc.number_of_pages_median,
    // Open Library subject lists run to hundreds of entries and are extremely noisy,
    // so only the leading few are worth showing.
    genres: cleanGenres((doc.subject ?? []).slice(0, 12)),
    publishedYear: doc.first_publish_year,
    source: 'openlibrary',
  }
}

/* --------------------------------------------------------------------- shared */

/**
 * Tidy provider categories into shelf labels.
 *
 * Google returns BISAC-style strings like "Business & Economics / Personal Finance";
 * only the leading segment is a useful shelf name. Open Library returns free-form
 * subjects with wildly inconsistent casing and plenty of cataloguing cruft.
 */
function cleanGenres(raw: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const entry of raw) {
    const head = entry.split('/')[0].trim()
    if (head.length < 3 || head.length > 32) continue
    if (/^(general|nonfiction|fiction|accessible book|protected daisy)$/i.test(head)) continue

    const titled = head.replace(/\w\S*/g, (word) =>
      word.length <= 2 ? word : word[0].toUpperCase() + word.slice(1).toLowerCase(),
    )

    const key = titled.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(titled)

    if (result.length === 3) break
  }

  return result
}

function parseYear(value?: string): number | undefined {
  if (!value) return undefined
  const match = /^(\d{4})/.exec(value)
  return match ? Number(match[1]) : undefined
}
