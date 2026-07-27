import { isNativeIos } from './native/plugins'
import { startNativeDictation } from './native/nativeSpeech'

/**
 * Voice dictation.
 *
 * Two engines behind one interface: SFSpeechRecognizer in the native iOS shell,
 * the Web Speech API everywhere else. Callers never choose — `startDictation`
 * routes, and `checkSpeechAvailability` reports what the current platform can do.
 *
 * The web path carries a caveat worth repeating:
 *
 * The important caveat, and the reason this file is mostly capability detection:
 * `webkitSpeechRecognition` exists on iOS Safari and works in a normal browser tab,
 * but fails once the app is launched from the Home Screen as a standalone PWA. The
 * constructor is present, so feature-detection alone reports a false positive —
 * recognition just never produces a result.
 *
 * Rather than ship a button that silently does nothing, we detect that specific
 * combination and tell the user to use the iOS keyboard's own microphone key instead.
 * That works everywhere, needs no permissions from us, and is how most people on iOS
 * dictate anyway.
 */

type SpeechRecognitionInstance = {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
}

interface SpeechRecognitionResultEvent {
  resultIndex: number
  results: {
    length: number
    [index: number]: {
      isFinal: boolean
      0: { transcript: string }
    }
  }
}

type SpeechRecognitionCtor = new () => SpeechRecognitionInstance

function getConstructor(): SpeechRecognitionCtor | undefined {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

export function isIos(): boolean {
  const ua = navigator.userAgent
  // iPadOS 13+ reports itself as a Mac, so the touch-point check catches modern iPads.
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
}

/** True when launched from the Home Screen rather than a browser tab. */
export function isStandalone(): boolean {
  const iosStandalone = (navigator as unknown as { standalone?: boolean }).standalone === true
  return iosStandalone || window.matchMedia('(display-mode: standalone)').matches
}

export type SpeechAvailability =
  | { available: true }
  | { available: false; reason: string; suggestKeyboardMic: boolean }

export function checkSpeechAvailability(): SpeechAvailability {
  // In the native iOS shell, SFSpeechRecognizer replaces the web API entirely and
  // has none of its limitations. Permissions are requested when dictation actually
  // starts rather than here, so this stays synchronous for the composer's useState.
  if (isNativeIos()) {
    return { available: true }
  }

  if (!getConstructor()) {
    return {
      available: false,
      reason: 'This browser has no built-in dictation.',
      suggestKeyboardMic: isIos(),
    }
  }

  if (isIos() && isStandalone()) {
    return {
      available: false,
      // The API is present here but non-functional, so this is worded as guidance
      // rather than "unsupported" — dictation is still very much possible.
      reason: 'In-app dictation does not work when BookNotes is opened from the Home Screen.',
      suggestKeyboardMic: true,
    }
  }

  return { available: true }
}

export interface DictationHandle {
  stop: () => void
}

export interface DictationCallbacks {
  /** Fires repeatedly with the best-guess text so far, including unfinished phrases. */
  onPartial: (text: string) => void
  /** Fires once when recognition ends, with the settled transcript. */
  onFinal: (text: string) => void
  onError: (message: string) => void
}

export function startDictation(
  callbacks: DictationCallbacks,
  lang = navigator.language || 'en-US',
): DictationHandle | undefined {
  if (isNativeIos()) {
    return startNativeDictation(callbacks, lang)
  }

  const { onPartial, onFinal, onError } = callbacks
  const Ctor = getConstructor()
  if (!Ctor) {
    onError('Dictation is not available in this browser.')
    return undefined
  }

  const recognition = new Ctor()
  recognition.lang = lang
  recognition.continuous = true
  recognition.interimResults = true

  // Only final segments are accumulated; interim text is re-rendered each event
  // rather than appended, otherwise partial phrases pile up as duplicates.
  let settled = ''

  recognition.onresult = (event) => {
    let interim = ''
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i]
      if (result.isFinal) settled += result[0].transcript
      else interim += result[0].transcript
    }
    onPartial((settled + interim).trim())
  }

  recognition.onerror = (event) => {
    if (event.error === 'no-speech') return // benign: user just paused
    if (event.error === 'not-allowed') {
      onError('Microphone access was blocked. Check the site permissions and try again.')
      return
    }
    onError(`Dictation stopped: ${event.error}`)
  }

  recognition.onend = () => {
    onFinal(settled.trim())
  }

  try {
    recognition.start()
  } catch {
    onError('Dictation could not start. It may already be running.')
    return undefined
  }

  return { stop: () => recognition.stop() }
}
