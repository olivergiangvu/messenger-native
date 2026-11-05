#!/bin/bash
# Read-only Messenger Native RAM check. Usage: bash scripts/profile-memory.sh [PID]
set -u
if [ "$(uname -s)" != "Darwin" ]; then
  echo "This script requires macOS." >&2; exit 2
fi
PID=""
if [ "$#" -gt 0 ]; then PID="$1"; fi
if [ -z "$PID" ]; then
  for candidate in $(pgrep -x Messenger 2>/dev/null || true); do
    cmd=$(ps -p "$candidate" -o command= 2>/dev/null || true)
    case "$cmd" in
      *"/Messenger Native.app/Contents/MacOS/Messenger"*)
        PID="$candidate"; break ;;
    esac
  done
fi
if [ -z "$PID" ] || ! kill -0 "$PID" 2>/dev/null; then
  echo "Cannot locate Messenger Native main PID." >&2
  echo "Run pgrep -fl Messenger; then rerun with the correct PID." >&2
  exit 1
fi
echo "=== Messenger Native memory snapshot ==="
echo "Captured: $(date '+%Y-%m-%d %H:%M:%S %z')"
echo "Main PID: $PID"
echo "Main process (RSS KiB, CPU %, process name):"
ps -p "$PID" -o pid=,ppid=,rss=,%cpu=,comm= 2>/dev/null || true
if command -v footprint >/dev/null 2>&1; then
  echo
  echo "Main process physical footprint (preferred to RSS):"
  report=$(footprint -p "$PID" 2>&1)
  status=$?
  if [ "$status" -eq 0 ]; then
    echo "$report" | grep -E 'phys_footprint|phys_footprint_peak|TOTAL' | tail -n 8 || true
  else
    echo "footprint unavailable (permissions or process state); use Activity Monitor."
  fi
fi
echo
echo "WebKit helpers currently on this Mac (may belong to OTHER applications):"
ps -axo pid=,ppid=,rss=,comm= 2>/dev/null | awk '
  /com[.]apple[.]WebKit[.](WebContent|Networking|GPU)/ {
    print; n++; if (n >= 30) exit
  }
' || true
echo
echo "WARNING: Do NOT add all WebKit helper RSS to Messenger Native."
echo "Use Activity Monitor > View > All Processes and identify the actual"
echo "Messenger-related WebKit helpers. Record Memory (physical footprint)."
echo "No cache, login or user data was modified; no process was killed."