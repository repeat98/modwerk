#!/usr/bin/env bash
# Does Euclid 0.1.6 / Repitch 0.2.2 actually rest on twin 678843cc? Reads the "rests" sites while each is installed
# (rolled-back trial, nothing kept) and scans the project for what keeps them awake. 23 Nov 2026.
export PATH=$HOME/.cache/modwerk-local/node/bin:/usr/local/bin:/usr/bin:/bin
L=$HOME/.cache/modwerk-local/ot/rel-08; Q=$L/q; O=$L/restcheck; R=$HOME/modwerk/.wrangler/ot-next
mkdir -p $O; cd $R
ds() { MODWERK_DEV_SOCKET=$Q/dev.sock timeout 60 python3 $R/scripts/device-send.py "$1"; }
SITES="0x4000d562:6 0x4009c3d4:6 0x4009c4d4:6 0x4000406a:8 0x4000409e:8 0x40004100:8 0x40007d96:6"
reads() { for s in $SITES; do echo "$s $(ds mem:$s | tr -d "\n")"; done; }
st=$(timeout 30 node scripts/device.mjs status --socket $Q/share.sock 2>&1); echo "$st" > $O/status.txt
echo "$st" | grep -q 678843cc || { echo "not on twin 678843cc, stopping"; echo "$st"; exit 2; }
ds inventory > $O/inventory.txt
ds "STOP w300 STOP w300 PATTERN+TRIG4 w800" > /dev/null
reads > $O/stock.txt
# the project: every bank, working Parts 0-3 and saved 4-7: FX ids (bytes 0-15), track types (0x22-0x29), SRC SETUP (0x1da, 240)
: > $O/parts.txt
for b in $(seq 0 15); do for p in $(seq 0 7); do
  if [ $p -lt 4 ]; then a=$((0x400e21e0 + b*0x9b340 + 0x8ed80 + p*6322)); else a=$((0x400e21e0 + b*0x9b340 + 0x9504a + (p-4)*6322)); fi
  echo "$b $p head $(ds mem:0x$(printf %x $a):42 | tr -d "\n")" >> $O/parts.txt
  echo "$b $p setup $(ds mem:0x$(printf %x $((a+0x1da))):240 | tr -d "\n")" >> $O/parts.txt
done; done
echo "live $(ds mem:0x80000ec4:16 | tr -d "\n")" > $O/fxmap.txt
echo "map $(ds mem:0x100fe000:780 | tr -d "\n")" >> $O/fxmap.txt
for pkg in euclid repitch; do
  node scripts/device.mjs try $L/pk/$pkg.mwrm --seconds 600 --socket $Q/share.sock > $O/$pkg-trial.log 2>&1 & tp=$!
  for i in $(seq 240); do grep -q "slot running" $O/$pkg-trial.log && break; kill -0 $tp 2>/dev/null || break; sleep 0.5; done
  grep -q "slot running" $O/$pkg-trial.log || { echo "$pkg: trial did not start"; tail -5 $O/$pkg-trial.log; kill -INT $tp; wait $tp; continue; }
  ds inventory > $O/$pkg-inventory.txt
  reads > $O/$pkg-t0.txt
  ds "PLAY w6000" > /dev/null; reads > $O/$pkg-t6.txt
  sleep 6; reads > $O/$pkg-t12.txt; ds guard > $O/$pkg-guard.txt
  ds "STOP w2000" > /dev/null; reads > $O/$pkg-stopped.txt
  kill -INT $tp; wait $tp; grep -i -E "rolled back|error" $O/$pkg-trial.log | tail -2
done
reads > $O/after.txt; ds inventory > $O/inventory-after.txt
echo done
