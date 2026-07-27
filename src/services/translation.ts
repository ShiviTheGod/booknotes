/**
 * Translation of extracted photo text.
 *
 * v1 ships a no-op provider, deliberately. Every usable translation service needs an
 * API key, and BookNotes is a static site with no backend — a key shipped in the bundle
 * is a key published to the world. Wiring one in properly means adding a small
 * serverless proxy that holds the secret, which is a v1.5 job.
 *
 * What v1 does do: detect the script of the extracted text and record it on the note,
 * so when a real provider is added it already knows what needs translating.
 *
 * To add one later, implement TranslationProvider and pass it to setTranslationProvider —
 * nothing else in the app needs to change.
 */

export interface TranslationProvider {
  readonly name: string
  translate(text: string, targetLang: string, sourceLang?: string): Promise<string>
}

const noopProvider: TranslationProvider = {
  name: 'none',
  // Returning the input unchanged keeps callers branch-free: they can always await
  // translate() and compare, rather than checking whether a provider exists.
  translate: async (text) => text,
}

let provider: TranslationProvider = noopProvider

export function setTranslationProvider(next: TranslationProvider): void {
  provider = next
}

export function hasTranslationProvider(): boolean {
  return provider !== noopProvider
}

export async function translate(
  text: string,
  targetLang: string,
  sourceLang?: string,
): Promise<string> {
  if (!text.trim()) return text
  if (sourceLang && sourceLang === targetLang) return text
  return provider.translate(text, targetLang, sourceLang)
}

/**
 * Best-effort language hint from the script the text is written in.
 *
 * This identifies the writing system, not the language — it cannot tell French from
 * Spanish, both of which come back as 'latn'. That is enough for v1's purpose: knowing
 * whether text is likely to need translating at all. A real provider does proper
 * detection server-side.
 */
export function detectLanguage(text: string): string {
  const sample = text.slice(0, 500)

  if (/[一-鿿]/.test(sample)) return 'zh'
  if (/[぀-ゟ゠-ヿ]/.test(sample)) return 'ja'
  if (/[가-힯]/.test(sample)) return 'ko'
  if (/[Ѐ-ӿ]/.test(sample)) return 'ru'
  if (/[؀-ۿ]/.test(sample)) return 'ar'
  if (/[֐-׿]/.test(sample)) return 'he'
  if (/[ऀ-ॿ]/.test(sample)) return 'hi'
  if (/[฀-๿]/.test(sample)) return 'th'
  if (/[Ͱ-Ͽ]/.test(sample)) return 'el'

  return 'latn'
}
