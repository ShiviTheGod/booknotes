import { createBook, findByExternalId } from '../../data/repo/books'
import { saveReview } from '../../data/repo/reviews'
import type { ImportedBook } from './goodreads'

/**
 * Puts parsed books onto the shelf.
 *
 * Separate from the parsing so the mapping can be tested without a database, and so
 * this half can be pointed at another export format later without rewriting it.
 */

export interface ImportSummary {
  added: number
  /** Already on the shelf from an earlier import. */
  alreadyThere: number
  reviews: number
}

function coverUrl(isbn: string): string {
  return `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`
}

export async function importBooks(
  books: ImportedBook[],
  onProgress?: (done: number, total: number) => void,
): Promise<ImportSummary> {
  const summary: ImportSummary = { added: 0, alreadyThere: 0, reviews: 0 }

  for (const [index, incoming] of books.entries()) {
    // One at a time rather than a bulk insert: running the same file twice is a
    // completely ordinary thing to do, and duplicating a library is unpleasant to
    // undo by hand.
    const existing = await findByExternalId(incoming.externalId)
    if (existing) {
      summary.alreadyThere += 1
      onProgress?.(index + 1, books.length)
      continue
    }

    const book = await createBook({
      title: incoming.title,
      authors: incoming.authors,
      coverUrl: incoming.isbn ? coverUrl(incoming.isbn) : undefined,
      pageCount: incoming.pageCount,
      genres: incoming.genres,
      status: incoming.status,
      dateStarted: incoming.dateStarted,
      dateFinished: incoming.dateFinished,
      source: 'manual',
      externalId: incoming.externalId,
    })

    summary.added += 1

    // A star rating with no words is still worth keeping — it is the whole of what
    // many people wrote down, and it is what the shelf and the friends list read.
    if (incoming.rating || incoming.review) {
      await saveReview(book, { rating: incoming.rating, body: incoming.review ?? '' })
      summary.reviews += 1
    }

    onProgress?.(index + 1, books.length)
  }

  return summary
}
