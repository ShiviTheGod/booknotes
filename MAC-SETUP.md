# Building the iOS app

The native shell is a Capacitor 5 wrapper around the same React app. Two custom plugins
replace the web's weakest points with native APIs:

| Plugin | Framework | Replaces |
|---|---|---|
| `Speech` | `SFSpeechRecognizer` | Web Speech API, which is broken in a standalone PWA |
| `VisionOcr` | `VNRecognizeTextRequest` | Tesseract.js — no download, on-device, much faster |

Both sit behind the existing `speech.ts` and `ocr.ts` interfaces, so the web build is
untouched and still works exactly as before.

---

## Read this first: the iOS version ceiling

**macOS Monterey caps out at Xcode 14.2, and Xcode 14.2 cannot deploy to a device
running iOS 17 or newer.** Xcode needs matching "device support files" for whatever iOS
the phone is running, and it only ships the ones that existed at its release — iOS 16.2,
in this case.

There's a community workaround — dropping newer support files into
`/Applications/Xcode.app/Contents/Developer/Platforms/iPhoneOS.platform/DeviceSupport/`
from [iOSDeviceSupport](https://github.com/filsv/iOSDeviceSupport) — but it stretches
maybe one or two iOS versions, not ten. ([background](https://cocoacasts.com/xcode-fundamentals-could-not-locate-device-support-files))

So, honestly:

- **iPhone on iOS 16 or older** → Xcode 14.2 works, follow this guide.
- **iPhone on iOS 17+** → local builds on Monterey will not deploy to it. Options, best first:
  1. Move the VM to Sonoma or newer (VMware or Parallels handle modern macOS guests far
     better than VirtualBox, and bring GPU acceleration so the Simulator works too)
  2. Build on GitHub Actions macOS runners, which have current Xcode — free for this
     public repo. Verifies compilation; installing on a device still needs signing certs.
  3. Keep using the PWA at https://shivithegod.github.io/booknotes/, which works today

None of this wastes the work here — the Capacitor project and plugins are ready for
whenever the toolchain is.

Also note: the **iOS Simulator needs Metal**, which VirtualBox does not provide for macOS
guests. Expect it to be unusably slow or to refuse to launch.

---

## Prerequisites

```bash
xcode-select --install
```

```bash
sudo gem install cocoapods
```

Node 20+ for the Capacitor 5 CLI. Confirm your versions before starting:

```bash
sw_vers && xcodebuild -version && pod --version && node --version
```

---

## First build

Clone and install:

```bash
git clone https://github.com/ShiviTheGod/booknotes.git && cd booknotes && npm install
```

Build the web assets for the native target and sync them into the iOS project:

```bash
npm run ios
```

That runs `build:native` (which sets `BUILD_TARGET=native`, giving relative asset paths
and skipping the service worker), then `cap sync ios`, then opens Xcode.

`BUILD_TARGET` matters: the default build hard-codes `/booknotes/` for GitHub Pages, and
those absolute paths resolve to nothing under `capacitor://localhost`.

---

## Add the plugin files to the Xcode target

**This is the step that silently goes wrong.** The Swift plugins live in
`ios/App/App/plugins/`, but Capacitor generated `App.xcodeproj` before they existed, so
they are not in the build target. Without this, the app compiles and runs, then dictation
and OCR fail at runtime with "plugin not implemented" — and nothing explains why.

In Xcode:

1. Right-click the **App** group in the navigator → **Add Files to "App"…**
2. Select `ios/App/App/plugins`
3. Tick **Create groups**, and make sure **App** is checked under *Add to targets*
4. Confirm all four files appear: `SpeechPlugin.swift`, `SpeechPlugin.m`,
   `VisionOcrPlugin.swift`, `VisionOcrPlugin.m`

When Xcode offers to create a bridging header, **accept it**. The `.m` files use
Capacitor's `CAP_PLUGIN` macro to register the Swift classes with the bridge, and they
need the Objective-C/Swift interop that the header sets up.

Verify: build, then check the Xcode console at launch for lines listing the loaded
plugins. `Speech` and `VisionOcr` should both appear.

---

## Signing with a free Apple ID

You do not need the $99 Developer Program for personal use.

1. Xcode → Settings → Accounts → **+** → Apple ID, and sign in with the account already
   on your iPhone
2. Select the **App** target → **Signing & Capabilities**
3. Tick **Automatically manage signing** and pick your personal team
4. If the bundle ID is rejected as taken, change `appId` in
   [capacitor.config.ts](capacitor.config.ts) to something unique and re-run `npm run ios`

The catch: free provisioning profiles **expire after 7 days**. The app stops launching and
you rebuild from Xcode to renew it. Fine for personal use, annoying if you forget.

On first launch the phone will refuse to open the app until you trust the certificate:
**Settings → General → VPN & Device Management → your Apple ID → Trust**.

---

## Getting the iPhone into the VM

VirtualBox needs to hand the USB device through to the guest, and iOS devices are
notoriously awkward about this — they re-enumerate on the bus when they connect, so the
filter has to catch them again.

1. Install the **VirtualBox Extension Pack** (USB 2.0/3.0 support; the base package only
   does USB 1.1, which is not enough)
2. VM → Settings → USB → enable **USB 3.0 (xHCI)**
3. Add a USB filter for the iPhone. Leave the *Serial No.* field empty so it still matches
   after the device re-enumerates
4. Start the VM, connect the phone, tap **Trust This Computer** on the phone
5. Confirm macOS sees it — the phone should appear under Finder or in Xcode's
   Window → Devices and Simulators

**Once it has paired over USB, switch to wireless.** In Devices and Simulators, tick
**Connect via network**. After that you can deploy over Wi-Fi and stop fighting USB
passthrough entirely — much the biggest quality-of-life win in this whole setup.

---

## The day-to-day loop

After changing any web code:

```bash
npm run ios
```

Then hit Run in Xcode. Swift changes only need the Xcode build.

If the app shows stale content after a rebuild, the web assets did not re-copy — check
that `cap sync` actually ran. The native build deliberately has no service worker, so a
stale bundle is a sync problem, never a cache problem.

---

## Troubleshooting

**"Speech plugin is not implemented"** — the plugin files are not in the Xcode target. See
the section above; this is the most common failure by a distance.

**Dictation returns nothing** — check Settings → BookNotes on the phone for Microphone and
Speech Recognition. The two are separate permissions and both are required.

**OCR always returns empty text** — usually an orientation problem, though the plugin
already passes EXIF orientation through to Vision. Try a photo taken in landscape to
confirm.

**`pod install` fails** — `pod repo update`, then re-run. On older macOS you may also need
`sudo gem install activesupport -v 6.1.7.6` before CocoaPods will install.

**Simulator won't launch** — expected under VirtualBox. Use a physical device.

---

## What is still not native

Translation. Apple's Translation framework needs the iOS 18 SDK, so Xcode 16, so macOS
Sonoma or newer — out of reach on Monterey. `TranslationProvider` in
[src/services/translation.ts](src/services/translation.ts) remains a no-op, and OCR text is
still tagged with a detected script. Implementing it later means one class behind the
existing interface, with no other changes.
