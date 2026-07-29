# Getting BookNotes onto your iPhone as a real app

**No Mac needed.** GitHub builds the app on a cloud Mac; you sign and install it from
Windows with your existing Apple ID.

The native shell is a Capacitor 7 wrapper around the same React app, with two custom
plugins replacing the web's weakest points:

| Plugin | Framework | Replaces |
|---|---|---|
| `Speech` | `SFSpeechRecognizer` | Web Speech API, which is broken in a standalone PWA |
| `VisionOcr` | `VNRecognizeTextRequest` | Tesseract.js — no download, on-device, much faster |

Both sit behind the existing `speech.ts` and `ocr.ts` interfaces, so the web build is
untouched and still works exactly as before.

---

## Is this worth it over the PWA?

Honestly, it depends on how much you dictate.

| | PWA (already live) | Sideloaded native app |
|---|---|---|
| Install | Add to Home Screen, 10 seconds | Build, download, sign, install |
| **Expiry** | **Never** | **Every 7 days** on a free Apple ID |
| Dictation | Keyboard mic only | Real in-app dictation, on-device |
| OCR | Tesseract.js, slow, ~2 MB download | Vision, fast, no download |
| Cost | Free | Free, or $99/yr to remove the 7-day expiry |

The 7-day expiry is the real cost, and it's Apple's rule for free accounts, not something
this project can work around. AltStore can refresh apps automatically over Wi-Fi, which
makes it mostly invisible. If you mainly type your notes, the PWA is genuinely the better
deal.

---

## Step 1 — Get the .ipa

GitHub builds it on every push to `main`. To download one:

1. Go to the [Actions tab](https://github.com/ShiviTheGod/booknotes/actions/workflows/ios.yml)
2. Open the most recent successful **Build iOS app** run
3. Download the **BookNotes-unsigned-ipa** artifact
4. Unzip it — inside is `BookNotes-unsigned.ipa`

To trigger a build without pushing anything, use **Run workflow** on that page.

macOS runners are free and unmetered on public repositories, so this costs nothing.

---

## Step 2 — Sign and install it

The `.ipa` is unsigned, so iOS won't accept it as-is. These tools sign it with your own
Apple ID on your own machine — the same free provisioning Xcode would use.

### Sideloadly — simplest

Runs on Windows, installs over USB.

1. Install [Sideloadly](https://sideloadly.io/) and iTunes (it needs Apple's drivers)
2. Connect your iPhone, trust the computer
3. Drag `BookNotes-unsigned.ipa` into Sideloadly
4. Enter your Apple ID, click Start

### AltStore — best if you don't want to re-plug in every week

Install AltServer on Windows, pair once over USB, and after that AltStore refreshes the
app over Wi-Fi automatically before it expires. More setup up front, far less friction
afterwards. ([comparison of the options](https://ios18apps.com/altstore-vs-sideloadly-vs-sidestore/))

### After installing, either way

The phone will refuse to launch it until you trust the certificate:

**Settings → General → VPN & Device Management → your Apple ID → Trust**

### Free Apple ID limits

- Apps expire after **7 days** and must be re-signed
- **3 sideloaded apps** at a time
- ~10 new app IDs per week

Using an app-specific password rather than your main Apple ID password is worth doing if
you have two-factor authentication on.

---

## Step 3 — Grant permissions

On first use, iOS asks separately for:

- **Microphone** and **Speech Recognition** — both are required for dictation; granting
  one without the other leaves it silently non-functional
- **Camera** — for photographing pages

If you tap Don't Allow, re-enable under **Settings → BookNotes**.

---

## Building it locally instead (needs a real Mac)

```bash
npm ci && npm run ios:open
```

Requires Xcode 16+ and CocoaPods. Capacitor 7 needs Xcode 16, which needs macOS Sonoma
14.5 or newer — this is why the cloud build exists.

No manual Xcode steps are needed: the plugins live in `packages/booknotes-native` as a
proper Capacitor plugin package, so `cap sync` adds them to the Podfile and CocoaPods
compiles them. Dropping loose Swift files into the app target would have required adding
them by hand in Xcode, and forgetting produces a runtime "plugin not implemented" error
with nothing to explain it.

---

## Troubleshooting

**"Unable to install" / "This app cannot be installed"** — usually the 3-app limit, or a
bundle ID clash. Change `appId` in [capacitor.config.ts](capacitor.config.ts) and rebuild.

**App launches then closes immediately** — the certificate isn't trusted yet, or the
7 days are up. Re-sign it.

**Dictation does nothing** — check both Microphone *and* Speech Recognition in
Settings → BookNotes.

**OCR returns nothing** — the plugin passes EXIF orientation through to Vision, so
rotation should be handled. Try a well-lit photo of printed text to confirm.

**The CI build fails** — open the run log. `pod install` failures are usually transient
and clear on a re-run; the workflow already passes `--repo-update`.

---

## What is still not native

Translation. Now that CI builds with a current Xcode the iOS 18 SDK is available, so
Apple's on-device Translation framework has become reachable — it just isn't wired up yet.
`TranslationProvider` in [src/services/translation.ts](src/services/translation.ts) is
still a no-op, and OCR text is tagged with a detected script instead.
