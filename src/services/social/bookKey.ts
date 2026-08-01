/**
 * A key that identifies the same book across two people's shelves.
 *
 * This is what decides whether a friend's review of a book ever shows up next to
 * yours, and it is harder than it looks. Two readers rarely hold identical metadata:
 * one added the book from Google Books, the other from Open Library, the third typed
 * it in by hand. The provider ids are useless here — they are per-provider, so the
 * same book has three of them.
 *
 * So the key is built from what humans agree on: the title and the first author,
 * flattened until the differences that do not matter stop mattering.
 *
 * It will not catch everything. Two editions with genuinely different titles, or a
 * translated edition, will not meet. That is the honest limit of matching on text
 * alone, and the failure is quiet and harmless — a review simply does not appear —
 * rather than two different books being merged into one.
 */

export function bookKey(title: string, authors: string[] = []): string {
  const left = flatten(stripSubtitle(title))
  const right = flatten(authors[0] ?? '')
  return right ? `${left}|${right}` : left
}

/**
 * Everything after a colon goes.
 *
 * Providers disagree wildly about subtitles: "Atomic Habits" from one, "Atomic Habits:
 * An Easy & Proven Way to Build Good Habits" from another. The part before the colon
 * is the part people actually call the book.
 */
function stripSubtitle(title: string): string {
  const [main] = title.split(/[:–—]/)
  return main ?? title
}

function flatten(value: string): string {
  return (
    value
      .normalize('NFD')
      // Strip diacritics, so "Kafka" and "Kafkå" — or a title typed without háčky —
      // still land together. Matters more here than in English-only libraries.
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      // A leading article is the single most common difference between two catalogue
      // entries for one book.
      .replace(/^(the|a|an)\s+/, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  )
}
