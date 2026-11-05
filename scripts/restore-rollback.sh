#!/bin/bash
# Restore the exact app package from a previously verified rollback ZIP.
# Requires macOS. Uses install-local.sh to close/relaunch and preserve external
# WebKit website data (cookies, chat drafts, login), not reset the user profile.
set -euo pipefail

usage() {
  echo "Usage: bash scripts/restore-rollback.sh /path/to/Messenger.Native.rollback.2026-11-05.zip"
  echo "This replaces the installed app after validating its bundle and signature."
}
if [ "$#" -eq 1 ] && { [ "$1" = "--help" ] || [ "$1" = "-h" ]; }; then
  usage; exit 0
fi
if [ "$#" -ne 1 ]; then usage >&2; exit 2; fi
if [ "$(uname -s)" != "Darwin" ]; then
  echo "Restore requires macOS." >&2; exit 2
fi

ZIP="$1"
if [ ! -f "$ZIP" ]; then echo "ZIP not found: $ZIP" >&2; exit 1; fi
ZIP=$(cd "$(dirname "$ZIP")" && pwd)/$(basename "$ZIP")
CHECKSUM="$ZIP.sha256"
if [ -f "$CHECKSUM" ]; then
  (cd "$(dirname "$ZIP")" && shasum -a 256 -c "$(basename "$CHECKSUM")") || {
    echo "Checksum mismatch; aborting rollback." >&2; exit 1;
  }
else
  echo "WARNING: companion .sha256 not found; verify your trusted ZIP source."
fi

WORK=$(mktemp -d)
cleanup() { rm -rf "$WORK"; }
trap cleanup EXIT
/usr/bin/ditto -x -k "$ZIP" "$WORK"
APP="$WORK/Messenger Native.app"
if [ ! -f "$APP/Contents/MacOS/Messenger" ]; then
  echo "Unexpected archive contents, Messenger Native.app not found." >&2; exit 1
fi
ID=$(/usr/libexec/PlistBuddy -c "Print :CFBundleIdentifier" "$APP/Contents/Info.plist")
if [ "$ID" != "com.olivergiangvu.messengernative" ]; then
  echo "Bundle identifier mismatch: $ID" >&2; exit 1
fi
/usr/bin/codesign --verify --deep --strict "$APP" || {
  echo "Code signature invalid, refusing rollback." >&2; exit 1;
}
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
echo "Validated rollback package. Installing the previous Messenger Native..."
bash "$ROOT/install-local.sh" "$APP"
echo "Rollback installation complete. Verify calls, notifications and login."
