#!/usr/bin/env bash
# Amiga 0.3.1 / SYNTIZ 0.1.1 through the #2043 procedure (written into their worktrees, uncommitted), and the published
# 0.3.0 / 0.1.0 read the same way without writing, on twin 678843cc, Dev17 C04 (curve) and C02 (picks). Nothing kept.
export PATH=$HOME/.cache/modwerk-local/node/bin:/usr/local/bin:/usr/bin:/bin
L=$HOME/.cache/modwerk-local/ot/rel-08; Q=$L/q; W=$HOME/modwerk/.wrangler
st=$(timeout 30 node $W/ot-next/scripts/device.mjs status --socket $Q/share.sock 2>&1)
echo "$st" | grep -q 678843cc || { echo "not on twin 678843cc, stopping"; echo "$st"; exit 2; }
BASE="678843cc (base 0.8 development twin, main b5864cce7)"
SCENE="Dev17 C04 at 126 BPM, trigs on steps 1/5/9/13 of T1-T4, T6, T7 (T2 and T4 play samples), picks on empty C02, Part 1; owner's MKII"
run() { # worktree file label [--write]
  $L/ds "STOP w300 STOP w300 PATTERN+TRIG4 w800" 20 >/dev/null
  cd "$W/$1" || return
  timeout 1800 node scripts/octatrack-price.mjs --socket $Q/dev.sock --share $Q/share.sock $4 --curve T1,T3,T6,T7 \
    --pick-pattern 2 --measure-pattern 4 --limit 115 --base "$BASE" --scene "$SCENE" --out "$L/$3-price.json" "$2" > "$L/$3-price.log" 2>&1
  local code=$?
  echo "[$(date +%T)] $3 exit $code"
  grep -vE '^\s*[0-9]+s:' "$L/$3-price.log" | tail -6 | cut -c1-320
}
run amiga-031 $L/pk/amiga-031.mwrm amiga-031 --write
run cost-record $L/pk/amiga-030.mwrm amiga-030
run syntiz-011 $L/pk/syntiz-011.mwrm syntiz-011 --write
run cost-record $L/pk/syntiz-010.mwrm syntiz-010
$L/ds "STOP w300 STOP w300" 20 >/dev/null
echo done
