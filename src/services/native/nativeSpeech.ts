import type { PluginListenerHandle } from '@capacitor/core'
import { Speech } from './plugins'
import type { DictationCallbacks, DictationHandle } from '../speech'

/**
 * Dictation through SFSpeechRecognizer.
 *
 * Deliberately keeps the same synchronous `startDictation` shape as the web
 * implementation — returning a handle immediately and doing the async permission
 * and start work in the background — so the composer needs no knowledge of which
 * engine is running.
 */
export function startNativeDictation(
  { onPartial, onFinal, onError }: DictationCallbacks,
  lang: string,
): DictationHandle {
  const listeners: PluginListenerHandle[] = []
  let stopped = false
  /** Last text seen, so stopping mid-phrase still yields what was said. */
  let latest = ''

  async function cleanup() {
    for (const listener of listeners) {
      await listener.remove()
    }
    listeners.length = 0
  }

  async function begin() {
    try {
      const permissions = await Speech.requestPermissions()

      if (permissions.speech !== 'granted' || permissions.microphone !== 'granted') {
        onError(
          'Dictation needs microphone and speech recognition access. Enable them in Settings → ReadNote.',
        )
        return
      }

      // The user may have tapped stop while the permission prompt was up.
      if (stopped) return

      listeners.push(
        await Speech.addListener('partialResult', ({ text }) => {
          latest = text
          onPartial(text)
        }),
      )

      listeners.push(
        await Speech.addListener('finalResult', ({ text }) => {
          latest = text || latest
          void cleanup()
          onFinal(latest.trim())
        }),
      )

      listeners.push(
        await Speech.addListener('error', ({ message }) => {
          void cleanup()
          onError(message)
        }),
      )

      await Speech.start({ locale: lang })
    } catch (error) {
      await cleanup()
      onError(error instanceof Error ? error.message : 'Dictation could not start.')
    }
  }

  void begin()

  return {
    stop: () => {
      stopped = true
      // Resolve optimistically: the plugin ends the audio stream and the recognizer
      // emits one last final result, which is what actually settles the transcript.
      void Speech.stop().catch(() => {
        void cleanup()
        onFinal(latest.trim())
      })
    },
  }
}
