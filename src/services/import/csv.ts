/**
 * A CSV reader, written out rather than pulled in.
 *
 * The naive `split(',')` version works right up until someone's review contains a
 * comma, and the export this is aimed at is full of prose — reviews with commas,
 * quotation marks, and line breaks inside a single field. Getting that wrong does
 * not fail loudly; it shifts every column one to the left and imports rubbish.
 *
 * Follows RFC 4180: fields may be quoted, a doubled quote inside a quoted field is
 * a literal quote, and a newline inside quotes belongs to the field rather than
 * ending the row.
 *
 * A quote only opens a quoted field at the very start of that field. This is not
 * pedantry — Goodreads writes ISBNs as `="9781455586691"`, an Excel formula that
 * stops a spreadsheet reformatting a long number into scientific notation. Treating
 * that inner quote as the start of a quoted run swallows the wrapper and yields
 * `=9781455586691`, an ISBN that matches no cover anywhere.
 */
export function parseCsv(text: string): string[][] {
  // Excel writes a byte-order mark, which would otherwise become part of the first
  // column's name and stop every lookup by header from matching.
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text

  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  let atFieldStart = true
  let index = 0

  while (index < input.length) {
    const char = input[index]

    if (quoted) {
      if (char === '"') {
        if (input[index + 1] === '"') {
          field += '"'
          index += 2
          continue
        }
        quoted = false
        index += 1
        continue
      }
      field += char
      index += 1
      continue
    }

    if (char === '"' && atFieldStart) {
      quoted = true
      atFieldStart = false
      index += 1
      continue
    }

    if (char === ',') {
      row.push(field)
      field = ''
      atFieldStart = true
      index += 1
      continue
    }

    // Bare carriage returns only ever appear as part of CRLF out here; inside quotes
    // they are kept, which is why this branch sits below the quoted handling.
    if (char === '\r') {
      index += 1
      continue
    }

    if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      atFieldStart = true
      index += 1
      continue
    }

    field += char
    atFieldStart = false
    index += 1
  }

  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  return rows
}

/**
 * Rows keyed by column name, with blank lines dropped.
 *
 * By name and not by position: exports gain and lose columns between versions, and
 * a file that has been opened and re-saved in a spreadsheet often comes back with
 * them reordered.
 */
export function toRecords(rows: string[][]): Array<Record<string, string>> {
  const [header, ...body] = rows
  if (!header) return []

  const keys = header.map((name) => name.trim())

  return body
    .filter((row) => row.some((value) => value.trim() !== ''))
    .map((row) => {
      const record: Record<string, string> = {}
      keys.forEach((key, column) => {
        record[key] = (row[column] ?? '').trim()
      })
      return record
    })
}
