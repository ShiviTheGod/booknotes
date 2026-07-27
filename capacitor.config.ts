import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Capacitor 5 — pinned deliberately.
 *
 * Capacitor 6 needs Xcode 15 and Capacitor 7 needs Xcode 16, but macOS Monterey
 * tops out at Xcode 14.2. Capacitor 5 is the last line that builds there. If the
 * Mac ever moves to Ventura or later, upgrading is worthwhile — but nothing this
 * app needs is missing here: SFSpeechRecognizer (iOS 10+) and Vision text
 * recognition (iOS 13+) both long predate it.
 */
const config: CapacitorConfig = {
  // Must be globally unique for free-Apple-ID provisioning. Change it if you
  // ever hit a conflict when signing.
  appId: 'io.github.shivithegod.booknotes',
  appName: 'BookNotes',
  webDir: 'dist',
  ios: {
    // Keeps content clear of the notch and home indicator. The CSS already pads
    // with env(safe-area-inset-*), so this only governs the WebView's own inset.
    contentInset: 'always',
    // The warm paper colour, so overscroll doesn't flash white.
    backgroundColor: '#f5efe3',
  },
}

export default config
