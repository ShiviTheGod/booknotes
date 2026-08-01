import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'

/**
 * Typed handles for the two custom plugins defined in ios/App/App/plugins/.
 *
 * `registerPlugin` is safe to call on the web: it returns a proxy that only throws
 * if a method is actually invoked, and `isNativeIos()` gates every call site. So the
 * web build keeps working untouched and pays only for a few kB of Capacitor core.
 */

export type PermissionState = 'granted' | 'denied' | 'prompt'

export interface SpeechPluginApi {
  checkPermissions(): Promise<{ speech: PermissionState; microphone: PermissionState }>
  requestPermissions(): Promise<{ speech: PermissionState; microphone: PermissionState }>
  available(options?: { locale?: string }): Promise<{ available: boolean; onDevice: boolean }>
  start(options?: { locale?: string }): Promise<{ listening: boolean }>
  stop(): Promise<{ listening: boolean }>
  addListener(
    eventName: 'partialResult' | 'finalResult',
    handler: (data: { text: string }) => void,
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'error',
    handler: (data: { message: string }) => void,
  ): Promise<PluginListenerHandle>
}

export interface VisionOcrPluginApi {
  recognizeText(options: {
    imageBase64: string
    languages?: string[]
  }): Promise<{ text: string; lineCount: number; confidence: number }>
  supportedLanguages(): Promise<{ languages: string[] }>
}

/**
 * `unavailable` means the OS is too old for the framework at all (pre-iOS 18);
 * `unsupported` means it is there but does not handle this language pair.
 * `supported` means it would work after downloading a language pack, which the
 * system offers the first time a pair is used.
 */
export type TranslationStatus = 'installed' | 'supported' | 'unsupported' | 'unavailable'

export interface TranslationPluginApi {
  availability(options: { target: string; source?: string }): Promise<{
    status: TranslationStatus
  }>
  supportedLanguages(): Promise<{ languages: string[] }>
  translate(options: { text: string; target: string; source?: string }): Promise<{
    text: string
    /** What the framework detected the original to be, e.g. 'en'. */
    sourceLanguage: string
  }>
}

export const Speech = registerPlugin<SpeechPluginApi>('Speech')
export const VisionOcr = registerPlugin<VisionOcrPluginApi>('VisionOcr')
export const NativeTranslation = registerPlugin<TranslationPluginApi>('Translation')

/** True only inside the Capacitor iOS shell — false in any browser, including iOS Safari. */
export function isNativeIos(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios'
}

/** Base64 (no data: prefix) for handing a Blob across the bridge. */
export async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)

  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}
