import Foundation

/// Localizes native macOS menu titles through the app bundle. AppKit will
/// retain the standard Window menu and add its Stage Manager commands.
enum MenuLocalization {
    static func text(_ key: String) -> String {
        Bundle.main.localizedString(forKey: key, value: key, table: "Menu")
    }

    static func numberedChat(_ number: Int) -> String {
        String(format: text("Đoạn chat %d"), number)
    }
}
