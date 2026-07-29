# BookNotes

A personal reading journal. Add a book, capture up to a handful of key ideas per chapter —
typed, dictated, or photographed — and keep them on a shelf you can actually browse.

It stores notes about books, never the books themselves. Tapping a cover opens what *you*
wrote, not the text you read.

Mobile-first, works offline, and installs to an iPhone or iPad home screen.

## What it does

- **Library** — search Google Books or Open Library by title/author, auto-filling cover,
  page count, author, and genre. Manual entry for anything the APIs don't know.
- **Chapter notes** — up to ~5 key ideas per chapter, captured three ways:
  - typed
  - dictated via the Web Speech API (see the iOS caveat below)
  - photographed, with the image stored untouched and text extracted in the background
- **Summary** — finishing a book gathers every chapter note into one read-through.
- **Shelf** — a grid of covers, arranged by genre or by the month you finished them.
  Finished books get a thin brass hairline and a small seal.
- **Stats** — books finished per month, note streaks, and a pages-read estimate.

## Running it

```bash
npm install
npm run dev
```

Other scripts:

```bash
npm run build
```

```bash
node scripts/generate-icons.mjs
```

## Getting it on a phone

Camera and microphone need a **secure context**, so a plain `http://192.168.x.x` dev server
can't use them. Push to `main` and the GitHub Actions workflow deploys to Pages over HTTPS;
open that URL on the device.

To install: **Share → Add to Home Screen**.

## As a real iOS app

There's also a native build — a Capacitor 7 shell with `SFSpeechRecognizer` for real
in-app dictation and Vision for on-device OCR, which removes both limitations described
below. **No Mac is required**: GitHub Actions builds the `.ipa` on a free cloud macOS
runner, and you sign it from Windows with your own Apple ID.

See [IOS-BUILD.md](IOS-BUILD.md) — including an honest comparison of whether it's worth it
over the PWA, given free-account apps expire every 7 days.

## Two things worth knowing

**Dictation and the Home Screen don't mix on iOS.** `webkitSpeechRecognition` works in a
Safari tab but silently fails once the app is launched standalone from the Home Screen — the
constructor exists, so feature detection alone reports a false positive. The app detects this
specific case and points you at your keyboard's own microphone key instead, which works
everywhere. If you want the in-app dictation button, open the app in a Safari tab.

**Install it anyway, and export sometimes.** Safari clears stored data for sites left unused
for about a week. Adding the app to the Home Screen exempts it. Either way, Settings → Export
backup writes everything — books, notes, and photos — to a single JSON file. That file is the
only copy that exists off the device.

## How it's built

React 19 + TypeScript + Vite, with Dexie over IndexedDB. There is no backend and no account:
everything lives on the device, and nothing is uploaded.

```
src/data/         Dexie schema and the repository layer all reads/writes go through
src/services/     book search, OCR, speech, translation, backup
src/features/     shelf, book, notes, search, stats, settings
src/styles/       design tokens
scripts/          icon generation
```

Data access is deliberately confined to `src/data/repo/*` so a sync backend can be added
later without the UI knowing.

### Notes on the design

- **Book search falls back.** Google Books is tried first for its better metadata, but its
  keyless endpoint is rate-limited per IP and returns 429 under load — that happened
  repeatedly during development. Open Library has no key and no quota, so it takes over
  whenever Google declines. Google's cover URLs also arrive as `http://` and are rewritten to
  `https://`, otherwise every cover would be blocked as mixed content once deployed.
- **Photos are never modified.** The captured file is stored byte-for-byte. OCR output lives
  on the note as separate, searchable metadata.
- **Tesseract is lazy-loaded.** It's several megabytes, so it's dynamically imported and only
  fetched the first time you take a photo. Typing notes never pays for it.
- **The 5-note limit is a suggestion.** The counter turns amber past five rather than blocking
  a save — the goal is to nudge toward distilling, not to cut anyone off mid-thought.
- **Translation is an interface, not an implementation.** A static site can't hold an API key
  safely, so v1 detects and records the script of extracted text and stops there. Implement
  `TranslationProvider` and a small serverless proxy to turn it on.

## Not in v1

Community and social features, accounts, sharing or selling summaries, AI summarization (the
seam is there, unused), and real machine translation.

## Roadmap

- Optional Supabase sync so an iPhone and an iPad share one library
- "AI condense" on the summary view
- Translation via a serverless proxy
