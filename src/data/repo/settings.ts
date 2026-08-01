import { db } from '../db'

/** Small key/value bag for user preferences. Kept in IndexedDB so it exports with everything else. */

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key)
  return row === undefined ? fallback : (row.value as T)
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await db.settings.put({ key, value })
}

export const SETTING_KEYS = {
  /** Target language for OCR translation. Defaults to the browser's language. */
  userLanguage: 'userLanguage',
  /** Last shelf view the user chose: 'genre' | 'timeline'. */
  shelfView: 'shelfView',
  /** Books to finish this calendar year. 0 or absent means no goal is set. */
  readingGoal: 'readingGoal',
} as const

export function defaultUserLanguage(): string {
  return (navigator.language || 'en').split('-')[0]
}
