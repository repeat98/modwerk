#!/usr/bin/env bash
# Waits until machab.sh and fair.sh have left the unit queue (at most 2 h), then commits their results to the handover
# branch and pushes it. Started detached (setsid nohup) on 23 Nov 2026 so it outlives the Windows session.
export PATH=$HOME/.cache/modwerk-local/node/bin:/usr/local/bin:/usr/bin:/bin
L=$HOME/.cache/modwerk-local/ot/rel-08; H=$HOME/modwerk/.wrangler/handover-1123; R=$HOME/modwerk/.wrangler/ot-next
T=${TASKS_DIR:?the Claude session tasks folder holding the two runs output}
for i in $(seq 120); do
  s=$(cd $R && timeout 60 node scripts/unit-queue.mjs status 2>/dev/null)
  echo "$s" | grep -q -E "machab.sh|fair rest A/B|cost batch: Amiga" || break
  sleep 60
done
mkdir -p $H/results/fair
cp $L/amiga-03*-price.log $L/amiga-03*-price.json $L/syntiz-01*-price.log $L/syntiz-01*-price.json $L/amiga-031-frame-cost.json $H/results/ 2>/dev/null
cp -r $L/fair/. $H/results/fair/ 2>/dev/null
cp $L/restcheck-1500/../restcheck-read.py $H/scripts/ 2>/dev/null
cp $T/bvgsebewk.output $H/results/machab.out 2>/dev/null
cp $T/bshkhoimw.output $H/results/fair.out 2>/dev/null
[ -f $H/results/fair/restcheck-read.txt ] || echo "fair.sh did not finish before collection (queue status at $(date +%T)): $(echo "$s" | head -3)" > $H/results/NOT-FINISHED.txt
cd $H && git add -A results scripts && git commit -q -m "Handover: results of the queued unit runs (Amiga/SYNTIZ procedure, fair Euclid/Repitch rest A/B)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git push -q origin HEAD:handover/octatrack-cost-batch-2026-11-23
echo "collected $(date +%T)"
