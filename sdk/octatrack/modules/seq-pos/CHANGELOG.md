# Seq Pos changelog

## 0.1.0-experimental — docs note 2026-11-26 (MOP-275)

- Docs/evidence tip: honest peer LFO ratchet tip-gate matrix while dens
  USB parked — mop268 `sp_ui_shown` latch **PASS**; mop269 dens Open (old
  fixture); mop270 asymmetric dens recipe landed; mop271 dens USB
  **pending** (no invent PASS). Peer TEMPO/TSPD → SPOS
  ratchet/reverse/stage tip dig **blocked** until dens PASS or mop270
  latch-only fallback after verified-empty null. Stock PLAYHEAD march
  expected. Do **not** claim ratchet proven. No USB / Accept this tip.
  Evidence `peer-lfo-ratchet-tip-gates-mop275-2026-11-26.md`.

## 0.1.0-experimental — docs note 2026-11-26 (MOP-270)

- Docs/evidence tip: why mop258/269 dens A/B stayed null under remapped
  steps — TRIG1+TRIG16 loud fixtures cannot separate dens B vs C; LEVEL
  mute did not sparsify densA; UI latch (`sp_ui_shown` / toast) ≠ audible
  onset dens. Smallest separable dens recipe: asymmetric silent-end
  (TRIG1 only; steps 2–16 empty; densB ≥ 3× densA and densB ≥ 3× densC
  after empty-end preflight). Latch-only peer LFO ratchet fallback only
  after one verified-empty USB still nulls dens. **No** USB / Accept this
  tip; ratchet still blocked pending dens PASS or fallback. Evidence
  `dens-ab-fixture-tip-mop270-2026-11-26.md`.

## 0.1.0-experimental — docs note 2026-11-26 (MOP-269)

- Docs/evidence: Keep-safe Undo dens A/B reopen after mop268 (Jon ask) —
  STOPPED `sp_ui_shown[0]` stick 0 then 15 **reconfirmed**; mop258-class
  sparse dens **Open/null** (5.5/s A=B=C). Peer LFO ratchet still blocked;
  no Accept. Evidence `usb-dens-ab-reopen-open-mop269-2026-11-26.md`.

## 0.1.0-experimental — docs note 2026-11-26 (MOP-268)

- Docs/evidence: Keep-safe Undo USB peeks of mop267 `sp_ui_shown` latch —
  resolve like `sp_en` (`wordsPtr-0x28`); toast dest 0 vs 127 with `len=16`;
  **`sp_ui_shown[0]` sticks to 0 then 15** (**PASS**). Sample while STOPPED
  so `sp_map` PLAYHEAD length-learn does not grow `sp_len`. Dens parked
  (ask before reopen); no Accept. Evidence
  `usb-ui-shown-peeks-pass-mop268-2026-11-26.md`.

## 0.1.0-experimental — tip surface 2026-11-26 (MOP-267)

- Tip dig + glue after mop266 Open: remapped `ev_ui_step` return has no
  stock SRAM home (wide scan null); LEDs follow getter `d0`. Battery
  `CUR_TRACK` `0x100b14cc` outside USB MEM. Tip fix in
  `step_ptr_track_reg_map`: latch remapped step into `sp_ui_shown[track]`;
  master `-1` via live `0x80000000`; never write `PLAYHEAD` /
  `0x800065b5`. Native `unit.s` / `runtime.json` unchanged. **No** USB
  Accept this pass; dens parked. Evidence
  `panel-led-surface-tip-mop267-2026-11-26.md`.

## 0.1.0-experimental — docs note 2026-11-26 (MOP-266)

- Docs/evidence: Keep-safe Undo panel LED / `ev_ui_step` getter peeks after
  #232 / mop265 tip — tip wire + mop265 `CUR_TRACK` package + toast/step-map
  0 vs 127 **PASS**; panel/getter stick still **Open** (correct metrics;
  `0x800065b5` ignored); dens parked; no Accept. Evidence
  `usb-panel-led-peeks-open-mop266-2026-11-26.md`.

## 0.1.0-experimental — tip dig + master LED glue 2026-11-26 (MOP-265)

- Tip dig: `0x800065b5` is the stock master-step word (`0x800065b4`) low
  byte — remappers do not write it; mop263/264 peeks marching that byte
  cannot prove LED stick. UI LEDs follow `0x4009b2b0` return value.
  MOP-262 glue left unsigned track `> 7`, so master caller `-1` never
  reached `sp_map`. Tip fix in `step_ptr_track_reg_map`: master `-1` →
  `CUR_TRACK` `0x100b14cc` when audio `0..7`, then `sp_map`; MIDI leave;
  still never write `PLAYHEAD` or `0x800065b5`. Native `unit.s` /
  `runtime.json` unchanged. **No** USB Accept this pass; dens stay
  parked. Evidence `led-stick-tip-dig-mop265-2026-11-26.md`.

## 0.1.0-experimental — tip wire 2026-11-26 (MOP-262)

- Tip (docs / base / machine-ports): base owns `ev_ui_step` at
  `0x4009b2b0` (mirror `ev_audio_step`). Seq Pos subscribes order **50**
  through `machine-ports.json` glue (`sp_ev_ui_step` → existing `sp_map`;
  audio tracks 0..7 only; master/MIDI leave stock). Native `unit.s` /
  `runtime.json` **unchanged** (catalog pin / version gate). Play Modes
  migrates `pm_step_getter` → order **40** through machine-ports
  (`pm_show_entry` glue). **Never** write remapped step into `PLAYHEAD`
  `0x800064d0[t]`. No private Detour-only path. Tip assemble / registry
  only — **no** USB Accept/Keep; dens stay parked; LED USB peeks deferred.
  Evidence `base-ev-ui-step-impl-mop262-2026-11-26.md`.

## 0.1.0-experimental — docs note 2026-11-26 (MOP-261)

- Tip investigation only: pin LED/UI playhead call site
  `0x4009b2b0` (Play Modes `pm_step_getter`) and propose smallest next
  firmware change = base-owned `ev_ui_step` (mirror `ev_audio_step`;
  Play Modes 40 → SPOS 50 via `sp_map`). Reject writing remapped step
  into stock `PLAYHEAD` `0x800064d0`. **No** `unit.s` / Detour / runtime
  wiring this pass — private Detour alone hard-conflicts with Play
  Modes dual-install; full remap needs owner-reviewed base event.
  Dens digs stay parked (mop260). No Accept invent. Evidence
  `playhead-led-firmware-dig-mop261-2026-11-26.md`.
