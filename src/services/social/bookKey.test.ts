import { describe, expect, it } from 'vitest'
import { bookKey } from './bookKey'

/**
 * Whether two friends' reviews of the same book ever meet comes down to this function.
 *
 * The failures worth guarding are the ones where two people are plainly holding the
 * same book and the app says otherwise — different provider, different subtitle,
 * different capitalisation — and the opposite failure, where two genuinely different
 * books get collapsed into one and someone's review appears under the wrong title.
 */

describe('bookKey', () => {
  it('matches the same book from different providers', () => {
    // Google Books returns the full subtitle, Open Library usually does not.
    const google = bookKey(
      'Atomic Habits: An Easy & Proven Way to Build Good Habits',
      ['James Clear'],
    )
    const openLibrary = bookKey('Atomic Habits', ['James Clear'])
    const typedByHand = bookKey('  atomic habits ', ['james clear'])

    expect(google).toBe(openLibrary)
    expect(openLibrary).toBe(typedByHand)
  })

  it('ignores a leading article', () => {
    // The single most common difference between two catalogue entries for one book.
    expect(bookKey('The Sense of Style', ['Steven Pinker'])).toBe(
      bookKey('Sense of Style', ['Steven Pinker']),
    )
  })

  it('ignores diacritics', () => {
    // A Czech title typed without háčky should still find its properly spelled twin.
    expect(bookKey('Osudy dobrého vojáka Švejka', ['Jaroslav Hašek'])).toBe(
      bookKey('Osudy dobreho vojaka Svejka', ['Jaroslav Hasek']),
    )
  })

  it('handles an em dash subtitle the same as a colon', () => {
    expect(bookKey('Deep Work — Rules for Focused Success', ['Cal Newport'])).toBe(
      bookKey('Deep Work', ['Cal Newport']),
    )
  })

  it('keeps different books apart', () => {
    expect(bookKey('Deep Work', ['Cal Newport'])).not.toBe(
      bookKey('Digital Minimalism', ['Cal Newport']),
    )
  })

  it('keeps same-titled books by different authors apart', () => {
    // Plenty of books share a title. Merging them would put someone's review under a
    // book they never read.
    expect(bookKey('Persuasion', ['Jane Austen'])).not.toBe(
      bookKey('Persuasion', ['Robert Cialdini']),
    )
  })

  it('uses only the first author, so a differing co-author list still matches', () => {
    expect(bookKey('Freakonomics', ['Steven Levitt', 'Stephen Dubner'])).toBe(
      bookKey('Freakonomics', ['Steven Levitt']),
    )
  })

  it('copes with a book that has no author recorded', () => {
    expect(bookKey('Beowulf', [])).toBe('beowulf')
    expect(bookKey('Beowulf')).toBe('beowulf')
  })
})
