#!/bin/bash
# Controlled incoming-call regression A/B build (local Mac only).
# Build one historical Git SHA without installing, altering login, or publishing.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: bash scripts/prepare-call-ab.sh pr4|pr16|pr17|pr20

pr4  = PR #4 original call detector baseline
pr16 = PR #16 recent features before relative-time patch
pr17 = PR #17 last branch before RAM experiments
pr20 = latest local HEAD of the draft incoming-call fix

Build only. Never installs, quits Messenger, touches cookies, or creates a
GitHub tag/release. Preserves the existing app once for local emergency restore.
EOF
}
if [ "$#" -ne 1 ]; then usage >&2; exit 2; fi
if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then usage; exit 0; fi
if [ "$(uname -s)" != "Darwin" ]; then
  echo "Requires macOS for Swift/AppKit builds." >&2; exit 2
fi
case "$1" in
  pr4) ref="529efa3c76545c105fec285502d915da7538fef9" ;;
  pr16) ref="417ae36d" ;;
  pr17) ref="cedd5a153a247d47cbbff1fe0a6ed9533f9f84f0" ;;
  pr20) ref="HEAD" ;;
  *) usage >&2; exit 2 ;;
esac
candidate="$1"
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || {
  echo "Not a Git checkout." >&2; exit 1;
}
sha=$(git rev-parse --verify "$ref^{commit}") || {
  echo "Git commit $ref is missing. First run: git fetch origin." >&2
  exit 1
}
base="$HOME/MessengerNativeCallAB-20261105"
installed="$HOME/Applications/Messenger Native.app"
saved="$base/installed-before-ab/Messenger Native.app"
dest="$base/candidates/$candidate/$sha"
archive="$dest/Messenger Native.app"
mkdir -p "$base/installed-before-ab" "$base/candidates/$candidate"

# Local emergency copy only, NOT a release or proof of a stable build.
if [ -d "$installed/Contents" ] && [ ! -d "$saved/Contents" ]; then
  /usr/bin/ditto "$installed" "$saved"
  /usr/bin/codesign --verify --deep --strict "$saved" || {
    echo "Saved app failed signature verification." >&2; exit 1;
  }
  shasum -a 256 "$saved/Contents/MacOS/Messenger" > "$base/installed-before-ab/executable.sha256"
  echo "Original installed app copied locally (NOT a release): $saved"
fi
if [ -d "$archive/Contents" ]; then
  /usr/bin/codesign --verify --deep --strict "$archive"
  echo "Already built: $archive"
  echo "Commit: $sha"
  exit 0
fi

# Use the same local Apple Development certificate; ad hoc signing can change
# macOS notification authorization and invalidate the A/B comparison.
key="$(printenv KY_APP 2>/dev/null || true)"
if [ -z "$key" ] && [ -f "$root/.ky-app" ]; then
  key=$(cat "$root/.ky-app")
fi
if [ -z "$key" ]; then
  echo "Missing KY_APP and .ky-app; refusing ad-hoc notification A/B build." >&2
  echo "Use the same signing identity as the installed app." >&2
  exit 1
fi
src=$(mktemp -d "$base/.source-$candidate.XXXXXX")
cleanup() { rm -rf "$src"; }
trap cleanup EXIT
git archive "$sha" | /usr/bin/tar -xf - -C "$src"
if [ ! -f "$src/build.sh" ]; then
  echo "Commit has no build.sh; cannot build the A/B candidate." >&2; exit 1
fi

echo "Building candidate $candidate at commit $sha"
KY_APP="$key" bash "$src/build.sh" "$dest"
if [ ! -d "$archive/Contents" ]; then
  echo "No built .app found." >&2; exit 1
fi
/usr/bin/codesign --verify --deep --strict "$archive"
bundle=$(/usr/libexec/PlistBuddy -c 'Print CFBundleIdentifier' "$archive/Contents/Info.plist")
if [ "$bundle" != "com.olivergiangvu.messengernative" ]; then
  echo "Unexpected bundle ID: $bundle" >&2; exit 1
fi
if [ -d "$installed/Contents" ]; then
  original_team=$(/usr/bin/codesign -dv --verbose=4 "$installed" 2>&1 |
    /usr/bin/awk -F= '/^TeamIdentifier=/{print $2}' || true)
  candidate_team=$(/usr/bin/codesign -dv --verbose=4 "$archive" 2>&1 |
    /usr/bin/awk -F= '/^TeamIdentifier=/{print $2}' || true)
  if [ -n "$original_team" ] && [ "$original_team" != "$candidate_team" ]; then
    echo "WARNING: signing team differs; banner A/B may be invalid." >&2
  fi
fi
shasum -a 256 "$archive/Contents/MacOS/Messenger" > "$dest/executable.sha256"
printf '%s\n' "$sha" > "$dest/source-commit.txt"
echo "Candidate BUILT. Nothing installed or published."
echo "Candidate app: $archive"
echo "Local restore app: $saved"
echo "Install ONLY when ready to test an incoming call:"
echo "  bash install-local.sh \"$archive\""
echo "Restore after A/B test:"
echo "  bash install-local.sh \"$saved\""
