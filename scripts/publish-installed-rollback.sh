#!/bin/bash
# Archive the EXACT currently installed Messenger Native app and
# optionally upload it as a GitHub pre-release. NEVER rebuild or re-sign here.
# Default is DRAFT to protect possible personal Apple Development signer info.
# To make it a published GitHub pre-release: --publish
set -euo pipefail

REPO="olivergiangvu/messenger-native"
TAG="rollback-2026-11-05-pre-webkit"
# Source reference is a pre-memory PR #17 HEAD, not a cryptographic claim
# that the locally installed binary was built from precisely this commit.
SOURCE_SHA="cedd5a153a247d47cbbff1fe0a6ed9533f9f84f0"
BUNDLE_ID="com.olivergiangvu.messengernative"
APP="$HOME/Applications/Messenger Native.app"
DIR="$HOME/MessengerNativeBackups/$TAG"
ZIPNAME="Messenger.Native.rollback.2026-11-05.zip"
ZIP="$DIR/$ZIPNAME"
SUM="$DIR/$ZIPNAME.sha256"
BINARY_HASH="$DIR/installed-executable.sha256"
NOTES="$DIR/RELEASE-NOTES.md"
MODE="draft"

usage() {
  echo "Usage: bash scripts/publish-installed-rollback.sh [--draft|--publish]"
  echo "  --draft    (default) keep GitHub pre-release private until verified"
  echo "  --publish  publish pre-release publicly (may expose Apple signer identity)"
  echo "Never builds, re-signs, quits, or replaces the installed application."
}
if [ "$#" -gt 1 ]; then usage >&2; exit 2; fi
if [ "$#" -eq 1 ]; then
  case "$1" in
    --draft) MODE="draft" ;;
    --publish) MODE="publish" ;;
    --help|-h) usage; exit 0 ;;
    *) usage >&2; exit 2 ;;
  esac
fi

if [ "$(uname -s)" != "Darwin" ]; then
  echo "This release packaging script must run on the owner's macOS host." >&2
  exit 2
fi
if [ ! -d "$APP/Contents" ] || [ ! -f "$APP/Contents/MacOS/Messenger" ]; then
  echo "Cannot locate installed Messenger Native.app in ~/Applications." >&2
  exit 1
fi
ID=$(/usr/libexec/PlistBuddy -c "Print :CFBundleIdentifier" "$APP/Contents/Info.plist")
VERSION=$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$APP/Contents/Info.plist")
BUILD=$(/usr/libexec/PlistBuddy -c "Print :CFBundleVersion" "$APP/Contents/Info.plist")
if [ "$ID" != "$BUNDLE_ID" ]; then
  echo "Refusing to package unexpected bundle ID: $ID" >&2; exit 1
fi
if ! /usr/bin/codesign --verify --deep --strict "$APP" >/dev/null 2>&1; then
  echo "Installed app signature verification FAILED; no release will be uploaded." >&2
  exit 1
fi

mkdir -p "$DIR"
echo "Installed app: $APP"
echo "Bundle: $ID | Version: $VERSION | Build: $BUILD"
echo "Signing: original app signature is preserved, not re-signed."
echo "NOTE: a PUBLIC pre-release can expose the original Apple signing identity."
echo "No Messenger cookies, account database or conversations are included."

CURRENT_HASH=$(shasum -a 256 "$APP/Contents/MacOS/Messenger" | awk '{print $1}')
if [ -f "$BINARY_HASH" ]; then
  OLD_HASH=$(cat "$BINARY_HASH")
  if [ "$OLD_HASH" != "$CURRENT_HASH" ]; then
    echo "Installed app executable has CHANGED since archive creation." >&2
    echo "Refusing to silently replace the older rollback snapshot." >&2
    exit 1
  fi
fi
if [ ! -e "$ZIP" ]; then
  printf '%s\n' "$CURRENT_HASH" > "$BINARY_HASH"
  /usr/bin/ditto -c -k --norsrc --noextattr --keepParent "$APP" "$ZIP"
  echo "Created: $ZIP"
else
  echo "Reusing existing local ZIP: $ZIP"
fi

VERIFY_DIR=$(mktemp -d)
cleanup() { rm -rf "$VERIFY_DIR"; }
trap cleanup EXIT
/usr/bin/ditto -x -k "$ZIP" "$VERIFY_DIR"
UNPACKED="$VERIFY_DIR/Messenger Native.app"
if [ ! -d "$UNPACKED/Contents" ]; then
  echo "ZIP does not contain expected Messenger Native.app." >&2; exit 1
