import { db, nowIso } from '../db'
import type { Book, Review } from '../types'
import { bookKey } from '../../services/social/bookKey'

/** The reader's own reviews, held locally so they work offline and land in backups. */

export function getReview(bookId: string): Promise<Review | undefined> {
  return db.reviews.get(bookId)
}

export function listReviews(): Promise<Review[]> {
  return db.reviews.toArray()
}

export async function saveReview(
  book: Book,
  input: { rating?: number; body: string },
): Promise<Review> {
  const existing = await db.reviews.get(book.id)
  const now = nowIso()

  const review: Review = {
    bookId: book.id,
    // Recomputed on every save rather than stored once: correcting a book's title or
    // author is exactly the moment the key needs to change, or the review would go on
    // pointing at the misspelled version and never meet a friend's.
    bookKey: bookKey(book.title, book.authors),
    rating: input.rating,
    body: input.body.trim(),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }

  await db.reviews.put(review)
  return review
}

export async function deleteReview(bookId: string): Promise<void> {
  await db.reviews.delete(bookId)
}
