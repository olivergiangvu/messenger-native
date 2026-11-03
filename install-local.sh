#!/bin/bash
# Install the signed development build in a stable macOS location and register it
# with LaunchServices before requesting notification permission.
set -euo pipefail

SOURCE="${1:-${TMPDIR:-/tmp}/messenger-native-build/Messenger Native.app}"
DEST_DIR="$HOME/Applications"
DEST="$DEST_DIR/Messenger Native.app"
LSREGISTER="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"
STAGING="$DEST_DIR/.Messenger Native.staging.$$.app"
BACKUP="$DEST_DIR/.Messenger Native.backup.$$.app"

if [[ ! -d "$SOURCE/Contents" ]]; then
  echo "⛔ Không thấy app build tại: $SOURCE"
  echo "   Chạy 'bash build.sh' trước, sau đó chạy 'bash install-local.sh'."
  exit 1
fi

mkdir -p "$DEST_DIR"
echo "▶ Thoát phiên Messenger Native cũ (nếu đang chạy)…"
/usr/bin/osascript -e 'tell application id "com.olivergiangvu.messengernative" to quit' 2>/dev/null || true

for attempt in 1 2 3 4 5; do
  if ! /usr/bin/pgrep -f '/Messenger Native\.app/Contents/MacOS/Messenger$' >/dev/null; then break; fi
  /bin/sleep 1
done
if /usr/bin/pgrep -f '/Messenger Native\.app/Contents/MacOS/Messenger$' >/dev/null; then
  echo "⛔ Messenger Native vẫn đang chạy. Hãy Cmd+Q rồi chạy lại."
  exit 1
fi

cleanup() { rm -rf "$STAGING"; }
trap cleanup EXIT
rm -rf "$STAGING"
/usr/bin/ditto "$SOURCE" "$STAGING"
/usr/bin/codesign --verify --deep --strict --verbose=1 "$STAGING"

if [[ -d "$DEST" ]]; then mv "$DEST" "$BACKUP"; fi
if ! mv "$STAGING" "$DEST"; then
  if [[ -d "$BACKUP" ]]; then mv "$BACKUP" "$DEST"; fi
  echo "⛔ Không thể cài app vào $DEST"
  exit 1
fi

# Apps launched from /var/folders/T may be ineligible for local notifications,
# even if ad-hoc signed. Register the stable copy with macOS LaunchServices.
"$LSREGISTER" -f "$DEST"
if [[ -d "$BACKUP" ]]; then rm -rf "$BACKUP"; fi
BUNDLE_ID=$(/usr/libexec/PlistBuddy -c 'Print CFBundleIdentifier' "$DEST/Contents/Info.plist")
echo "✅ Đã cài: $DEST"
echo "   Bundle ID: $BUNDLE_ID"
echo "   Tiếp theo: Xem → Request Notification Permission…"
echo "   Sau đó: Xem → Send Test Notification…"
/usr/bin/open "$DEST"
