import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Capacitor 7, built by the macOS runner in .github/workflows/ios.yml.
 *
 * The version is dictated by Xcode: Capacitor 7 needs Xcode 16, which the CI
 * runner has. Nothing this app depends on is version-sensitive — SFSpeechRecognizer
 * (iOS 10+) and Vision text recognition (iOS 13+) both long predate it.
 */
const config: CapacitorConfig = {
  // Must be globally unique for free-Apple-ID provisioning. Change it if you
  // ever hit a conflict when signing.
  appId: 'io.github.shivithegod.booknotes',
  appName: 'ReadNote',
  webDir: 'dist',
  ios: {
    // The page handles the notch and home indicator itself, with viewport-fit=cover
    // and env(safe-area-inset-*) padding. 'never' hands it the full screen to do
    // that in. Letting iOS inset the content as well would leave a gap at the top
    // that the page does not paint — the WebView's own colour would show through it.
    contentInset: 'never',
    // Visible for an instant at launch, before the page paints. It is a fixed hex
    // and so cannot follow the system theme, which is exactly why nothing is
    // allowed to depend on it: the document does not scroll, so no amount of
    // dragging can expose this colour once the app is up.
    backgroundColor: '#f5efe3',
  },
}

export default config
