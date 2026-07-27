import AVFoundation
import Capacitor
import Foundation
import Speech

/**
 * Native dictation via SFSpeechRecognizer.
 *
 * This exists because the web Speech API is unusable in the exact place BookNotes
 * is meant to live: `webkitSpeechRecognition` works in a Safari tab but silently
 * fails once the app is launched standalone, and the constructor is still present,
 * so feature detection reports a false positive. Inside a Capacitor WebView the web
 * API is unavailable altogether, so this plugin is the only route to dictation.
 *
 * Results are pushed as events rather than resolved from `start`, because dictation
 * streams: the caller wants partial text as it is spoken, not one value at the end.
 */
@objc(SpeechPlugin)
public class SpeechPlugin: CAPPlugin {

    private var recognizer: SFSpeechRecognizer?
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private let audioEngine = AVAudioEngine()

    /// Guards against `stop` racing `start`, and against double-starts.
    private var isListening = false

    // MARK: - Permissions

    @objc func checkPermissions(_ call: CAPPluginCall) {
        let speech = SFSpeechRecognizer.authorizationStatus()
        let mic = AVAudioSession.sharedInstance().recordPermission

        call.resolve([
            "speech": describe(speech),
            "microphone": describe(mic)
        ])
    }

    @objc func requestPermissions(_ call: CAPPluginCall) {
        // Both are needed: one to capture audio, one to transcribe it. Asking for
        // the microphone only after speech is granted keeps the two system prompts
        // from stacking on top of each other.
        SFSpeechRecognizer.requestAuthorization { speechStatus in
            AVAudioSession.sharedInstance().requestRecordPermission { micGranted in
                call.resolve([
                    "speech": self.describe(speechStatus),
                    "microphone": micGranted ? "granted" : "denied"
                ])
            }
        }
    }

    @objc func available(_ call: CAPPluginCall) {
        let locale = call.getString("locale") ?? Locale.current.identifier
        let candidate = SFSpeechRecognizer(locale: Locale(identifier: locale))

        call.resolve([
            "available": candidate?.isAvailable ?? false,
            "onDevice": candidate?.supportsOnDeviceRecognition ?? false
        ])
    }

    // MARK: - Dictation

    @objc func start(_ call: CAPPluginCall) {
        guard !isListening else {
            call.reject("Dictation is already running.")
            return
        }

        guard SFSpeechRecognizer.authorizationStatus() == .authorized else {
            call.reject("Speech recognition has not been authorised.")
            return
        }

        let locale = call.getString("locale") ?? Locale.current.identifier
        recognizer = SFSpeechRecognizer(locale: Locale(identifier: locale))

        guard let recognizer, recognizer.isAvailable else {
            call.reject("Speech recognition is unavailable for \(locale).")
            return
        }

        do {
            try beginSession(recognizer: recognizer)
            isListening = true
            call.resolve(["listening": true])
        } catch {
            teardown()
            call.reject("Could not start dictation: \(error.localizedDescription)")
        }
    }

    private func beginSession(recognizer: SFSpeechRecognizer) throws {
        let session = AVAudioSession.sharedInstance()
        // .duckOthers so any audio the reader has playing dips rather than stops.
        try session.setCategory(.record, mode: .measurement, options: [.duckOthers])
        try session.setActive(true, options: .notifyOthersOnDeactivation)

        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true

        // Prefer on-device recognition where the model exists: it keeps the reader's
        // notes off Apple's servers and works with no network. Falls back silently.
        if recognizer.supportsOnDeviceRecognition {
            request.requiresOnDeviceRecognition = true
        }
        self.request = request

        let inputNode = audioEngine.inputNode
        let format = inputNode.outputFormat(forBus: 0)

        task = recognizer.recognitionTask(with: request) { [weak self] result, error in
            guard let self else { return }

            if let result {
                let text = result.bestTranscription.formattedString
                self.notifyListeners("partialResult", data: ["text": text])

                if result.isFinal {
                    self.notifyListeners("finalResult", data: ["text": text])
                    self.teardown()
                }
                return
            }

            if let error {
                // Code 216 is the ordinary "recognition was cancelled" that arrives
                // whenever the user taps stop, so it isn't surfaced as a failure.
                let nsError = error as NSError
                if nsError.code != 216 {
                    self.notifyListeners("error", data: ["message": error.localizedDescription])
                }
                self.teardown()
            }
        }

        inputNode.removeTap(onBus: 0)
        inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
            self?.request?.append(buffer)
        }

        audioEngine.prepare()
        try audioEngine.start()
    }

    @objc func stop(_ call: CAPPluginCall) {
        guard isListening else {
            call.resolve(["listening": false])
            return
        }

        // endAudio lets the recognizer finish the current phrase and emit a final
        // result. Cancelling outright would throw away the last few words.
        request?.endAudio()
        audioEngine.stop()
        audioEngine.inputNode.removeTap(onBus: 0)
        isListening = false

        call.resolve(["listening": false])
    }

    private func teardown() {
        if audioEngine.isRunning {
            audioEngine.stop()
            audioEngine.inputNode.removeTap(onBus: 0)
        }

        task = nil
        request = nil
        isListening = false

        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    // MARK: - Helpers

    private func describe(_ status: SFSpeechRecognizerAuthorizationStatus) -> String {
        switch status {
        case .authorized: return "granted"
        case .denied: return "denied"
        case .restricted: return "denied"
        case .notDetermined: return "prompt"
        @unknown default: return "prompt"
        }
    }

    private func describe(_ permission: AVAudioSession.RecordPermission) -> String {
        switch permission {
        case .granted: return "granted"
        case .denied: return "denied"
        case .undetermined: return "prompt"
        @unknown default: return "prompt"
        }
    }
}
