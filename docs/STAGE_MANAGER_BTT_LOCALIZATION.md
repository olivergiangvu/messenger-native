# Stage Manager + BetterTouchTool & macOS menu localization

## Problem confirmed in original source

The application registered a standard AppKit Window menu using
`NSApp.windowsMenu`, but labeled the top-level menu **Cửa sổ**
unconditionally, even while the user's macOS UI is in English.

A documented BetterTouchTool Stage Manager preset uses
**Trigger Menu Bar Menu-Item** with the literal path:

```
Window;Remove Window from Set
```

BetterTouchTool matches menu labels, so `Cửa sổ` does not match
`Window` when the preset was authored in English.

## Fix in this branch

- Declare English and Vietnamese native app localizations (en/vi);
  English is the fallback region.
- Translate native menu labels with `MenuLocalization` using
  `en.lproj/Menu.strings` and `vi.lproj/Menu.strings`.
- Give the **top-level NSMenuItem** an explicit localized title
  in addition to the submenu title. This supports menu accessibility
  tools that search menu bar items by name.
- Preserve `NSApp.windowsMenu` as the actual AppKit-managed Window menu.
  Do not insert a fake "Remove Window from Set" item or use undocumented
  APIs for Stage Manager.
- `Xem/View → Window Menu Diagnostics…` displays app language, actual
  Window menu title, current item labels, app bundle ID, and the BTT menu
  path for the current locale.
- Include localized macOS Camera/Microphone permission descriptions.
- No changes to Messenger DOM, call handling, notification, Reel playback,
  or WebKit throttling.

## Install

Use a separately signed, stable local app build:

```bash
cd ~/messenger-native
git fetch origin
git switch --track origin/feature/stage-manager-localization
bash build.sh
bash install-local.sh
```

If you already checked out this branch:

```bash
git switch feature/stage-manager-localization
git pull --ff-only
bash build.sh
bash install-local.sh
```

Quit the old Messenger Native completely before rebuilding.
The app installs to `~/Applications/Messenger Native.app`.

## Acceptance sequence (macOS UI language English)

1. Enable Stage Manager.
2. Open Messenger Native and group its main window with another app
   in one Stage Manager set.
3. The menu bar should now show **Edit, View, Chats, Window, Help**
   instead of hard-coded Vietnamese.
4. Open **Window** manually and confirm that the OS provides
   **Remove Window from Set** for this grouped window. The presence
   and wording of dynamically injected Stage Manager items depend on
   the current window grouping and OS.
5. In BTT, use **Trigger Menu Bar Menu-Item** with
   `Window;Remove Window from Set`.
6. If this BTT preset is app-specific, retarget the app to
   `com.olivergiangvu.messengernative`, not the original Vdk bundle ID
   `com.vduck.messenger`. Make sure BetterTouchTool has Accessibility
   access in System Settings.
7. If the preset first focuses a window under the pointer, preserve
   the action order: **Activate/Bring to Front Window Under Cursor**,
   then **Trigger Menu Bar Menu-Item**. A short delay can help if
   focus is not completed before menu lookup.
8. Try the BTT trigger. It should run the **same native macOS menu action**
   that you verified in step 4.
9. If it still fails, open **View → Window Menu Diagnostics…** and
   share the menu title, BTT path, and whether the native menu entry
   is visible. This diagnosis does not log chat content.

## macOS UI language Vietnamese

The root menu should remain **Cửa sổ**. Do **not** expect a preset
with `Window;Remove Window from Set` to match on a Vietnamese-localized
OS; choose the actual localized Stage Manager menu title shown by
macOS, including the current root menu label, when setting BTT.

The new code supports **menu localization only**.
The app's custom Settings panels and its Messenger website content
are not comprehensively localized by this patch; the site uses Meta's
own language preferences.

## What this does not guarantee

The available public AppKit APIs provide standard Window menu
integration and collection behaviors, but do not expose a generic
`removeWindowFromStageManagerSet()` method. This patch fixes
the menu-name/Accessibility integration and uses Apple's standard
window menu. Actual BTT success must be verified on the user's Mac.

The source also intentionally leaves the main window's default
collection behavior unchanged; the existing Stage Manager manual menu
action already works, and altering it would risk unintended window
grouping, full-screen or call-panel behavior.

## References

- Apple AppKit: NSApplication.windowsMenu
  https://developer.apple.com/documentation/appkit/nsapplication/windowsmenu
- BetterTouchTool community preset and its exact `BTTMenubarPath`:
  https://community.folivora.ai/t/quickly-remove-windows-from-a-stage-managers-set/36003
- Apple Stage Manager window collection behaviors:
  https://developer.apple.com/documentation/appkit/nswindow/collectionbehavior-swift.struct
