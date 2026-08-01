import { Capacitor } from '@capacitor/core'

/**
 * Is the on-screen keyboard currently covering part of the app?
 *
 * Two code paths, because the two platforms put the answer in different places:
 *
 * - **Installed app.** Capacitor resizes the WebView itself when the keyboard
 *   opens, so nothing inside the page changes size relative to anything else and
 *   there is no measurement to take. The native events are the only signal.
 * - **Browser.** The WebView is not resized. The visual viewport shrinks while the
 *   layout viewport stays put, so the difference between the two is the keyboard.
 *
 * Deliberately not driven by focus events. Those fire for hardware keyboards and
 * on desktop, where hiding the tab bar just because someone clicked a text field
 * would be wrong. Both signals used here mean "screen space was actually taken".
 */
export function watchKeyboard(onChange: (open: boolean) => void): () => void {
  return Capacitor.isNativePlatform()
    ? watchNativeKeyboard(onChange)
    : watchVisualViewport(onChange)
}

function watchNativeKeyboard(onChange: (open: boolean) => void): () => void {
  let cancelled = false
  let remove: (() => void) | undefined

  // Dynamic import so the browser build never pulls the plugin in.
  void (async () => {
    const { Keyboard } = await import('@capacitor/keyboard')
    const handles = await Promise.all([
      // The *Will* variants fire as the keyboard starts animating, so the tab bar
      // slides away with it rather than a beat behind.
      Keyboard.addListener('keyboardWillShow', () => onChange(true)),
      Keyboard.addListener('keyboardWillHide', () => onChange(false)),
    ])

    const removeAll = () => handles.forEach((handle) => void handle.remove())
    if (cancelled) removeAll()
    else remove = removeAll
  })()

  return () => {
    cancelled = true
    remove?.()
  }
}

/**
 * Below this the shortfall is something other than a keyboard — a floating iPad
 * keyboard, a pinch-zoom, or a browser toolbar sliding in — none of which are
 * worth rearranging the layout for.
 */
const KEYBOARD_MIN_HEIGHT = 150

function watchVisualViewport(onChange: (open: boolean) => void): () => void {
  const viewport = window.visualViewport
  if (!viewport) return () => {}

  const read = () => onChange(window.innerHeight - viewport.height > KEYBOARD_MIN_HEIGHT)

  viewport.addEventListener('resize', read)
  read()

  return () => viewport.removeEventListener('resize', read)
}
