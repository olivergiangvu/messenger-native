#!/bin/bash
# Read-only, time-series physical footprint profiler for Messenger Native on macOS.
# Output: CSV to stdout. Redirect to a file only if you want to store it.
# Bash 3.2 compatible (macOS).
set -u

usage() {
  echo "Usage: bash scripts/profile-memory-series.sh [--main PID] [--helper PID ...] [--samples 10] [--interval 60]"
  echo "Note: helpers are NOT automatically verified as belonging to Messenger."
}

valid_positive() {
  case "$1" in
    ""|*[!0-9]*) return 1 ;;
    *) [ "$1" -gt 0 ] ;;
  esac
}
MAIN_PID=""
HELPERS=""
SAMPLES=10
INTERVAL=60
while [ "$#" -gt 0 ]; do
  opt="$1"
  case "$opt" in
    --help|-h) usage; exit 0 ;;
    --main|--helper|--samples|--interval)
      shift
      if [ "$#" -eq 0 ] || ! valid_positive "$1"; then
        echo "Invalid positive integer for $opt" >&2; exit 2
      fi
      case "$opt" in
        --main) MAIN_PID="$1" ;;
        --helper) HELPERS="$HELPERS $1" ;;
        --samples) SAMPLES="$1" ;;
        --interval) INTERVAL="$1" ;;
      esac ;;
    *) usage >&2; exit 2 ;;
  esac
  shift
done

if [ "$(uname -s)" != "Darwin" ]; then
  echo "This profiler requires macOS." >&2
  exit 2
fi
if [ "$SAMPLES" -gt 30 ] || [ "$INTERVAL" -gt 600 ]; then
  echo "Maximum 30 samples and 600 second interval." >&2
  exit 2
fi
if [ -z "$MAIN_PID" ]; then
  for pid in $(pgrep -x Messenger 2>/dev/null || true); do
    executable=$(ps -p "$pid" -o command= 2>/dev/null || true)
    case "$executable" in
      *"/Messenger Native.app/Contents/MacOS/Messenger"*)
        MAIN_PID="$pid"; break ;;
    esac
  done
fi
if [ -z "$MAIN_PID" ] || ! kill -0 "$MAIN_PID" 2>/dev/null; then
  echo "Messenger Native main process was not found." >&2
  echo "Run: pgrep -fl Messenger ; then rerun with --main <PID>." >&2
  exit 1
fi
if ! command -v footprint >/dev/null 2>&1; then
  echo "macOS footprint command not found; unable to collect physical memory." >&2
  exit 1
fi

# Convert the exact phys_footprint field into MiB, not process RSS.
footprint_mb() {
  local pid="$1"
  footprint -p "$pid" 2>/dev/null | awk '
    $1 == "phys_footprint:" {
      n=$2 + 0; unit=$3
      if (unit == "KB") n /= 1024
      else if (unit == "GB") n *= 1024
      else if (unit == "B") n /= 1048576
      else if (unit != "MB") next
      printf "%.1f", n
      exit
    }'
}

sample_process() {
  local timestamp="$1" role="$2" pid="$3"
  local rss="" mem="" status="ok"
  if ! kill -0 "$pid" 2>/dev/null; then
    status="exited"
  else
    rss=$(ps -p "$pid" -o rss= 2>/dev/null | tr -d ' ' || true)
    mem=$(footprint_mb "$pid")
    if [ -z "$mem" ]; then status="footprint_unavailable"; fi
  fi
  printf '%s,%s,%s,%s,%s,%s\n' "$timestamp" "$role" "$pid" "$mem" "$rss" "$status"
}

echo "# Physical footprint time series. Does not confirm WebKit helper ownership." >&2
echo "# Do not sum unrelated WebKit helpers or compare RSS against footprint." >&2
echo "timestamp,role,pid,physical_footprint_mib,rss_kib,status"
i=1
while [ "$i" -le "$SAMPLES" ]; do
  now=$(date '+%Y-%m-%dT%H:%M:%S%z')
  sample_process "$now" "main" "$MAIN_PID"
  for pid in $HELPERS; do
    if [ "$pid" != "$MAIN_PID" ]; then sample_process "$now" "user_selected_webkit" "$pid"; fi
  done
  if [ "$i" -lt "$SAMPLES" ]; then sleep "$INTERVAL"; fi
  i=$((i + 1))
done