- Also: correct stale `tests.qualification.sourceSha256` fingerprint to
  the current native inventory hash (`c09df15a…`) — native `unit.s` /
  runtime unchanged; mop248 pin `ddd42e78…` never matched
  `moduleNativeSourceSha256` on this tree. Not a remeasure / not new
  hardware evidence.

## 0.1.0-experimental — docs note 2026-11-26 (MOP-260)

- Tip-docs hub honesty after Jon decision: park dens digs; treat SPOS
  playhead remapping (audible dens + LED) as a **0.1.x firmware gap**.
  Cite mop258/259 dens Open + stock PLAYHEAD marches = remapper does
  **not** own audible/LED playhead. Full LFO ratchet/reverse/stage
  through pattern **blocked** until firmware LED/playhead remap under
  address mode. Catalog already **PINNED** (mop248) — honesty only. No
  USB dens re-dig; no Accept invent. Evidence
  `publishability-gates-hub-mop260-2026-11-26.md`.

## 0.1.0-experimental — docs / evidence note 2026-11-26 (MOP-259)

- Documentation / evidence only: stronger sparse TRIG1-only playhead A/B
  Undo dig after mop258 — grid REC clear unverified; onset-density still
  **Open** (dens null). Toast/step-map peeks observed. No Accept. Evidence
  `usb-playhead-sparse-trig1-open-mop259-2026-11-26.md`. ASK JON PC.

## 0.1.0-experimental — docs / evidence note 2026-11-26 (MOP-258)

- Documentation / evidence only: Keep-safe Undo address-mode playhead A/B
  dig on tip twin — toast-bind + step-map peeks observed (SPOS 0→step 0,
  127→step 15, `len=16`); sparse onset-density playhead motion **Open**
  (dens null). Jump-colour unchanged (**Unproven/waived** mop243). No
  Accept; catalog already pinned mop248. Evidence
  `usb-playhead-ab-open-mop258-2026-11-26.md`. ASK JON PC after twin.

## 0.1.0-experimental — 2026-11-25 (MOP-248 catalog pin)

- First Modwerk catalog release: promote `sdk/drafts/seq-pos/` →
  `sdk/octabam/modules/seq-pos/`; pin `0.1.0-experimental` in
  `sdk/catalog.json` (Jon AUTHORIZES; no new semver). Cite Keep Accept +
  reboot mop245/247 (`97de37e6…`); jump-colour remains **Unproven/waived**
  (mop243 — not Proven); qual place mop197. Community release notes at
  `src/community/module-changelogs/seq-pos.json`. Evidence
  `catalog-pin-mop248-2026-11-25.md`. No Accept invent; no jump-colour
  Proven invent.

## 0.1.0-experimental — docs / evidence note 2026-11-25 (MOP-247)

- Documentation / evidence only: post-PC reboot persistence **PASS** after
  mop245 Keep Accept — tip24 `eb667962…`; inventory **26** with `SEQ POS`
  (`f7bb3258`); companions preserved (Mute Modes + Screen Off + Micro
  Timing + tip24 set); catalog still **SHUT** at that stamp; qual pin /
  jump-colour invent none. Evidence `usb-hw-mop245-keep-2026-11-25.md`
  (mop244 step 7 / mop230-reboot pattern). Catalog pin: mop248.

## 0.1.0-experimental — docs / evidence note 2026-11-25 (MOP-245)

- Documentation / evidence only: Jon-authorized Keep Accept **PASS** on
  tip24 — tip package `97de37e698ac88a7…` / 1224 B; self-test PASS;
  inventory 25→26 with `SEQ POS`; companions preserved (incl. Micro
  Timing); card save true; reboot persistence completed **PASS** mop247;
  catalog still **SHUT**; no Proven invent beyond observed. Evidence
  `usb-hw-mop245-keep-2026-11-25.md` (mop244 protocol).

## 0.1.0-experimental — docs note 2026-11-25 (MOP-244)

