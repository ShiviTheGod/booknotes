import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The decisions worth pinning down here are all about *not* translating.
 *
 * Every guard exists because the failure it prevents is quiet rather than loud: a
 * missing provider that throws instead of passing text through, or a page already in
 * the reader's language coming back subtly reworded and stored as a "translation"
 * under every note. None of that shows up as an error — it shows up as noise in
 * someone's reading notes, which is exactly the kind of thing a test should hold.
 */

// A fresh module per test: the provider is module-level singleton state, so without
// this the first test to install one would leak into every test after it.
async function loadTranslation() {
  vi.resetModules()
  return import('./translation')
}

describe('detectLanguage', () => {
  it('identifies scripts it has rules for', async () => {
    const { detectLanguage } = await loadTranslation()

    expect(detectLanguage('Это по-русски')).toBe('ru')
    expect(detectLanguage('هذا عربي')).toBe('ar')
    expect(detectLanguage('Αυτά είναι ελληνικά')).toBe('el')
    expect(detectLanguage('中文書寫系統')).toBe('zh')
  })

  it('does not mistake kanji-bearing Japanese for Chinese', async () => {
    const { detectLanguage } = await loadTranslation()

    // Real Japanese is kana mixed with kanji, and the kanji fall in the same block as
    // Chinese. Checking ideographs first labelled almost every Japanese page 'zh',
    // which would then be handed to the translator as the wrong source language.
    expect(detectLanguage('これは日本語です')).toBe('ja')
    expect(detectLanguage('吾輩は猫である')).toBe('ja')
    expect(detectLanguage('한국어 문장입니다')).toBe('ko')
  })

  it('reports Latin script rather than guessing a language', async () => {
    const { detectLanguage } = await loadTranslation()

    // The point of the 'latn' answer: it cannot tell these apart, and pretending
    // otherwise would send the wrong source language to the translator.
    expect(detectLanguage('This is English.')).toBe('latn')
    expect(detectLanguage('Toto je čeština.')).toBe('latn')
    expect(detectLanguage("C'est du français.")).toBe('latn')
  })
})

describe('translate', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('passes text through untouched when no provider is installed', async () => {
    const { translate, hasTranslationProvider } = await loadTranslation()

    expect(hasTranslationProvider()).toBe(false)
    // Not a throw. A browser build has no translator, and notes must still work.
    await expect(translate('Keep me as I am.', 'cs')).resolves.toBe('Keep me as I am.')
  })

  it('does not call the provider when the source already matches the target', async () => {
    const { translate, setTranslationProvider } = await loadTranslation()
    const spy = vi.fn(async () => 'should never be used')

    setTranslationProvider({ name: 'test', translate: spy })
    await expect(translate('Už je to česky.', 'cs', 'cs')).resolves.toBe('Už je to česky.')
    expect(spy).not.toHaveBeenCalled()
  })

  it('does not call the provider for empty or whitespace text', async () => {
    const { translate, setTranslationProvider } = await loadTranslation()
    const spy = vi.fn(async () => 'should never be used')

    setTranslationProvider({ name: 'test', translate: spy })

    await expect(translate('', 'cs')).resolves.toBe('')
    await expect(translate('   \n  ', 'cs')).resolves.toBe('   \n  ')
    expect(spy).not.toHaveBeenCalled()
  })

  it('hands the target and source through to the provider', async () => {
    const { translate, setTranslationProvider, hasTranslationProvider } = await loadTranslation()
    const spy = vi.fn(async () => 'Kniha byla lepší, než jsem čekal.')

    setTranslationProvider({ name: 'test', translate: spy })

    expect(hasTranslationProvider()).toBe(true)
    await expect(translate('The book was better than I expected.', 'cs', 'en')).resolves.toBe(
      'Kniha byla lepší, než jsem čekal.',
    )
    expect(spy).toHaveBeenCalledWith('The book was better than I expected.', 'cs', 'en')
  })
})

describe('availability off-device', () => {
  it('reports unavailable in a browser rather than pretending', async () => {
    const { translationAvailability, supportedTargetLanguages, initTranslation } =
      await loadTranslation()

    // isNativeIos() is false under the test runner, which is the browser case.
    await expect(translationAvailability('cs')).resolves.toBe('unavailable')
    await expect(supportedTargetLanguages()).resolves.toEqual([])

    // And crucially, initTranslation must not install a provider it cannot back —
    // one that throws on every note would mark real work as failed.
    await expect(initTranslation('cs')).resolves.toBe('unavailable')
    const { hasTranslationProvider } = await import('./translation')
    expect(hasTranslationProvider()).toBe(false)
  })
})
