#!/bin/bash
# Read-only memory profiler for Messenger Native (macOS).
# Usage: bash scripts/profile-memory.sh [main_PID] [--helper PID ...]
# Auto-detects the main PID. Helpers are NOT assumed to belong to Messenger.
set -u

usage() {
  echo "Usage: bash scripts/profile-memory.sh [main_PID] [--helper PID ...]"
  echo "       bash scripts/profile-memory.sh --helper 46185 --helper 46201"
}
if [ "$(uname -s)" != "Darwin" ]; then
  echo "Requires macOS." >&2
  exit 2
fi

MAIN_PID=""
HELPER_PIDS=""
valid_pid() {
  case "$1" in ""|*[!0-9]*) return 1 ;; *) return 0 ;; esac
}
while [ "$#" -gt 0 ]; do
  case "$1" in
    --help|-h) usage; exit 0 ;;
    --helper)
      shift
      if [ "$#" -eq 0 ] || ! valid_pid "$1"; then
        echo "Expected numeric PID after --helper" >&2; exit 2
      fi
      HELPER_PIDS="$HELPER_PIDS $1"
      ;;
    *)
      if [ -n "$MAIN_PID" ] || ! valid_pid "$1"; then
        usage >&2; exit 2
      fi
      MAIN_PID="$1"
      ;;
  esac
  shift
done

if [ -z "$MAIN_PID" ]; then
  for candidate in $(pgrep -x Messenger 2>/dev/null || true); do
    commandline=$(ps -p "$candidate" -o command= 2>/dev/null || true)
    case "$commandline" in
      *"/Messenger Native.app/Contents/MacOS/Messenger"*)
        MAIN_PID="$candidate"; break ;;
    esac
  done
fi
if [ -z "$MAIN_PID" ] || ! kill -0 "$MAIN_PID" 2>/dev/null; then
  echo "Messenger Native main PID not found." >&2
  echo "Use pgrep -fl Messenger; pass the main PID explicitly." >&2
  exit 1
fi

print_memory() {
  local pid="$1"
  if ! kill -0 "$pid" 2>/dev/null; then
    echo "PID $pid no longer running."
    return
  fi
  ps -p "$pid" -o pid=,ppid=,etime=,rss=,%cpu=,comm= 2>/dev/null || true
  if command -v footprint >/dev/null 2>&1; then
    local report
    if report=$(footprint -p "$pid" 2>&1); then
      echo "$report" | grep -E 'phys_footprint:|phys_footprint_peak:' | tail -n 2 || true
    else
      echo "physical footprint unavailable: check macOS permission/Activity Monitor"
    fi
  fi
}

echo "=== Messenger Native memory snapshot ==="
echo "Captured: $(date '+%Y-%m-%d %H:%M:%S %z')"
echo "Columns: PID PPID ELAPSED RSS(KiB) CPU(%) COMMAND"
echo
echo "Main app (verified by executable path if auto-detected):"
print_memory "$MAIN_PID"

if [ -n "$HELPER_PIDS" ]; then
  echo
  echo "User-selected helpers — membership not automatically verified:"
  for pid in $HELPER_PIDS; do
    if [ "$pid" = "$MAIN_PID" ]; then
      echo "Skipping helper PID $pid (already shown as main process)."
      continue
    fi
    print_memory "$pid"
  done
fi

echo
echo "All WebKit candidates on this Mac (may belong to OTHER apps):"
ps -axo pid=,ppid=,rss=,comm= 2>/dev/null | awk '
  /com[.]apple[.]WebKit[.](WebContent|Networking|GPU)/ {
    print; n++; if (n >= 30) exit
  }
' || true
echo
echo "IMPORTANT: RSS is not physical footprint. Do not sum system-wide WebKit"
echo "helpers, and do not infer parentage from neighboring PIDs: most are PPID 1."
echo "Use Activity Monitor > View > All Processes to verify which WebKit"
echo "processes belong to Messenger before attributing memory to the app."
echo "Read-only: no process, cache, cookie or user data has been modified."