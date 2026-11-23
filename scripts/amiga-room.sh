#!/usr/bin/env bash
# Amiga 0.3.1 (and published 0.3.0 for comparison) curve again on a pattern with room. On Dev17 C04 stock alone read
# 81.3 % of a frame and Amiga's first instance 109.5 %, past the procedure's 100 % (CURVE_ROOM). Lists bank C's patterns
# (Part, steps 1-16 of T1-T8) and measures on the first Part 1 pattern with trigs on the curve tracks T1, T3, T6, T7 and
# none on the sample tracks T2 and T4, or on MEASURE=N. Twin 678843cc, rolled-back trials, nothing kept.
export PATH=$HOME/.cache/modwerk-local/node/bin:/usr/local/bin:/usr/bin:/bin
L=$HOME/.cache/modwerk-local/ot/rel-08; Q=$L/q; W=$HOME/modwerk/.wrangler; R=$W/ot-next
ds() { MODWERK_DEV_SOCKET=$Q/dev.sock timeout 60 python3 $R/scripts/device-send.py "$1"; }
memhex() { ds "mem:$1" | tr -d '\n '; }
st=$(timeout 30 node $R/scripts/device.mjs status --socket $Q/share.sock 2>&1)
echo "$st" | grep -q 678843cc || { echo "not on twin 678843cc, stopping"; echo "$st"; exit 2; }

ds "STOP w300 STOP w300 BANK w300 TRIG3 w300 TRIG2 w1200" > /dev/null
B=$((16#$(memhex 0x46c82456:4))); [ $B -eq $((0x40218860)) ] || { echo "not on bank C, stopping"; exit 2; }
mask() { memhex 0x$(printf %x $((B + ($1 - 1) * 0x8ed8 + ($2 - 1) * 0x91a + 6))):2; } # pattern track -> steps 1-16
M=$MEASURE
for p in $(seq 16); do
  part=$(memhex 0x$(printf %x $((B + (p - 1) * 0x8ed8 + 0x8e57))):1)
  row="C$(printf %02d $p) Part $((16#$part + 1)):"; for t in 1 2 3 4 5 6 7 8; do row="$row $(mask $p $t)"; done; echo "$row"
  if [ -z "$M" ] && [ $p -ne 2 ] && [ "$part" = "00" ] && [ "$(mask $p 2)$(mask $p 4)" = "00000000" ]; then
    full=1; for t in 1 3 6 7; do [ "$(mask $p $t)" = "0000" ] && full=0; done; [ $full = 1 ] && M=$p
  fi
done
[ -n "$M" ] || { echo "no such pattern: make one on Part 1 (grid recording, OCTATRACK_DRIVING.md) or name one with MEASURE=N"; exit 3; }
echo "measuring on C$(printf %02d $M)"

BASE="678843cc (base 0.8 development twin, main b5864cce7)"
SCENE="Dev17 C$(printf %02d $M) at 126 BPM, Part 1, trigs on T1/T3/T6/T7 and none on T2/T4 (masks in amiga-room.out), picks on empty C02; owner's MKII"
run() { # worktree package label [--write]
  ds "STOP w300 STOP w300 PATTERN+TRIG$M w800" > /dev/null
  cd "$W/$1" || return
  timeout 1800 node scripts/octatrack-price.mjs --socket $Q/dev.sock --share $Q/share.sock $4 --curve T1,T3,T6,T7 \
    --pick-pattern 2 --measure-pattern $M --limit 115 --base "$BASE" --scene "$SCENE" --out "$L/$3-room-price.json" "$2" > "$L/$3-room-price.log" 2>&1
  echo "[$(date +%T)] $3 exit $?"
  grep -vE '^\s*[0-9]+s:' "$L/$3-room-price.log" | tail -6 | cut -c1-320
}
run amiga-031 $L/pk/amiga-031.mwrm amiga-031 --write
run cost-record $L/pk/amiga-030.mwrm amiga-030
ds "STOP w300 STOP w300 PATTERN+TRIG4 w800" > /dev/null
echo done