fi
/usr/bin/codesign --verify --deep --strict "$UNPACKED" >/dev/null 2>&1 || {
  echo "Extracted ZIP has invalid code signature; stopping." >&2; exit 1;
}
CHECK_ID=$(/usr/libexec/PlistBuddy -c "Print :CFBundleIdentifier" "$UNPACKED/Contents/Info.plist")
CHECK_HASH=$(shasum -a 256 "$UNPACKED/Contents/MacOS/Messenger" | awk '{print $1}')
if [ "$CHECK_ID" != "$BUNDLE_ID" ] || [ "$CHECK_HASH" != "$CURRENT_HASH" ]; then
  echo "ZIP payload does not match the currently installed executable/bundle." >&2
  exit 1
fi

(cd "$DIR" && shasum -a 256 "$ZIPNAME" > "$ZIPNAME.sha256")
DIGEST=$(shasum -a 256 "$ZIP" | awk '{print $1}')
cat > "$NOTES" <<EOF
## Messenger Native — pre-fix rollback snapshot (incoming-call issue known)

This is a **manual rollback** archive of the macOS application installed
on 2026-11-05, taken **before** installing the WebKit memory diagnostics
experiment (PR #18 / PR #19). The existing signed .app bundle was zipped as-is:
**not rebuilt, not re-signed**.

- Installed CFBundleIdentifier: $ID
- Installed CFBundleShortVersionString: $VERSION (build $BUILD)
- ZIP SHA-256: $DIGEST
- Executable SHA-256: $CURRENT_HASH
- Source reference/tag target: $SOURCE_SHA (PR #17)
- **Source caveat:** the installed binary has no verified embedded Git SHA, so
  this source reference is a historical checkpoint, NOT proven binary provenance.

### Known issue
The user reported an incoming call missing its expected alert on 2026-11-05
around 18:51 local time. This archive is NOT a verified fully stable release;
it only preserves the exact pre-experiment app for emergency rollback.

### Manual rollback on the Mac
Download the ZIP and companion .sha256 file from this release; verify the ZIP
checksum, extract the app and install it through the repository's
\`install-local.sh\` script. Or use \`scripts/restore-rollback.sh <zip-path>\`
from the repository checkout. This will quit/relaunch Messenger Native but
should preserve external WebKit login cookies/profile data.

This ZIP is a **manual rollback artifact**, not a signed auto-update package:
it has no update .zip.sig. A GitHub pre-release is excluded from the normal
\`releases/latest\` updater. Do not mistake this for a fresh stable release.

Security: a public code-signed app may reveal the Apple Development signing
identity; publishing should be a deliberate decision.
EOF
echo
echo "ZIP signature and executable hash verified."
echo "Local backup: $ZIP"
echo "SHA256: $DIGEST"

if ! command -v gh >/dev/null 2>&1; then
  echo
  echo "GitHub CLI (gh) not found. The local rollback archive is SAFE and ready."
  echo "Install gh (brew install gh), then run the same script again."
  exit 3
fi
if ! gh auth status >/dev/null 2>&1; then
  echo "GitHub CLI is not authenticated. Run: gh auth login" >&2
  echo "The local rollback ZIP remains available at: $ZIP" >&2
  exit 3
fi
if gh release view "$TAG" -R "$REPO" >/dev/null 2>&1; then
  echo "A GitHub Release with tag $TAG already exists; refusing to overwrite." >&2
  echo "Check: https://github.com/$REPO/releases/tag/$TAG" >&2
  exit 1
fi
# A previously created plain tag would otherwise be silently reused: abort.
if gh api "repos/$REPO/git/ref/tags/$TAG" --silent >/dev/null 2>&1; then
  echo "Tag $TAG already exists; refusing to publish with ambiguous provenance." >&2
  exit 1
fi
echo
echo "Publishing to repository: $REPO"
echo "Target source commit reference: $SOURCE_SHA"
if [ "$MODE" = "publish" ]; then
  echo "Mode: PUBLIC PRE-RELEASE (Apple signing identity may be visible)"
  gh release create "$TAG" "$ZIP" "$SUM" -R "$REPO" \
    --target "$SOURCE_SHA" --title "Messenger Native — pre-fix backup 2026-11-05 (call alerts unverified)" \
    --notes-file "$NOTES" --prerelease --latest=false
else
  echo "Mode: DRAFT PRE-RELEASE (owner/collaborators only)"
  gh release create "$TAG" "$ZIP" "$SUM" -R "$REPO" \
    --target "$SOURCE_SHA" --title "Messenger Native — pre-fix backup 2026-11-05 (call alerts unverified)" \
    --notes-file "$NOTES" --prerelease --draft --latest=false
fi
echo "GitHub release: https://github.com/$REPO/releases/tag/$TAG"
echo "Verify its assets BEFORE building or installing the new Messenger Native."
