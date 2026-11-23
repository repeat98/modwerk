#!/usr/bin/env bash
# Repitch 0.2.1/0.2.2 rest check and at-rest A/B again, with bank C Part 1 really on TSTR NORM. fair.sh's TSTR step
# did nothing (HANDOVER.md, "Correction from the Mac"): SRC SETUP's TSTR ignores small encoder turns, and encE+-1 never
# moved it. Twin 678843cc, Dev17 (scrap project, owner 23 Nov 2026). Rolled-back trials, nothing kept; TSTR goes back
# to AUTO at the end. Repitch only: Euclid's fair result stands.
export PATH=$HOME/.cache/modwerk-local/node/bin:/usr/local/bin:/usr/bin:/bin
L=$HOME/.cache/modwerk-local/ot/rel-08; Q=$L/q; W=$HOME/modwerk/.wrangler; R=$W/ot-next; O=$L/fair-tstr; mkdir -p $O
ds() { MODWERK_DEV_SOCKET=$Q/dev.sock timeout 60 python3 $R/scripts/device-send.py "$1"; }
memhex() { ds "mem:$1" | tr -d '\n '; }
st=$(timeout 30 node $R/scripts/device.mjs status --socket $Q/share.sock 2>&1)
echo "$st" | grep -q 678843cc || { echo "not on twin 678843cc, stopping"; echo "$st"; exit 2; }

ds "STOP w300 STOP w300 BANK w300 TRIG3 w300 TRIG4 w1200" > /dev/null
B=$(memhex 0x46c82456:4); echo "bank base now $B"
[ "$B" = "40218860" ] || { echo "not on bank C (40218860), stopping"; exit 2; }
P1=$((0x40218860 + 0x8ed80)) # bank C, working Part 1
lane() { memhex 0x$(printf %x $((0x80000510 + 48 * ($1 - 1) + 28))):1; } # SETUP TSTR as rp_find reads it
partb() { # the working Part's TSTR byte, STATIC or FLEX (restcheck-read.py's offset)
  local ty=$((16#$(memhex 0x$(printf %x $((P1 + 0x22 + $1 - 1))):1)))
  [ $ty -le 1 ] && memhex 0x$(printf %x $((P1 + 0x1da + 30 * ($1 - 1) + 6 * ty + 4))):1 || echo "type $ty"
}
# TSTR values: 0 OFF, 1 AUTO, 2 NORM, 3 BEAT. Encoder E needs a large turn per step (OCTATRACK_DRIVING.md: seven encE+2
# did nothing, encE+40 went OFF to BEAT), so grow the turn until the value moves, shrink it when it jumps past.
setstr() { # track wanted
  local t=$1 want=$2 n=6 v nv d
  for try in $(seq 16); do
    v=$((16#$(lane $t))); [ $v -eq $want ] && return 0
    [ $v -lt $want ] && d="+$n" || d="-$n"
    ds "NO w200 T$t w300 FUNC+SRC w600 encE$d w400 NO w300" > /dev/null
    nv=$((16#$(lane $t))); echo "T$t encE$d: $v -> $nv" >> $O/tstr-steps.log
    if [ $nv -eq $v ]; then [ $n -lt 60 ] && n=$((n + 6)); elif [ $((nv - v)) -gt 1 ] || [ $((v - nv)) -gt 1 ]; then n=$((n > 6 ? n - 3 : 3)); fi
  done
  [ $((16#$(lane $t))) -eq $want ]
}

ok=1
for t in 1 2 3 4 5 6 7 8; do setstr $t 2 || ok=0; echo "T$t TSTR lane $(lane $t) Part $(partb $t)"; done
ds "NO w300 NO w300 STOP w300 PATTERN+TRIG4 w800" > /dev/null

if [ $ok = 1 ]; then
  # do rate_gate/pitch_gate go back to stock now? (restcheck.sh also runs Euclid; read only the Repitch rows)
  bash $L/restcheck.sh > $O/restcheck.out 2>&1; echo "restcheck exit $?"
  rm -rf $O/restcheck-data; cp -r $L/restcheck $O/restcheck-data
  python3 $L/restcheck-read.py > $O/restcheck-read.txt 2>&1; grep -A9 -E "^repitch (rate|pitch)_gate" $O/restcheck-read.txt
  # at rest, old and new alternated twice, same scene (C04 playing)
  cd $W/cost-record
  for f in repitch-021 repitch repitch-021 repitch; do
    mkdir -p $L/pk/ab; cp $L/pk/$f.mwrm $L/pk/ab/repitch.mwrm
    ds "STOP w300 STOP w300 PATTERN+TRIG4 w800" > /dev/null
    r=$(timeout 600 node scripts/octatrack-price.mjs --socket $Q/dev.sock --share $Q/share.sock $L/pk/ab/repitch.mwrm 2>&1 | tee -a $O/ab.log | grep -E "^repitch" | head -1 | cut -c29-160)
    echo "[$(date +%T)] $f: $r"
  done
  ds "STOP w300 STOP w300" > /dev/null
else
  echo "TSTR is not NORM on every track (tstr-steps.log): no rest check and no A/B, they would be inconclusive again"
fi

# put bank C Part 1 back on TSTR AUTO: other sessions' records use Dev17 C04 as their reference scene
for t in 1 2 3 4 5 6 7 8; do
  setstr $t 1 || echo "T$t NOT BACK ON AUTO: set SRC SETUP TSTR to AUTO by hand"
  echo "T$t TSTR back: lane $(lane $t) Part $(partb $t)"
done
ds "NO w300 NO w300 STOP w300 PATTERN+TRIG4 w800" > /dev/null
echo done
