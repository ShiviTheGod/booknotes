import { NativeTranslation, isNativeIos, type TranslationStatus } from './native/plugins'

/**
 * Translation of extracted photo text.
 *
 * Every cloud translation service needs an API key, and ReadNote is a static site with
 * no backend — a key shipped in the bundle is a key published to the world. That ruled
 * translation out entirely until the installed app existed.
 *
 * Apple's on-device framework has no such problem: no key, no account, no network, and
 * the text never leaves the phone, which is the same promise the rest of the app makes.
 * So translation is a native-only capability here. In a browser the provider stays a
 * no-op and extracted text is left in its original language, which is the honest
 * outcome — better than quietly shipping someone's notes to a third party.
 *
 * To add a cloud provider later, implement TranslationProvider and pass it to
 * setTranslationProvider — nothing else in the app needs to change.
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

/** Apple's Translation framework, reached through the native plugin. iOS 18+. */
const appleProvider: TranslationProvider = {
  name: 'apple-on-device',
  translate: async (text, targetLang, sourceLang) => {
    const { text: translated, sourceLanguage } = await NativeTranslation.translate({
      text,
      target: targetLang,
      source: sourceLang,
    })

    // A page already in the reader's language comes back "translated" into something
    // subtly reworded, which would be noise on the note. Only detection can catch
    // this: the caller's own guess identifies the writing system, and cannot tell a
    // Czech reader's English book from their Czech one.
    if (baseLanguage(sourceLanguage) === baseLanguage(targetLang)) return text

    return translated
  },
}

/** 'en-GB' and 'en' are the same language for this purpose. */
function baseLanguage(tag: string | undefined): string {
  return (tag ?? '').toLowerCase().split(/[-_]/)[0]
}

/**
 * Ask the device whether it can translate into `targetLang`, and install the provider
 * if so.
 *
 * Checked rather than assumed: the framework arrived in iOS 18, and support is per
 * language pair rather than global. Registering a provider that then throws on every
 * note would be worse than not having one — the pipeline would mark work as failed
 * instead of simply leaving text untranslated.
 */
export async function initTranslation(targetLang: string): Promise<TranslationStatus> {
  const status = await translationAvailability(targetLang)
  // 'supported' counts: the pack is not downloaded yet, but the system offers to
  // fetch it the first time a translation is actually requested.
  if (status === 'installed' || status === 'supported') setTranslationProvider(appleProvider)
  return status
}

/** Query only — does not install the provider. Used by Settings to report the truth. */
export async function translationAvailability(targetLang: string): Promise<TranslationStatus> {
  if (!isNativeIos()) return 'unavailable'

  try {
    const { status } = await NativeTranslation.availability({ target: targetLang })
    return status
  } catch (error) {
    console.error('Could not check translation availability:', error)
    return 'unavailable'
  }
}

/**
 * Languages this device can translate into.
 *
 * Read from the device rather than hardcoded. Apple's set changes between iOS
 * releases and does not cover every language — a baked-in list would eventually offer
 * someone a language that silently never works.
 */
export async function supportedTargetLanguages(): Promise<string[]> {
  if (!isNativeIos()) return []

  try {
    const { languages } = await NativeTranslation.supportedLanguages()
    return languages
  } catch (error) {
    console.error('Could not list translation languages:', error)
    return []
  }
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

  // Kana and Hangul are tested before the CJK ideographs, and the order is the whole
  // point: ordinary Japanese mixes kana with kanji, and ordinary Korean can carry
  // hanja, so an ideograph-first check calls both of them Chinese. Neither Chinese
  // nor Korean uses kana, so a kana hit is decisive where an ideograph hit is not.
  if (/[぀-ゟ゠-ヿ]/.test(sample)) return 'ja'
  if (/[가-힯]/.test(sample)) return 'ko'
  if (/[一-鿿]/.test(sample)) return 'zh'
  if (/[Ѐ-ӿ]/.test(sample)) return 'ru'
  if (/[؀-ۿ]/.test(sample)) return 'ar'
  if (/[֐-׿]/.test(sample)) return 'he'
  if (/[ऀ-ॿ]/.test(sample)) return 'hi'
  if (/[฀-๿]/.test(sample)) return 'th'
  if (/[Ͱ-Ͽ]/.test(sample)) return 'el'

  return 'latn'
}
