import Foundation

/// Localizes native macOS menu titles through the app bundle. AppKit will
/// retain the standard Window menu and add its Stage Manager commands.
enum MenuLocalization {
    static func text(_ key: String) -> String {
        Bundle.main.localizedString(forKey: key, value: key, table: "Menu")
    }

    /// Native Settings and diagnostics. Bundle's preferred localizations
    /// honor macOS language order and per-app Language & Region overrides.
    /// Untranslated keys retain their original text, so ship matching keys
    /// in both en/vi Interface.strings resources.
    static func ui(_ key: String) -> String {
        Bundle.main.localizedString(forKey: key, value: key, table: "Interface")
    }

    /// Formats already-localized templates with system locale conventions.
    static func uiFormat(_ key: String, _ arguments: CVarArg...) -> String {
        String(format: ui(key), locale: Locale.current, arguments: arguments)
    }

    static var activeLanguage: String {
        Bundle.main.preferredLocalizations.first ?? "en"
    }

    static func numberedChat(_ number: Int) -> String {
        String(format: text("Đoạn chat %d"), number)
    }
}
