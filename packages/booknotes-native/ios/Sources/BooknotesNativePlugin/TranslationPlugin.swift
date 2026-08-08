import Capacitor
import Foundation
import SwiftUI
import Translation
import UIKit

/**
 * On-device translation of text read out of photographed pages.
 *
 * The reason this is native rather than a call to a translation API: ReadNote is a
 * static site with no backend, so any API key it held would be published with it.
 * Apple's framework needs no key, no account, and no network — the language packs
 * live on the phone. It is the only way this feature can exist without turning a
 * local-first app into one that ships your notes to a server.
 *
 * The awkward part is that the framework only vends a `TranslationSession` through a
 * SwiftUI view modifier; there is no way to construct one directly. So a one-point
 * invisible SwiftUI view is parked in the hierarchy purely to give `.translationTask`
 * somewhere to live, and work is fed to it. That is the whole reason for the
 * machinery below — it would otherwise be a single async call.
 *
 * iOS 18 and later. Everything degrades to "unavailable" below that, and the caller
 * simply keeps the extracted text untranslated.
 */
@objc(TranslationPlugin)
public class TranslationPlugin: CAPPlugin, CAPBridgedPlugin {

    public let identifier = "TranslationPlugin"
    public let jsName = "Translation"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "availability", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "supportedLanguages", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "translate", returnType: CAPPluginReturnPromise)
    ]

    /// What this device can actually translate into. The caller offers these and
    /// nothing else, so nobody can pick a language that will silently never work.
    @objc func supportedLanguages(_ call: CAPPluginCall) {
        guard #available(iOS 18.0, *) else {
            call.resolve(["languages": [String]()])
            return
        }

        Task {
            let languages = await LanguageAvailability().supportedLanguages
            // Deduplicated to base codes: the framework lists regional variants, and a
            // reader choosing a notes language does not care about en-GB versus en-US.
            var seen = Set<String>()
            var codes: [String] = []
            for language in languages {
                guard let code = language.languageCode?.identifier else { continue }
                if seen.insert(code).inserted { codes.append(code) }
            }
            call.resolve(["languages": codes.sorted()])
        }
    }

    /// Whether this device can translate into `target`, without doing any work.
    @objc func availability(_ call: CAPPluginCall) {
        guard let target = call.getString("target") else {
            call.reject("target is required.")
            return
        }

        guard #available(iOS 18.0, *) else {
            call.resolve(["status": "unavailable"])
            return
        }

        let source = call.getString("source")
        Task {
            let status = await TranslationBridge.shared.availability(source: source, target: target)
            call.resolve(["status": status])
        }
    }

    @objc func translate(_ call: CAPPluginCall) {
        guard let text = call.getString("text"), let target = call.getString("target") else {
            call.reject("text and target are required.")
            return
        }

        // Nothing to do, and asking the framework to translate whitespace would still
        // cost a session and possibly a language-pack prompt.
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            call.resolve(["text": text])
            return
        }

        guard #available(iOS 18.0, *) else {
            call.reject("On-device translation needs iOS 18 or later.")
            return
        }

        let source = call.getString("source")
        Task {
            do {
                let result = try await TranslationBridge.shared.translate(
                    text: text,
                    source: source,
                    target: target
                )
                // The detected source goes back too. The caller cannot work it out for
                // itself — its own detection only identifies a writing system — and it
                // needs it to tell a real translation from a page that was already in
                // the reader's language.
                call.resolve([
                    "text": result.text,
                    "sourceLanguage": result.sourceLanguage
                ])
            } catch {
                call.reject("Translation failed: \(error.localizedDescription)")
            }
        }
    }
}

@available(iOS 18.0, *)
@MainActor
final class TranslationBridge {

    static let shared = TranslationBridge()

    private let model = TranslationModel()
    private var host: UIHostingController<TranslationHostView>?

