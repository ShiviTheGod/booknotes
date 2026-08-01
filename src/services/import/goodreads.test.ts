import { describe, expect, it } from 'vitest'
import { parseCsv, toRecords } from './csv'
import { NotAGoodreadsExport, parseGoodreadsCsv } from './goodreads'

describe('parseCsv', () => {
  it('keeps commas that live inside a quoted field', () => {
    expect(parseCsv('a,"b,c",d')).toEqual([['a', 'b,c', 'd']])
  })

  it('reads a doubled quote as one literal quote', () => {
    expect(parseCsv('"she said ""no"""')).toEqual([['she said "no"']])
  })

  it('keeps a line break inside a quoted field in the same row', () => {
    expect(parseCsv('title,"first line\nsecond line"\nnext,row')).toEqual([
      ['title', 'first line\nsecond line'],
      ['next', 'row'],
    ])
  })

  it('handles CRLF endings without leaving carriage returns in the values', () => {
    expect(parseCsv('a,b\r\nc,d\r\n')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ])
  })

  it('strips the byte-order mark so the first column name still matches', () => {
    expect(toRecords(parseCsv('﻿Title,Author\nDune,Herbert'))).toEqual([
      { Title: 'Dune', Author: 'Herbert' },
    ])
  })

  it('drops blank lines rather than producing empty books', () => {
    expect(toRecords(parseCsv('Title,Author\nDune,Herbert\n\n'))).toHaveLength(1)
  })
})

const HEADER =
  'Book Id,Title,Author,Additional Authors,ISBN,ISBN13,My Rating,Number of Pages,' +
  'Date Read,Date Added,Bookshelves,Exclusive Shelf,My Review'

function csv(...rows: string[]): string {
  return [HEADER, ...rows].join('\n')
}

describe('parseGoodreadsCsv', () => {
  it('refuses a CSV that is not this export', () => {
    expect(() => parseGoodreadsCsv('name,email\nAda,ada@example.com')).toThrow(NotAGoodreadsExport)
  })

  it('accepts an export with the right columns and no books in it', () => {
    const parsed = parseGoodreadsCsv(HEADER)
    expect(parsed.books).toEqual([])
  })

  it('maps a finished book, its dates, rating and review', () => {
    const parsed = parseGoodreadsCsv(
      csv(
        '3735293,Deep Work,Cal Newport,,="1455586692",="9781455586691",5,296,' +
          '2026/02/14,2026/01/08,"productivity, focus",read,"Best thing I read, easily."',
      ),
    )

    expect(parsed.books).toHaveLength(1)
    const [book] = parsed.books

    expect(book.title).toBe('Deep Work')
    expect(book.authors).toEqual(['Cal Newport'])
    expect(book.status).toBe('finished')
    expect(book.pageCount).toBe(296)
    expect(book.rating).toBe(5)
    expect(book.review).toBe('Best thing I read, easily.')
    expect(book.genres).toEqual(['productivity', 'focus'])
    expect(book.externalId).toBe('goodreads:3735293')

    // Unwrapped from the ="..." spreadsheet formula, and ISBN13 wins over ISBN.
    expect(book.isbn).toBe('9781455586691')

    // Anchored at local midday, so the calendar date survives the trip through UTC.
    expect(new Date(book.dateFinished!).getFullYear()).toBe(2026)
    expect(new Date(book.dateFinished!).getMonth()).toBe(1)
    expect(new Date(book.dateFinished!).getDate()).toBe(14)
  })

  it('leaves the to-read shelf out and counts it', () => {
    const parsed = parseGoodreadsCsv(
      csv(
        '1,Wanted,Someone,,,,0,300,,2026/01/01,,to-read,',
        '2,Reading,Someone,,,,0,300,,2026/01/01,,currently-reading,',
      ),
    )

    expect(parsed.skippedToRead).toBe(1)
    expect(parsed.books.map((book) => book.title)).toEqual(['Reading'])
    expect(parsed.books[0].status).toBe('reading')
  })

  it('treats an unrated book as unrated rather than as zero stars', () => {
    const parsed = parseGoodreadsCsv(csv('1,Dune,Frank Herbert,,,,0,412,2026/03/01,,,read,'))
    expect(parsed.books[0].rating).toBeUndefined()
  })

  it('carries additional authors through', () => {
    const parsed = parseGoodreadsCsv(
      csv('1,Good Omens,Terry Pratchett,"Neil Gaiman",,,4,400,2026/03/01,,,read,'),
    )
    expect(parsed.books[0].authors).toEqual(['Terry Pratchett', 'Neil Gaiman'])
  })

  it('falls back to the finish date when the shelf column is missing', () => {
    const parsed = parseGoodreadsCsv(csv('1,Dune,Frank Herbert,,,,4,412,2026/03/01,,,,'))
    expect(parsed.books[0].status).toBe('finished')
  })

  it('skips a row with no title instead of importing an untitled book', () => {
    const parsed = parseGoodreadsCsv(csv('1,,Nobody,,,,0,,,,,read,'))
    expect(parsed.books).toEqual([])
    expect(parsed.skippedUnusable).toBe(1)
  })

  it('keeps a review containing a line break intact', () => {
    const parsed = parseGoodreadsCsv(
      csv('1,Dune,Frank Herbert,,,,5,412,2026/03/01,,,read,"First line\nSecond line"'),
    )
    expect(parsed.books[0].review).toBe('First line\nSecond line')
  })
})
