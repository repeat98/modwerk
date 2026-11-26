#!/bin/bash
# Fresh emulator per case: open SEQ, optional keys, remove module; expect rolled back.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PKG="${PKG:-/tmp/seq-fix17.mwrm}"
IMG="${MODWERK_OT_TWIN:-$HOME/modwerk-builds/twin-dev-1014}/MAIN.raw"
EMU="${MODWERK_OT_EMU:-/private/tmp/seq-emu/ot_emu}"
test -f "$PKG" || { echo "missing $PKG"; exit 1; }
test -f "$EMU" || python3 "$ROOT/scripts/octatrack-emulator/build.py" -o "$EMU"
run_case() {
  local name="$1" steps="$2"
  local dir="/tmp/seq-emu-$$-$RANDOM"
  export MODWERK_UNIT=emulator
  export MODWERK_SHARE_SOCKET="$dir/share.sock"
  export MODWERK_DEV_SOCKET="$dir/dev.sock"
  echo "=== $name ==="
  npm run -s device:emulator -- --image "$IMG" --emulator "$EMU" --dir "$dir" --settle 25 -- bash -c "
    set -e
    SOCK='$dir/share.sock'
    DEV='$dir/dev.sock'
    export MODWERK_UNIT=emulator MODWERK_SHARE_SOCKET=\$SOCK MODWERK_DEV_SOCKET=\$DEV
    node scripts/device.mjs try '$PKG' --seconds 120 --accept --socket \"\$SOCK\"
    sleep 2
    python3 -B scripts/device-send.py '$steps' || { echo FAIL steps; exit 1; }
  for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
      if node scripts/device.mjs remove '$PKG' --socket \"\$SOCK\" 2>&1 | tee /tmp/seq-emu-remove-last.log; then
        break
      fi
      grep -qi 'RUNTIME_UI_OPEN' /tmp/seq-emu-remove-last.log || exit 1
      python3 -B scripts/device-send.py w500
    done
    node scripts/device.mjs status --socket \"\$SOCK\" | head -3
    node scripts/device.mjs do diaglog --socket \"\$SOCK\" 2>&1 | rg 'crash record' | tail -2 || true
  " || { echo "CASE FAIL: $name"; return 1; }
  grep -qi 'rolled back\|generation' /tmp/seq-emu-remove-last.log || { echo "remove did not roll back: $name"; return 1; }
  if grep -qi 'needs-recovery\|RUNTIME_UI' /tmp/seq-emu-remove-last.log; then
    echo "needs-recovery: $name"
    return 1
  fi
  echo "PASS: $name"
}
cd "$ROOT"
OPEN='+T1 w80 +PAGE w80 -PAGE w300'
CLOSE_TRACK='+T1 w80 +PAGE w80 -PAGE w300 -T1 w300'
run_case 'NO close' "$OPEN +NO w80 -NO w800"
run_case 'toggle PAGE' "$OPEN $CLOSE_TRACK"
run_case 'CUE chord' "$OPEN +CUE w150 -CUE w150 +T2 w100 +T3 w100 -T2 -T3 w150 $CLOSE_TRACK"
run_case 'CUE NO' "$OPEN +CUE w150 -CUE w150 +NO w80 -NO w800"
echo "All emulator rollback cases passed."