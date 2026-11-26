#!/bin/bash
# Emulator: install SEQ, chord recipe open/close, remove rollback, crash log.
set -euo pipefail
ROOT="${1:-$(cd "$(dirname "$0")/.." && pwd)}"
PKG="${PKG:-/tmp/seq-fix17.mwrm}"
IMG="${HOME}/modwerk-builds/twin-dev-1014/MAIN.raw"
EMU="${EMU:-/private/tmp/seq-emu/ot_emu}"
DIR="${DIR:-/tmp/sqe-chord}"
cd "$ROOT"
test -f "$PKG" || { echo "missing $PKG"; exit 1; }
test -f "$EMU" || python3 scripts/octatrack-emulator/build.py -o "$EMU"
export MODWERK_SHARE_SOCKET="$DIR/share.sock"
export MODWERK_DEV_SOCKET="$DIR/dev.sock"
npm run -s device:emulator -- --image "$IMG" --emulator "$EMU" --dir "$DIR" --dsp -- bash -c '
  set -e
  SOCK='"$DIR/share.sock"'
  node scripts/device.mjs try '"$PKG"' --seconds 8 --accept --socket "$SOCK"
  node scripts/device.mjs do "T1+PAGE w600 +CUE w300 -CUE w300 T2 w200 T3 w200 T1+PAGE w800 T1+PAGE w800 w2000 screen" --socket "$SOCK"
  node scripts/device.mjs remove '"$PKG"' --socket "$SOCK" 2>&1 | tee /tmp/seq-emu-remove.log
  node scripts/device.mjs status --socket "$SOCK" | head -2
  node scripts/device.mjs do diaglog --socket "$SOCK" 2>&1 | rg "crash record" | tail -3 || true
'