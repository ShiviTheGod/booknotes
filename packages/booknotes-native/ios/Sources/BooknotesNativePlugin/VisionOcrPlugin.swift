import Capacitor
import Foundation
import UIKit
import Vision

/**
 * On-device text recognition via the Vision framework.
 *
 * Replaces Tesseract.js on iOS. Tesseract works, but on a phone it means fetching
 * several megabytes of wasm and language data over the network and then grinding
 * through recognition in a JS worker. Vision is already on the device, runs on the
 * neural engine, handles many scripts, and needs no network at all — which matters
 * for an app whose whole premise is that your notes stay on your device.
 *
 * The photograph itself is never modified here. Text comes back as metadata for the
 * caller to store alongside the untouched image.
 */
@objc(VisionOcrPlugin)
public class VisionOcrPlugin: CAPPlugin, CAPBridgedPlugin {

    public let identifier = "VisionOcrPlugin"
    public let jsName = "VisionOcr"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "recognizeText", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "supportedLanguages", returnType: CAPPluginReturnPromise)
    ]

    @objc func recognizeText(_ call: CAPPluginCall) {
        guard let base64 = call.getString("imageBase64") else {
            call.reject("imageBase64 is required.")
            return
        }

        guard
            let data = Data(base64Encoded: base64),
            let image = UIImage(data: data),
            let cgImage = image.cgImage
        else {
            call.reject("Could not decode that image.")
            return
        }

        let languages = call.getArray("languages", String.self)
        let orientation = Self.cgOrientation(from: image.imageOrientation)

        // Vision is not cheap on a large photo, so keep it off the main thread —
        // the WebView stays responsive while a page is being read.
        DispatchQueue.global(qos: .userInitiated).async {
            let request = VNRecognizeTextRequest { request, error in
                if let error = error {
                    call.reject("Text recognition failed: \(error.localizedDescription)")
                    return
                }

                let observations = request.results as? [VNRecognizedTextObservation] ?? []

                // topCandidates(1) is the most likely reading of each line. Joining
                // with newlines preserves the layout of a printed page reasonably well.
                var lines: [String] = []
                var confidences: [Float] = []

                for observation in observations {
                    guard let candidate = observation.topCandidates(1).first else { continue }
                    lines.append(candidate.string)
                    confidences.append(candidate.confidence)
                }

                let averageConfidence =
                    confidences.isEmpty ? 0 : confidences.reduce(0, +) / Float(confidences.count)

                call.resolve([
                    "text": lines.joined(separator: "\n"),
                    "lineCount": lines.count,
                    "confidence": Double(averageConfidence)
                ])
            }

            request.recognitionLevel = .accurate
            request.usesLanguageCorrection = true

            if let languages = languages, !languages.isEmpty {
                request.recognitionLanguages = languages
            }

            // A photo taken in portrait usually carries an EXIF orientation rather
            // than rotated pixels. Passing it through matters: without it Vision
            // reads a sideways image and returns nothing usable.
            let handler = VNImageRequestHandler(
                cgImage: cgImage,
                orientation: orientation,
                options: [:]
            )

            do {
                try handler.perform([request])
            } catch {
                call.reject("Text recognition failed: \(error.localizedDescription)")
            }
        }
    }

    /// Languages this device can recognise, so the JS side can pick sensible defaults.
    @objc func supportedLanguages(_ call: CAPPluginCall) {
        // Querying the language list arrived in iOS 15, but the deployment target is
        // 14.0. Recognition itself works fine on 14 — only this introspection is
        // newer — so older devices get an empty list and fall back to the default.
        guard #available(iOS 15.0, *) else {
            call.resolve(["languages": [String]()])
            return
        }

        do {
            let request = VNRecognizeTextRequest()
            request.recognitionLevel = .accurate
            call.resolve(["languages": try request.supportedRecognitionLanguages()])
        } catch {
            call.resolve(["languages": [String]()])
        }
    }

    private static func cgOrientation(from orientation: UIImage.Orientation) -> CGImagePropertyOrientation {
        switch orientation {
        case .up: return .up
        case .down: return .down
        case .left: return .left
        case .right: return .right
        case .upMirrored: return .upMirrored
        case .downMirrored: return .downMirrored
        case .leftMirrored: return .leftMirrored
        case .rightMirrored: return .rightMirrored
        @unknown default: return .up
        }
    }
}