    func availability(source: String?, target: String) async -> String {
        let availability = LanguageAvailability()
        let targetLanguage = Locale.Language(identifier: target)

        // With a known source the framework can answer for the exact pair, which is
        // the honest answer — support is per-pair, not per-language.
        if let source = source, !source.isEmpty, source != "latn" {
            let status = await availability.status(
                from: Locale.Language(identifier: source),
                to: targetLanguage
            )
            switch status {
            case .installed: return "installed"
            case .supported: return "supported"
            case .unsupported: return "unsupported"
            @unknown default: return "unsupported"
            }
        }

        // Otherwise the most that can be said is whether the target is translatable
        // at all. The source gets detected when there is real text to look at.
        let supported = await availability.supportedLanguages
        let matches = supported.contains { $0.languageCode == targetLanguage.languageCode }
        return matches ? "supported" : "unsupported"
    }

    func translate(
        text: String,
        source: String?,
        target: String
    ) async throws -> TranslationModel.Result {
        installHostIfNeeded()

        // A source of "latn" means the caller only identified a writing system, not a
        // language — useless to the framework, and it detects the source itself anyway.
        let sourceLanguage = (source == nil || source == "latn" || source?.isEmpty == true)
            ? nil
            : Locale.Language(identifier: source!)

        return try await model.submit(
            text: text,
            source: sourceLanguage,
            target: Locale.Language(identifier: target)
        )
    }

    /// Parks the SwiftUI view that `.translationTask` needs. One point across and
    /// non-interactive, so it cannot affect the layout or swallow a tap — but it is a
    /// real view in a real window, which is what lets the framework present its
    /// language-download prompt when a pair is used for the first time.
    private func installHostIfNeeded() {
        guard host == nil else { return }

        let root = UIApplication.shared.connectedScenes
            .compactMap { ($0 as? UIWindowScene)?.keyWindow }
            .first?
            .rootViewController

        guard let root = root else { return }

        let controller = UIHostingController(rootView: TranslationHostView(model: model))
        controller.view.frame = CGRect(x: 0, y: 0, width: 1, height: 1)
        controller.view.isUserInteractionEnabled = false
        controller.view.backgroundColor = .clear

        root.addChild(controller)
        root.view.addSubview(controller.view)
        controller.didMove(toParent: root)

        host = controller
    }
}

@available(iOS 18.0, *)
@MainActor
final class TranslationModel: ObservableObject {

    struct Result {
        let text: String
        /// What the framework decided the original was written in.
        let sourceLanguage: String
    }

    private struct Job {
        let text: String
        let reply: CheckedContinuation<Result, Error>
    }

    /// Changing this is what starts a session. `.translationTask` watches it.
    @Published var configuration: TranslationSession.Configuration?

    private var pending: [Job] = []

    func submit(
        text: String,
        source: Locale.Language?,
        target: Locale.Language
    ) async throws -> Result {
        try await withCheckedThrowingContinuation { reply in
            pending.append(Job(text: text, reply: reply))

            // Re-running with a configuration the view already holds needs an explicit
            // invalidate; assigning an equal value would publish nothing and the job
            // would sit in the queue forever.
            if var existing = configuration,
               existing.source == source,
               existing.target == target {
                existing.invalidate()
                configuration = existing
            } else {
                configuration = TranslationSession.Configuration(source: source, target: target)
            }
        }
    }

    /// Called from the view with a live session. Drains everything queued, so a burst
    /// of photos costs one session rather than one per note.
    func perform(with session: TranslationSession) async {
        while !pending.isEmpty {
            let job = pending.removeFirst()
            do {
                let response = try await session.translate(job.text)
                job.reply.resume(
                    returning: Result(
                        text: response.targetText,
                        sourceLanguage: response.sourceLanguage.minimalIdentifier
                    )
                )
            } catch {
                job.reply.resume(throwing: error)
            }
        }
    }
}

@available(iOS 18.0, *)
struct TranslationHostView: View {
    @ObservedObject var model: TranslationModel

    var body: some View {
        Color.clear
            .translationTask(model.configuration) { session in
                await model.perform(with: session)
            }
    }
}
