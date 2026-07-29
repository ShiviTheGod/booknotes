import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { db } from './db'

/**
 * Guards against the bug class that killed OCR for days.
 *
 * `notes.where('ocrStatus')` was querying a key path that wasn't in the schema.
 * IndexedDB rejects that at runtime, so listPendingOcr() threw, processOcrQueue()
 * died before doing any work, and every photo note sat on "Reading the text in this
 * photo…" forever. Nothing surfaced an error, and the type checker cannot catch it —
 * `where()` takes a string.
 *
 * So this scans the source for every `db.<table>.where('<field>')` and asserts the
 * field is actually indexed. A new query against an unindexed field now fails CI
 * instead of silently disabling a feature.
 */

const SRC = join(import.meta.dirname, '..')

function sourceFiles(): string[] {
  return readdirSync(SRC, { recursive: true, encoding: 'utf8' })
    .filter((entry) => /\.tsx?$/.test(entry) && !entry.endsWith('.test.ts'))
    .map((entry) => join(SRC, entry))
}

interface Query {
  file: string
  table: string
  field: string
}

function findWhereQueries(): Query[] {
  // Matches db.notes.where('ocrStatus') and the compound form
  // db.chapters.where('[bookId+number]'), across line breaks.
  const pattern = /\bdb\.(\w+)\s*\.\s*where\(\s*'([^']+)'/g
  const queries: Query[] = []

  for (const file of sourceFiles()) {
    const contents = readFileSync(file, 'utf8')
    for (const match of contents.matchAll(pattern)) {
      queries.push({ file, table: match[1], field: match[2] })
    }
  }

  return queries
}

/** Every queryable key path for a table: primary key plus declared indexes. */
function indexedFields(tableName: string): string[] {
  const table = db.tables.find((candidate) => candidate.name === tableName)
  if (!table) return []

  return [table.schema.primKey.name, ...table.schema.indexes.map((index) => index.name)]
}

describe('Dexie schema', () => {
  it('finds the where() queries it is meant to be checking', () => {
    // A guard on the guard: if the regex silently stops matching, this test file
    // would pass while checking nothing at all.
    const queries = findWhereQueries()
    expect(queries.length).toBeGreaterThan(5)
  })

  it('indexes every field queried with where()', () => {
    const failures = findWhereQueries()
      .filter((query) => !indexedFields(query.table).includes(query.field))
      .map(
        (query) =>
          `${query.file.replace(SRC, 'src')}: db.${query.table}.where('${query.field}') ` +
          `— not indexed. Add it to the ${query.table} store in db.ts and bump the schema version.`,
      )

    expect(failures).toEqual([])
  })

  it('indexes ocrStatus, so the OCR queue can find pending notes', () => {
    // The specific regression. Named explicitly so a failure points straight at it.
    expect(indexedFields('notes')).toContain('ocrStatus')
  })

  it('keeps the compound indexes the summary and chapter views rely on', () => {
    expect(indexedFields('notes')).toContain('[bookId+createdAt]')
    expect(indexedFields('notes')).toContain('[chapterId+createdAt]')
    expect(indexedFields('chapters')).toContain('[bookId+number]')
  })

  it('indexes genres as multi-entry, so the genre shelf can look books up', () => {
    const genres = db.tables
      .find((table) => table.name === 'books')
      ?.schema.indexes.find((index) => index.name === 'genres')

    expect(genres?.multi).toBe(true)
  })
})
