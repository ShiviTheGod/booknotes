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
- **OCR quality is flagged, not assumed.** Measured against real scans: cleanly printed text
  scores 96/100 and comes back verbatim; a 1948 document with decorative capitals and two
  columns scores 55 and arrives readable but with the columns interleaved; a 1609 quarto using
  the long-s scores 36 and is nonsense. Since OCR fails *silently* — an unreadable photo still
  yields confident-looking gibberish — anything under 70 is labelled "hard to read" rather than
  passed off as accurate. Expect roughly 13 seconds for a dense full page on a laptop, and
  longer on a phone, which is why extraction runs in a background queue.
- **The 5-note limit is a suggestion.** The counter turns amber past five rather than blocking
  a save — the goal is to nudge toward distilling, not to cut anyone off mid-thought.
- **Translation runs on the phone, or not at all.** Every cloud translator needs an API key,
  and a static site can't hold one without publishing it. The installed iOS app uses Apple's
  on-device framework — no key, no account, no network, and the text never leaves the device.
  On the web the provider stays a no-op and extracted text is left in its original language,
  which beats quietly posting someone's reading notes to a third party. `TranslationProvider`
  is still the seam if you ever want a cloud one.
- **The source language is asked for, not guessed.** `detectLanguage()` identifies a writing
  system, not a language — it can't tell a Czech reader's English book from their Czech one.
  The translator reports what it actually detected, and a page already in your language is
  left alone rather than stored as a reworded "translation" of itself.

## Sync between devices (optional)

Off by default. The app is local-first and stays that way unless you connect it to a
Supabase project of your own — there is no shared backend and no credentials in this repo.

1. Make a free project at [supabase.com](https://supabase.com)
2. SQL Editor → paste [supabase/schema.sql](supabase/schema.sql) → Run
3. In the app: **Settings → Sync between devices** → paste the project URL and the *anon*
   key → create an account → **Sync now**
4. Repeat step 3 on the second device with the same account

The anon key belongs in the client; it is the schema's Row Level Security that makes it
safe, restricting every query to the rows of whoever is signed in.

Three deliberate limits:

- **Manual.** Nothing moves until you press Sync. This is the only code in the app that can
  remove notes from two devices at once, so it never runs unattended.
- **Text only.** Books, chapters, notes, extracted text and translations travel; photos stay
  on the device that took them. They are the bulk of the data and they are pictures of what
  you were reading. A note synced to your other device shows its text, not its photo.
- **Last write wins.** With a wrinkle that matters: deletion counts as a write, so a note
  edited on one device *after* being deleted on the other survives. Always letting deletion
  win throws away text typed after it; always letting the edit win resurrects deleted notes.
  The decision is a [pure function with its own tests](src/services/sync/merge.ts).

Deleting anything writes a tombstone, whether or not sync is set up. Without one, the other
device sees a row you no longer have, assumes you are behind, and pushes it back — the note
becomes undeletable.

## Not in v1

Community and social features, sharing or selling summaries, and AI summarization (the seam
is there, unused).

## Roadmap

- "AI condense" on the summary view
- Syncing photos, for anyone willing to spend the storage on it
