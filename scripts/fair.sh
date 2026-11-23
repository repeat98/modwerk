#!/usr/bin/env bash
# Fair rest A/B for Euclid 0.1.5/0.1.6 and Repitch 0.2.1/0.2.2 on twin 678843cc (owner, 23 Nov 2026: Dev17 is a
# scrap project, use it freely). Makes the project name no Euclid (stock FILTER on bank A Part 1 T4 FX1) and puts
# every bank C Part 1 track on TSTR NORM (no AUTO, so no sample's TSMODE can keep Repitch awake). Nothing kept.
export PATH=$HOME/.cache/modwerk-local/node/bin:/usr/local/bin:/usr/bin:/bin
L=$HOME/.cache/modwerk-local/ot/rel-08; Q=$L/q; W=$HOME/modwerk/.wrangler; R=$W/ot-next; O=$L/fair; mkdir -p $O
ds() { MODWERK_DEV_SOCKET=$Q/dev.sock timeout 60 python3 $R/scripts/device-send.py "$1"; }
memhex() { ds "mem:$1" | tr -d '\n '; }
st=$(timeout 30 node $R/scripts/device.mjs status --socket $Q/share.sock 2>&1)
echo "$st" | grep -q 678843cc || { echo "not on twin 678843cc, stopping"; echo "$st"; exit 2; }

# 1. bank A, pattern A01, Part 1: T4 FX1 from Euclid to stock FILTER
ds "STOP w300 STOP w300 BANK w300 TRIG1 w300 TRIG1 w1200" > /dev/null
A=$((0x400e21e0)); bank=$(memhex 0x46c82456:4); echo "bank base now $bank"
part=$(memhex 0x$(printf %x $((A + 0x8e57))):1); echo "A01 Part byte $part"
[ "$part" = "00" ] || ds "PART+UP w800" > /dev/null
echo "pick: $(ds 'pick:T4:FX1:FILTER' | tr '\n' ' ' | cut -c1-200)"
fx=$(memhex 0x$(printf %x $((A + 0x8ed80))):16); echo "bank A working Part 1 FX: $fx"

# 2. bank C, pattern C04 (Part 1): every track TSTR AUTO -> NORM (SRC SETUP knob E), checked on the live lane byte
ds "BANK w300 TRIG3 w300 TRIG4 w1200" > /dev/null
echo "bank base now $(memhex 0x46c82456:4)"
for t in 1 2 3 4 5 6 7 8; do
  lane=0x$(printf %x $((0x80000510 + 48*(t-1) + 28)))
  for try in 1 2 3 4 5 6; do
    v=$(memhex $lane:1); [ "$v" = "02" ] && break
    if [ "$v" = "01" ] || [ "$v" = "00" ]; then step="encE+1"; else step="encE-1"; fi
    ds "NO w200 T$t w300 FUNC+SRC w600 $step w400 NO w300" > /dev/null
  done
  echo "T$t TSTR $(memhex $lane:1)"
done
ds "NO w300 NO w300 STOP w300 PATTERN+TRIG4 w800" > /dev/null

# 3. do the rests sites go back to stock now? (restcheck.sh: project scan + two trials with mem reads)
bash $L/restcheck.sh > $O/restcheck.out 2>&1; echo "restcheck exit $?"
cp -r $L/restcheck $O/restcheck-data
python3 $L/restcheck-read.py > $O/restcheck-read.txt 2>&1; grep -A5 -E "frame_hook|rate_gate|tstr_resolve|project names|REPITCH in" $O/restcheck-read.txt | head -40

# 4. at rest, old and new alternated twice, same scene (C04 playing)
cd $W/cost-record
for f in euclid-015 euclid euclid-015 euclid repitch-021 repitch repitch-021 repitch; do
  id=${f%%-*}; mkdir -p $L/pk/ab; cp $L/pk/$f.mwrm $L/pk/ab/$id.mwrm
  ds "STOP w300 STOP w300 PATTERN+TRIG4 w800" > /dev/null
  r=$(timeout 600 node scripts/octatrack-price.mjs --socket $Q/dev.sock --share $Q/share.sock $L/pk/ab/$id.mwrm 2>&1 | tee -a $O/ab.log | grep -E "^$id" | head -1 | cut -c29-160)
  echo "[$(date +%T)] $f: $r"
done
ds "STOP w300 STOP w300" > /dev/null

# 5. put bank C Part 1 back on TSTR AUTO: other sessions' records use Dev17 C04 as their reference scene
for t in 1 2 3 4 5 6 7 8; do
  lane=0x$(printf %x $((0x80000510 + 48*(t-1) + 28)))
  for try in 1 2 3 4 5 6; do
    v=$(memhex $lane:1); [ "$v" = "01" ] && break
    if [ "$v" = "00" ]; then step="encE+1"; else step="encE-1"; fi
    ds "NO w200 T$t w300 FUNC+SRC w600 $step w400 NO w300" > /dev/null
  done
  echo "T$t TSTR back $(memhex $lane:1)"
done
ds "NO w300 NO w300 STOP w300 PATTERN+TRIG4 w800" > /dev/null
echo done
