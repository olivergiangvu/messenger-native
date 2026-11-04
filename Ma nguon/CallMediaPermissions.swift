import AVFoundation
import AppKit
import Foundation

/// Native macOS TCC permission workflow. Only invoked from a user action in
/// Settings; it never starts camera/microphone capture or records anything.
/// WKWebView retains its separate, origin-scoped permission delegate.
enum CallMediaPermissions {
    static func status(for media: AVMediaType) -> AVAuthorizationStatus {
        AVCaptureDevice.authorizationStatus(for: media)
    }

    static func label(for media: AVMediaType) -> String {
        switch status(for: media) {
        case .authorized: return MenuLocalization.ui("Đã cho phép")
        case .notDetermined: return MenuLocalization.ui("Chưa yêu cầu")
        case .denied: return MenuLocalization.ui("Đã từ chối")
        case .restricted: return MenuLocalization.ui("Bị hạn chế")
        @unknown default: return MenuLocalization.ui("Không xác định")
        }
    }

    /// Completion runs on the main queue, so callers may update AppKit UI.
    static func request(_ media: AVMediaType, completion: @escaping () -> Void) {
        guard status(for: media) == .notDetermined else {
            DispatchQueue.main.async(execute: completion)
            return
        }
        AVCaptureDevice.requestAccess(for: media) { _ in
            DispatchQueue.main.async(execute: completion)
        }
    }

    static func openPrivacySettings(for media: AVMediaType) {
        let pane = media == .audio ? "Privacy_Microphone" : "Privacy_Camera"
        if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?\(pane)") {
            NSWorkspace.shared.open(url)
        }
    }
}