- Tip-docs Keep of Seq Pos publish-gate honesty + authorized Keep USB
  protocol (pattern: Micro Timing mop228): cite Proven gates from mop242;
  jump-colour **Unproven/waived** (mop243 / #211); Keep still **Open** —
  needs Jon Accept / `device_keep` auth before USB; tip must **not**
  Accept; catalog still **SHUT**; no twin / Proven invent. Hub MOP-244;
  evidence `keep-publish-gate-mop244-2026-11-25.md`,
  `protocol-mop244-keep-usb-2026-11-25.md`,
  `publishability-gates-hub-mop244-2026-11-25.md`. (USB Accept: mop245.)

## 0.1.0-experimental — docs note 2026-11-25 (MOP-243)

- Tip-docs hub honesty after Jon owner waive of jump-colour publish gate:
  jump-colour **Unproven/waived** (not Proven; mop219 Open fixture
  retained; cite mop227/mop242 decision path); remapper+words-move /
  stress / SETUP / Play Modes / memory **944** / toast / `sp_len` /
  `tests.qualification` Placed unchanged; remaining Keep / qual / catalog
  pin path honest; catalog still **SHUT** until Keep/qual/pin authorized
  separately; tip-only; no new USB fixture; no Accept / Proven invent.
  Hub MOP-243; evidence
  `publishability-gates-hub-mop243-2026-11-25.md`. Historical; current
  checklist MOP-244.

## 0.1.0-experimental — docs note 2026-11-25 (MOP-242)

- Tip-docs hub honesty after MT distraction: restate publishability gates
  vs catalog **SHUT** unchanged from mop227 — remapper+words-move
  **Proven**; stress **Proven**; SETUP **Proven**; Play Modes runtime
  **Proven**; memory tip-wired **944**; FUNC+TRACK toast **Proven**
  (mop196); `sp_len` default **16** **Proven** (mop202/203);
  `tests.qualification` **Placed** (mop197); jump-colour still **Open**
  (`slice-strt-mute-isolation` — mop223 protocol **consumed**;
  `shared-Flex-attr-lock`; mop209 remapper-colour **not** reached);
  **no** tip-named next USB lever — tip default **park**; Jon decision for
  waive / authorize distinct sample / authorize new named protocol. No
  twin / Accept / force-list; no invented Proven. Hub MOP-242; evidence
  `publishability-gates-hub-mop242-2026-11-25.md`. Historical; current
  checklist MOP-244.

## 0.1.0-experimental — docs note 2026-11-25 (MOP-241)

- Tip-docs closeout honesty: octamod / qualification.example no longer claim
  mop209 SAMPLE/PTCH mute-isolation tip is **pending USB** — cite mop211 /
  mop216 / mop219 / mop223 consumed Open path; mop227 remains current hub;
  jump-colour still **Open**; catalog still **SHUT**; no Accept / Proven
  invent. Evidence `publish-closeout-honesty-mop241-2026-11-25.md`.

## 0.1.0-experimental — docs note 2026-11-25 (MOP-227)

- Tip-docs hub honesty after mop219 SLICE/STRT USB Open: consolidate
  remaining publishability gates vs catalog **SHUT** — remapper+words-move
  **Proven**; stress **Proven**; SETUP **Proven**; Play Modes runtime
  **Proven**; memory tip-wired **944**; FUNC+TRACK toast **Proven**
  (mop196); `sp_len` default **16** **Proven** (mop202/203);
  `tests.qualification` **Placed** (mop197); jump-colour still **Open**
  (`slice-strt-mute-isolation` — mop223 protocol **consumed**;
  `shared-Flex-attr-lock`; mop209 remapper-colour **not** reached);
  **no** tip-named next USB lever (owner decision unblock only). No twin /
  Accept / force-list; no invented Proven. Hub MOP-227; evidence
  `publishability-gates-hub-mop227-2026-11-25.md`.

## 0.1.0-experimental — docs note 2026-11-25 (MOP-224)

- Tip-docs hub honesty after mop216 jump-colour dead-end: consolidate
  remaining publishability gates vs catalog **SHUT** — remapper+words-move
  **Proven**; stress **Proven**; SETUP **Proven**; Play Modes runtime
  **Proven**; memory tip-wired **944**; FUNC+TRACK toast **Proven**
  (mop196); `sp_len` default **16** **Proven** (mop202/203);
  `tests.qualification` **Placed** (mop197); jump-colour still **Open**
  (`shared-Flex-attr-lock`; SLICE/STRT exit). No twin / Accept /
  force-list; no invented Proven. Hub MOP-224; evidence
  `publishability-gates-hub-mop224-2026-11-25.md`.

## 0.1.0-experimental — docs note 2026-11-25 (MOP-223)

- Tip protocol after mop216 `shared-Flex-attr-lock` dead-end: land Keep-safe
  USB recipe for **SLICE** first vs last (preferred; STRT PLAYBACK p-lock on
  multi-slice Flex/Static) or **STRT** min vs max (long sample fallback) +
  mandatory mute-isolation S0/S15 before toast C/D. Not SLIC / slice-num.
  Refuse LEVEL/filter / PTCH re-runs. Jump-colour still **Open**; catalog
  **SHUT**. No twin / Accept / force-list; no invented Proven. Hub MOP-223;
  evidence `jump-colour-slice-fixture-tip-mop223-2026-11-25.md`.

## 0.1.0-experimental — docs note 2026-11-25 (MOP-216)

- Tip honesty after mop211 mute-isolation fail (S0≈S15; C/D aborted):
  declare fixture dead-end class **`shared-Flex-attr-lock`** (LEVEL/filter
  + PTCH on shared Flex one-shot exhausted; SAMPLE-slot-per-trig unavailable
  on Flex). mop209 remapper-colour dead-end (S0≠S15 then C≈D) **not**
  reached. One concrete next USB lever: **SLICE** first vs last (or STRT
  min vs max) on a multi-slice / long sample after Jon loads it. Jump-colour
  still **Open**; catalog **SHUT**. No twin / Accept / force-list; no
  invented Proven. Hub MOP-216; evidence
  `jump-colour-deadend-tip-mop216-2026-11-25.md`. Protocol tip: MOP-223.
  Current hub honesty: MOP-224.

## 0.1.0-experimental — docs note 2026-11-25 (MOP-211)

- Keep-safe USB SAMPLE/PTCH dig after mop209 tip: tip remapper + dial-max
  **37**; extreme PTCH TRIG1/− vs TRIG16/+; mute-isolation **S0≈S15**
  (envCorr **0.99999**) → abort before SPOS C/D; jump-colour still
  **Open** (fixture); remapper OK. Undo `[]`; no Accept; catalog
  **SHUT**. ASK JON PC. Evidence
  `usb-jump-colour-open-mop211-2026-11-25.md`. Dead-end tip: MOP-216.

## 0.1.0-experimental — docs note 2026-11-25 (MOP-209)

- Tip dig after mop203 USB Open (`sp_len=16` + toast 0/127 bound; C≈D
  envCorr **0.99969**): LEVEL/filter fixture **exhausted**; remapper OK;
  stronger next USB = SAMPLE-slot or extreme PTCH bodies on step 0 vs
  len−1 plus mandatory stock mute-isolation S0/S15 preflight; dead-end
  class if S0≠S15 but C≈D. Jump-colour still **Open**; catalog **SHUT**.
  Hub MOP-209; evidence
  `jump-colour-fixture-tip-mop209-2026-11-25.md`. No twin / Accept /
  force-list; no invented Proven. USB consumer: MOP-211.

## 0.1.0-experimental — docs note 2026-11-25 (MOP-203)

- Keep-safe USB jump-colour re-prove after mop202 tip (#172): tip twin +
  package `97de37e6…`; toast-bind `T1 SPOS 0`/`127` both bound; peek
  `sp_len[0]=16` (mop202 `.data` live); engineered TRIG locks; WAV C≈D
  envCorr **0.99969** — jump-colour still **Open** (fixture/sample
  non-separation; remapper OK). Undo `[]`; no Accept; catalog **SHUT**.
  ASK JON PC. Hub MOP-203; evidence
  `usb-jump-colour-open-mop203-2026-11-25.md`.

## 0.1.0-experimental — tip wire 2026-11-25 (MOP-202)

- Tip wire after mop201 USB dig (`sp_len[0]=0` → remapper follow): move
  `sp_len` into `.data` with default **16** (trig-prob pattern; no
  site-event for `sp_dest_audio_init`); `sp_on_store` / `sp_level` ensure
  len when still 0. Tip package image **892** + bss **52** = **944**.
  Remapper / dual / contribute / `module_key`/`module_enc` unchanged.
  Jump-colour still **Open** (USB re-prove mop203). Catalog **SHUT**. Hub
  MOP-202; evidence `sp-len-init-tip-mop202-2026-11-25.md`. No Accept /
  force-list; no invented Proven.

## 0.1.0-experimental — docs note 2026-11-25 (MOP-201)

- Keep-safe USB engineered jump-colour fixture after mop200 tip stall: tip
  twin tip remapper + tip dual; TRIG1 vs TRIG16 LEVEL/filter locks;
  toast-bind `T1 SPOS 127` bound / `0` partial; peek `sp_len[0]=0` (USB BSS
  never got init default 16 → `sp_map` follows stock); WAV C≈D envCorr
  **0.99977** — jump-colour still **Open**. Undo `[]`; no Accept; catalog
  **SHUT**. ASK JON PC. Hub MOP-201; evidence
  `usb-jump-colour-open-mop201-2026-11-25.md`.

## 0.1.0-experimental — docs note 2026-11-25 (MOP-200)

- Tip dig after mop199 USB Open (C≈D envCorr ≈1; words moved): remapper path
  found (Play Modes 40 → SPOS 50 `sp_ev_audio_step` → `sp_map`); **no** clear
  code fix — tip remapper Proven; stall = fixture/project step-body
  non-separation. Jump-colour still **Open**; catalog **SHUT**. Next USB
  fixture: engineered distinct steps 0 vs len−1, toast-bind `Tn SPOS 0` /
  `127`, peek `sp_len`. Hub MOP-200; evidence
  `jump-colour-tip-dig-mop200-2026-11-25.md`. No twin / Accept / force-list.
  Later USB mop201 peeked `sp_len=0`.

## 0.1.0-experimental — docs note 2026-11-25 (MOP-199)

- Keep-safe USB jump-colour dig after mop197/mop198: tip twin tip remapper + tip
  dual; WAV C (SPOS low) vs D (SPOS high) bodies **indistinguishable**
  (envCorr ≈1; peakΔ≈0) while words move — jump-colour still **Open**.
  Undo `[]`; no Accept; catalog **SHUT**. ASK JON PC. Hub MOP-199; evidence
  `usb-jump-colour-open-mop199-2026-11-25.md`.

## 0.1.0-experimental — docs note 2026-11-25 (MOP-198)

- Tip-docs hub sync after mop197 `tests.qualification` **Placed** (#167) +
  mop196 FUNC+TRACK toast USB **Proven** (#166): catalog-gate + remaining-gate
  tables now show remapper+words-move **Proven** (mop167/184); stress ≥60 s
  **Proven** (mop181); SETUP PMTR **Proven** (mop172); Play Modes Detours →
  runtime **Proven** (tip #158 + USB #159; published 0.1.1 `.mwrm` still
  Detours / `lagsBehind`); memory tip-wired **908** (mop192 **372** lineage);
  toast **Proven** (mop196); `tests.qualification` **Placed** (mop197);
  jump-colour still **Open** (mop157; later mop199 dig Open) blocking catalog;
  catalog still **SHUT**. Hub MOP-198; evidence `catalog-gate-mop83-2026-11-24.md`
  (+ cross-links). No USB / Accept / force-list; no invented readiness.

## 0.1.0-experimental — docs note 2026-11-25 (MOP-197)

- Tip place `tests.qualification` (mop176 §G) after toast USB Proven (#166)
  + memory tip-wired **908** (mop192 **372** lineage): complete ColdFire
  object in example + manifest; publication parse OK; toast media
  `otUi.shows` fixed to `controls`. Catalog still **SHUT** (jump-colour
  gap; drafts-only). Keep tip24 free; no Accept. Hub MOP-197; evidence
  `qualification-place-mop197-2026-11-25.md`.

## 0.1.0-experimental — docs note 2026-11-25 (MOP-196)

- Keep-safe USB re-prove after tip wire (#165 / `8816abca1`): FUNC+track-pad
  (T1)+LEVEL → toast **`T1 SPOS 127`**; T1+FUNC+NO → **`T1 SPOS OFF`**.
  Publication PNGs `ot-toast-spos-nn.png` / `ot-toast-spos-off.png` +
  `capture.json` / `octamod.module.json` media provenance. TRACK page
  compare stays AMP SETUP (mop185). Undo `[]`; no Accept; catalog **SHUT**.
  ASK JON PC. Hub MOP-196; evidence `usb-toasts-prove-mop196-2026-11-25.md`.

## 0.1.0-experimental — tip wire 2026-11-25 (MOP-195)

- Tip toast wire after mop194 source stall: port `sp_level` / `sp_off` /
  `sp_toast` from archive `unit.full.s` into linked `unit.s`; add
  `sp_module_key` / `sp_module_enc` (trig-prob TRACK+LEVEL pattern); wire
  `runtime.json` `module_key` + `module_enc`. Tip nm shows toast symbols;
  package image **848** + bss **60** = **908**. USB toast pages re-proved
  by MOP-196. Catalog still **SHUT**. Hub MOP-195; evidence
  `toast-tip-wire-mop195-2026-11-25.md`. No Accept / force-list.

## 0.1.0-experimental — docs note 2026-11-25 (MOP-194)

- Tip-only toast **alt stall** after mop175/185 key-order USB misses: built
  `unit.s` nm lacks `sp_level` / `sp_off` / `sp_toast`; archive
  `unit.full.s` has toast builders but is not linked; `runtime.json` has no
  module_key. Toast remains **Open/miss** / stalled at source; catalog
  still **SHUT**. Keep tip24; no twin / Accept. Hub MOP-194; evidence
  `usb-toasts-alt-stall-mop194-2026-11-24.md`. Closed by MOP-195 tip wire.

## 0.1.0-experimental — docs note 2026-11-25 (MOP-193)

- Tip-docs hub sync after mop191 qualification owner fill (#161) + mop192
  measured memory **372** sharedBytes (#162): catalog-gate + remaining-gate
  tables now show remapper+words-move **Proven** (mop167/184); stress ≥60 s
  **Proven** (mop181); SETUP PMTR **Proven** (mop172); Play Modes Detours →
  runtime **Proven** (tip #158 + USB #159; published 0.1.1 `.mwrm` still
  Detours / `lagsBehind`); memory **372** **Proven** (mop192); qualification
  **Owner fill** + memory filled in example (mop191 + mop192);
  `tests.qualification` **absent** pending toast (mop176 §G); toast
  **Open/miss** (mop175 + mop185; later mop194 source stall); catalog still
  **SHUT**. Hub MOP-193; evidence `catalog-gate-mop83-2026-11-24.md`
  (+ cross-links). No USB / Accept / force-list; no invented readiness.

## 0.1.0-experimental — docs note 2026-11-25 (MOP-192)

- Tip-only measured memory dig (mop176 §D) after mop191 null memory:
  linked USB tip remapper package image **336** + bss **36** = **372**
  sharedBytes; `nm` BSS regions filled in `qualification.example.json`;
  Detours omitted (sites 0); `resources.storage` **372** / static;
  `tests.qualification` still **absent**; toast **Open/miss**; catalog
  still **SHUT**. Hub MOP-192; evidence
  `qualification-memory-mop192-2026-11-24.md`. Keep tip24; no twin /
  Accept / force-list; no invented integers.

## 0.1.0-experimental — docs note 2026-11-25 (MOP-191)

- Tip-docs qualification **owner fill** after mop186 stub (Jon push):
  `qualification.example.json` cycles **752**/**4790** kept; hardware →
  QLR-shaped functional from landed digs (mop157/167/172/184/188/189);
  `imageSha256` = mop172 SETUP OS image; memory **null** (later mop192);
  `tests.qualification` still **absent**; Detours **Proven** (mop188/189);
  toast **Open/miss** (mop175/185); catalog still **SHUT**. Hub MOP-191;
  evidence `qualification-owner-fill-mop191-2026-11-24.md`. No USB /
  Accept / force-list; Keep tip24 free; no invented memory or toast pass.

## 0.1.0-experimental — docs note 2026-11-24 (MOP-190)

- Tip-docs hub sync after mop188 Play Modes Detours → `runtime.json` tip
  (#158) + mop189 USB dual-install **Proven** (#159): catalog-gate +
  remaining-gate tables now show remapper+words-move **Proven**
  (mop167/184); stress ≥60 s **Proven** (mop181); SETUP PMTR **Proven**
  (mop172); Play Modes Detours → runtime **Proven** (tip #158 + USB #159;
  published 0.1.1 `.mwrm` still Detours / `lagsBehind`); toast
  **Open/miss** (mop175 + mop185); qualification then **Partial stub** /
  pending owner (mop186; later MOP-191 owner fill); catalog still
  **SHUT**. Hub MOP-190 (historical; current MOP-193); evidence
  `catalog-gate-mop83-2026-11-24.md` (+ cross-links). No USB / Accept /
  force-list; no invented readiness.

## 0.1.0-experimental — docs note 2026-11-24 (MOP-189)

- Keep-safe USB Undo dual-install verify after Play Modes 0.2.1 tip
  (#158 / `96c633d09`): tip twin `775d9322…` tip dual; source-built PM
  0.2.1 `runtime.json` (15998 B) + draft SEQ POS; inventory dual;
  remapper `4ef940ac7942`; dial/PMTR **37**; words unique **25** /
  afterStore **35664**; runtime path **live**; Undo `[]`; ASK JON PC; no
  Accept. Evidence `usb-playmodes-dual-mop189-2026-11-24.md`. Catalog SHUT.

## 0.1.0-experimental — docs note 2026-11-24 (MOP-187)

- Tip-docs hub sync after mop185 FUNC+TRACK toast USB TRACK-held re-probe
  miss + mop186 qualification stub fill: catalog-gate + remaining-gate
  tables then showed remapper+words-move **Proven** (mop167/184); stress
  ≥60 s **Proven** (mop181); SETUP PMTR **Proven** (mop172); toast
  **Open/miss** (mop175 + mop185); Detours → `runtime.json` **Stalled**
  (mop183; later tip #158 / USB #159); qualification **Partial stub** /
  `tests.qualification` **pending owner** (mop186); catalog still
  **SHUT**. Hub MOP-187 (historical; current MOP-193); evidence
  `catalog-gate-mop83-2026-11-24.md` (+ cross-links). No USB / Accept /
  force-list; no invented readiness.

## 0.1.0-experimental — docs note 2026-11-24 (MOP-185)

- Keep-safe FUNC+TRACK toast USB re-probe after mop175 miss: tip twin
  `775d9322…` tip dual; hold **T1+FUNC+TRACK**+LEVEL → **AMP SETUP** (no
  `Tn SPOS nn`); +NO → **RELOAD PAGE** (no `Tn SPOS OFF`); mop175-shaped
  no-TRACK compare still SRC/LEV / DISARM ALL; Undo `[]`; ASK JON PC; no
  Accept. Evidence `usb-toasts-reprobe-mop185-2026-11-24.md`. Catalog SHUT.

## 0.1.0-experimental — docs note 2026-11-24 (MOP-186)

- Tip: fill `qualification.example.json` ColdFire cycles from mop179/181
  (`performance.json` worstCase/budget **752**/**4790**); compute
  `sourceSha256`; memory null; hardware **pending**; `tests.qualification`
  still **absent** (pending owner). Remaining-gate tables: Detours
  **Stalled** (#154); words-move **Proven** (#153); stress **Proven**
  (#152); toast USB **miss** (mop185). Catalog **SHUT**. Evidence
  `qualification-fill-mop186-2026-11-24.md`. No USB / Accept / force-list.

## 0.1.0-experimental — docs note 2026-11-24 (MOP-188)

- Owner-authorized tip: Play Modes **0.2.1** lands `runtime.json`
  (`ev_audio_step` → `pm_ev_audio_step` order 40) + owner approval
  (mop183 recipe). Gate **Tip landed**; published 0.1.1 `.mwrm` still
  Detours (`lagsBehind`); USB Undo dual-install verify follows tip.
  Catalog **SHUT**. Evidence `playmodes-runtime-mop188-2026-11-24.md`.
  No Accept / lifecycle / force-list.

## 0.1.0-experimental — docs note 2026-11-24 (MOP-183)

- Tip (honest stall): exact Play Modes Detours → `runtime.json` recipe for
  the SPOS-conflicting audio-step site (`pm_audio_step` / `0x400a2d6a`,
  MOP-102 body). Landing source needs a greater Play Modes version + owner
  `playmodes-build-approval.json` (tip cannot invent). Gate **Stalled**;
  published 0.1.1 `.mwrm` still Detours. mop181 stress stays **Proven
  REACHED**; mop184 words-move **Proven**. Catalog **SHUT**. Hub MOP-183;
  evidence `playmodes-runtime-mop183-2026-11-24.md`. No USB / Accept /
  force-list.

## 0.1.0-experimental — docs note 2026-11-24 (MOP-184)

- Keep-safe dual-install words-move dig (alt after mop169 freeze): tip twin
  `775d9322…` remapper `4ef940ac7942`; DEP/SPD max + mid-PLAY wiggle → T1
  unique **33** (PASS); FUNC+TRACK+LEVEL hold also wrote words; Undo `[]`;
  ASK JON PC; no Accept. Evidence `usb-words-move-mop184-2026-11-24.md`.
  Catalog SHUT.

## 0.1.0-experimental — docs note 2026-11-24 (MOP-181)

- Keep-safe ≥60 s stress re-run (no Part `callAsMain`): ot_emu
  **170887 / 170887** frames (**62.0** s) **REACHED**; MIDI queue 0;
  hangs 0; dropped 0; Keep tip24; no twin / Accept. Evidence
  `usb-stress-mop181-2026-11-24.md`; `performance.json` stress filled.
  Catalog SHUT.

## 0.1.0-experimental — docs note 2026-11-24 (MOP-182)

- Tip-docs hub sync after mop179 cycles measured **752** / load **287.8** µs
  / stress **incomplete**: catalog-gate + remaining-gate tables then showed
  cycles **Partial** (measured+load filled; ≥60 s soak still open at that
  stamp — closed by mop181); words-move / qualification / toast pages still
  open; catalog still **SHUT**. Hub MOP-182 (historical; current MOP-190);
  evidence `catalog-gate-mop83-2026-11-24.md` (+ cross-links). No USB /
  Accept / force-list; no invented readiness.

## 0.1.0-experimental — docs note 2026-11-24 (MOP-179)

- Keep-safe measured / load / stress dig (mop170): ot_emu PC-watch worst
  **752** (matches static); CF METER page-2 load 287.8/287.8 µs idle 0;
  stress ILLEGAL ~30.8 s (not ≥60 s REACHED — closed by mop181 without
  Part); Undo `[]`; Keep tip24 after Jon PC; no Accept. Evidence
  `usb-cycles-mop179-2026-11-24.md`; `performance.json` filled. Catalog
  SHUT.

## 0.1.0-experimental — docs note 2026-11-24 (MOP-180)

- Tip-docs hub sync after mop178 cycles static **752**: catalog-gate +
  remaining-gate tables then showed cycles **Partial** (`static=752`;
  measured/load/stress still null at that stamp); words-move /
  qualification / toast pages still open; catalog still **SHUT**. Hub
  MOP-180 (historical; current MOP-190); evidence
  `catalog-gate-mop83-2026-11-24.md` (+ cross-links). No USB / Accept /
  force-list; no invented readiness.

## 0.1.0-experimental — docs note 2026-11-24 (MOP-178)

- Keep-safe USB cycles dig (mop170): tip twin `775d9322…` tip dual;
  remapper `4ef940ac7942`; object dump static **752** (39+8)×16; measured /
  load / stress still null; Undo `[]`; no Accept. Evidence
  `usb-cycles-mop178-2026-11-24.md`; `performance.json` static filled.
  Catalog SHUT.

## 0.1.0-experimental — docs note 2026-11-24 (MOP-177)

- Tip-docs hub sync after mop175 toast USB miss + mop176 qualification
  fill recipe: catalog-gate + remaining-gate tables now split SETUP
  **Proven** from FUNC+TRACK toast **USB miss** / still **Open**; 
  `tests.qualification` still **Not started** (recipe tip only); words-move
  / cycles still open; catalog still **SHUT**. Hub MOP-177; evidence
  `catalog-gate-mop83-2026-11-24.md` (+ cross-links). No USB / Accept /
  force-list; no invented readiness. (Current stamp MOP-182 after mop179.)

## 0.1.0-experimental — docs note 2026-11-24 (MOP-176)

- Tip-docs: QLR-shaped `tests.qualification` fill recipe after MOP-168 §1
  — anti-patterns (no DSP-shaped example copy), identity command, one
  coldfire cycles record → mop170, memory region names, hardware
  functional shape, docs write-back. Leave object absent; no invented
  numbers; catalog still **SHUT**. Hub MOP-176; evidence
  `qualification-fill-recipe-mop176-2026-11-24.md`. No USB / Accept /
  force-list.

## 0.1.0-experimental — docs note 2026-11-24 (MOP-175)

- Keep-safe USB toast attempt on tip twin `775d9322…`: tip dual staged;
  FUNC+TRACK+LEVEL → SRC/LEV only (no `Tn SPOS nn`); FUNC+TRACK+NO →
  stock DISARM ALL (no `Tn SPOS OFF`); Undo `[]`; no Accept. Toast USB
  path unproven. Evidence `usb-toasts-miss-mop175-2026-11-24.md`. Catalog
  SHUT.

## 0.1.0-experimental — docs note 2026-11-24 (MOP-174)

- Tip-docs hub sync after mop172 SETUP capture: catalog-gate + remaining-
  gate tables now show SETUP PMTR=SPOS label **Proven** (toasts open);
  words-move still **Open**; qualification / cycles **paths** only;
  catalog still **SHUT**. Hub MOP-174; evidence
  `catalog-gate-mop83-2026-11-24.md` (+ cross-links). No USB / Accept /
  force-list; no invented readiness.

## 0.1.0-experimental — docs note 2026-11-24 (MOP-173)

- Tip-docs hub sync after mop167–171: catalog-gate + remaining-gate tables
  now show dual-install inventory+remapper **Proven**, words-move **Open**
  (frozen tip remapper), and qualification / cycles / SETUP tip paths;
  catalog still **SHUT**. Hub MOP-173; evidence
  `catalog-gate-mop83-2026-11-24.md` (+ cross-links). No USB / Accept /
  force-list; no invented readiness. (SETUP hardware fill: mop172;
  current stamp MOP-182.)

## 0.1.0-experimental — docs note 2026-11-24 (MOP-172)

- Keep-safe USB SETUP PMTR=SPOS monochrome capture on tip twin `775d9322…`:
  tip dual coexist dial-max / PMTR **37**; `media/ot-setup-pmtr-spos.png`
  + `media/capture.json` (hardware; PNG sha `247cdd2b…`); Undo `[]`; no
  Accept. Toast pages open. Evidence `usb-setup-pmtr-mop172-2026-11-24.md`.
  Catalog SHUT.

## 0.1.0-experimental — docs note 2026-11-24 (MOP-171)

- Tip-docs: SETUP PMTR=SPOS monochrome `media/` + `capture.json`
  provenance recipe after MOP-168 §3 — coexist dial dest **37**, Keep-safe
  hardware / ot_emu capture, palette, minimum SETUP + toast pages,
  capture.json field set, manifest `otUi` write-back (PROB mop49 shape;
  cite only). No PNGs / invented hashes; catalog still **SHUT**. Hub
  MOP-171; evidence
  `setup-pmtr-provenance-plan-mop171-2026-11-24.md`. No USB / Accept /
  force-list; no SETUP label claims.

## 0.1.0-experimental — docs note 2026-11-24 (MOP-170)

- Tip-docs: ColdFire cycles / `evidence/performance.json` recipe after
  MOP-168 — compose unblock, static ×16 on `sp_map` (+ wrapper), ot_emu
  PC-watch, cfmeter stock-vs-module flood, ≥60 s stress (PROB mop55/mop57
  shape; cite only). All numeric fields stay **null**; catalog still
  **SHUT**. Hub MOP-170; evidence
  `cycles-performance-plan-mop170-2026-11-24.md`. No USB / Accept /
  force-list; no invented cycle counts.

## 0.1.0-experimental — docs note 2026-11-24 (MOP-169)

- USB words dig on tip remapper twin `775d9322…`: tip dual remapper
  `4ef940ac7942`, dial-max / PMTR **37**, enArmed, `mw_lfo_dbg` afterStore
  Δ **7543**, yet `sp_pos_w` unique=1 stuck at **`0x4000`**. Tip alone
  dial-max **30** (cannot reach SPOS). mop157 Detour 620 B → refusal **9**
  on tip twin. Words-move remains Detour-path-only (mop157). Undo `[]`;
  no Accept. Evidence `usb-words-dig-mop169-2026-11-24.md`. Catalog SHUT.

## 0.1.0-experimental — docs note 2026-11-24 (MOP-168)

- Tip-docs: `tests.qualification` stub fill path (owner-reviewable
  structure bound to mop157 identity; no invented numbers) + remaining
  eligibility notes — ColdFire cycles / `performance.json` plan and SETUP
  PMTR=SPOS monochrome `media/` + `capture.json` provenance path. Gates
  stay open; catalog still **SHUT**. Hub MOP-168; evidence
  `qualification-fill-path-mop168-2026-11-24.md`. No USB / Accept /
  force-list; no invented cycle counts or SETUP label claims.

## 0.1.0-experimental — docs note 2026-11-24 (MOP-167)

- USB dual-install Keep-safe Undo on tip-matched `--dev` twin `775d9322…`
  (owns `ev_audio_step`): tip-matched Play Modes (`--octabam-machine`) +
  SPOS `runtime.json` 600 B + LFO coexist peers (**trig-prob** omitted —
  refusal 3 vs Play Modes). Inventory dual **yes**; remapper
  `4ef940ac7942` = base ownership (not mop157 private Detour); dial-max /
  PMTR **37**; enArmed; **words did not move** this session; WAV onset Δ
  −2878 recorded without dual-install audible claim. Undo `[]`; no Accept.
  Old mop71 twin unusable for subscribe packages. Evidence
  `usb-dual-install-mop167-2026-11-24.md`. Catalog stays SHUT.

## 0.1.0-experimental — docs note 2026-11-24 (MOP-166)

- Tip-docs strengthen for publishability: mop157 honesty (remapper
  Detour-on-twin ≠ tip-matched base `ev_audio_step`; jump-colour
  unverified; peeks ≠ audible; audibleProven ≠ catalog pin) + dual-install
  Keep proof protocol tip for Play Modes order 40 + SPOS order 50 on
  tip-matched remapper (no private Detour) — later **ran** as mop167
  (inventory+remapper Proven; words-move open). Remaining gates noted
  (qualification, cycles, SETUP PMTR media, Play Modes Detours). Hub
  MOP-166; evidence `dual-install-keep-proof-mop166-2026-11-24.md`. No
  Accept / force-list; no invented dual-install words-move claims.

## 0.1.0-experimental — docs note 2026-11-24 (MOP-162)

- Tip-docs honesty: USB-audibleProven under coexist Keep-safe Undo (#130 /
  mop157), but catalog listing remains **SHUT** until publishability
  criteria elsewhere are met — do not invent readiness; never force-list
  `sdk/catalog.json`. Cross-link MOP-162 / MOP-113 checklist; README /
  TESTING / INVESTIGATION / catalog-gate pointers restated.

## 0.1.0-experimental — docs note 2026-11-24 (MOP-157)

- USB Keep-safe Undo audible claim for queue #8 SPOS: tip-matched coexist
  MWMS (mop73 **620 B**) hit PMTR **37**; peeks moved (`sp_en` armed);
  WAV onset Δ **−254** samples → audibleProven (peaks near-null
  disclosed). Undo → `[]`. No Accept / lifecycle / catalog pin. Evidence
  `evidence/usb-audible-mop157-2026-11-24.md`. Next: #9 PROB after Jon PC.

## 0.1.0-experimental — docs note 2026-11-24 (MOP-151)

- Tip-only post-SPOS handoff: after SPOS Undo peeks/WAV + Undo `[]` + Jon
  PC, next USB is queue #9 PROB (MOP-134 tip / **MOP-143** strengthen;
  alone dest **30** OK). Hub `docs/OCTATRACK_LFO_PMTR_EXTENSION.md`
  (MOP-151). No USB twin / Accept / catalog pin; no invented audible
  claims.

## 0.1.0-experimental — docs note 2026-11-24 (MOP-150)

- Tip-only post-PHAS handoff: after PHAS Undo peeks/WAV + Undo `[]` + Jon
  PC, next USB is queue #8 SPOS (MOP-133 tip; coexist dest **37**). Hub
  `docs/OCTATRACK_LFO_PMTR_EXTENSION.md` (MOP-150). No USB twin / Accept /
  catalog pin; no invented audible claims.

## 0.1.0-experimental — docs note 2026-11-24 (MOP-133)

- Tip-only executable Keep-safe Undo trial sheet for queue #8 SPOS — next
  USB after the PHAS tip (#103 / MOP-132; mop109 peeks). Prefer tip-matched
  coexist MWMS when dial needs peers (alone dial-max 30 vs dest **37**;
  #95/#96), mop110 remapper peeks + WAV plan. Hub
  `docs/OCTATRACK_LFO_PMTR_EXTENSION.md` (MOP-133). Fixture envelope
  updated to prefer coexist. No USB twin / Accept / catalog pin; leave
  PHAS / TLEN / TSTR / RST / PROB siblings alone.

## 0.1.0-experimental — docs note 2026-11-24 (MOP-110)

- Tip-only Keep-safe Undo audible protocol for lever #8 SPOS:
  `evidence/next-audible-fixture-mop110-2026-11-24.md` (remapper-aware
  preflight peeks on `after_store` / `sp_pos_w` / `sp_en` / `ev_audio_step`
  coexistence, WAV A/B compare plan, MOP-76 twin trap). Links MOP-100
  queue + MOP-83 catalog gate + MOP-92/101/102 remapper lineage. No USB twin
  / Accept / catalog pin; leave other audible-prep siblings alone.

## 0.1.0-experimental — tip note 2026-11-24 (MOP-102)

- Base `ev_audio_step` implemented (MOP-101 design). Draft subscribes order 50
  (`sp_ev_audio_step` under `MODWERK_EVENTS`, replaces `sp_audio_step` in
  `runtime.json`). Tip assemble only — no USB twin / Accept / catalog pin.
  No audible claim. Conflict with Play Modes Detour remains until its
  standalone package carries `runtime.json`.

## 0.1.0-experimental — docs note 2026-11-24 (MOP-101)

- Smallest base `ev_audio_step` remapper design for **SPOS + Play Modes**
  after #71 / MOP-99 and #68 / MOP-92
  (`evidence/base-ev-audio-step-remapper-mop101-2026-11-24.md`): `call`
  event at `0x400a2d6a` (rejoin `0x400a2d74`), ABI like `ev_play_increment`,
  Play Modes order 40 then SPOS 50. Links MOP-99 (PHAS off list). Tip-only —
  no USB twin / Accept / catalog pin. No audible claim. No behaviour change.

## 0.1.0-experimental — docs note 2026-11-24 (MOP-92)

- Honest Play Modes `0x400a2d6a` conflict / coexistence design note
  (`evidence/playmodes-audio-step-conflict-mop92-2026-11-24.md`): same
  stock_guard as `pm_audio_step`; prefer base-owned `ev_audio_step` before
  catalog. `verify.py` locks the shared hash. Fixed garbled arrows/dashes in
  TESTING. Tip-only — no USB twin / Accept / catalog pin. No audible claim.

## 0.1.0-experimental — docs note 2026-11-24 (MOP-82)

- Archive `unit.full.s` ColdFire assemble: dbra→subq/bpl, movem lea-frame,
  lsr.l / addi.l, immediate-to-indexed via moveq (scratch preserved), and
  (track-len) `PAT_*` via `adda.l` for >±32K An displacement. Linked `unit.s`
  unchanged. Cloud assemble only — no USB twin / Accept / catalog pin.

## 0.1.0-experimental — 2026-11-22

- Draft: per-track sequencer position as LFO PMTR destination SPOS (index 37), FUNC+TRACK+LEVEL enable/edit, FUNC+TRACK+NO to follow stock playhead, and tick audio step address remap.
- PMTR index coordination (coordinator lock): SPOS=37 after PROB=30, RST=31, SLIC=32, SWING=33, TSPD=34, TLEN=35, PHAS=36. Count poke when alone: 30→38. Prefer a base-owned LFO-destination table for count/labels.
- Not listed in the configurator yet: stock_guard spans, native packages, emulator and hardware evidence are still required. Enable/SPOS state is DRAM-only in this draft (does not survive reboot).
- Declared conflict with playmodes (tick audio step remap site). Peer LFO PMTR drafts and trig-prob / track-len UI-claim conflicts are listed in `compatibility.conflicts` until a base-owned PMTR table lands.
- Parked under `sdk/drafts/seq-pos/` (not `sdk/octabam/modules/`) until stock_guard spans, packages and evidence exist. Not catalog-listed.

## 0.1.0-experimental — 2026-11-24 (MOP-73 audio_step + after_store arm)

- Contribute ABI 2: `sp_lfo_pmtr.after_store` → `sp_on_store` arms `sp_en[track]` when the LFO engine writes SPOS words (address mode on).
- Detour `0x400a2d6a` → `sp_audio_step` remaps the tick audio step via `sp_map` when enabled (`step = (high * len) >> 7`). Same stock_guard as playmodes; **conflicts with playmodes**.
- Keep-safe Undo twin prove records the installed jmp and enable arm / words move under PLAY. Audible address-mode and Keep still open. Still under `sdk/drafts/`; **not** catalog-listed.

## 0.1.0-experimental — 2026-11-23 (production index restored)

- Left the MOP-16 USB evidence stub (temporary PMTR 31 / count 32). Production **SPOS = 37** with pad_to=8 dest rejoin at `0x4000d04a`; alone count poke 30→38; indices 30..36 sink.
- Kept private USB Undo load evidence on record (`evidence/usb-ram-trial-2026-11-22.md`); audible address-mode / Keep still untested. Still under `sdk/drafts/`; **not** catalog-listed.

