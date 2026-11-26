# Seq Pos — evidence hooks

Self-hosted / USB workers drop real results here. Do not invent Keep, cycles, audible destination, or SETUP labels.

| Path | Purpose |
| --- | --- |
| `peer-lfo-ratchet-tip-gates-mop275-2026-11-26.md` | MOP-275: tip — honest peer LFO ratchet tip-gate matrix (mop268 latch PASS; mop269 dens Open; mop270 fixture landed; mop271 dens USB pending); unblock TEMPO/TSPD→SPOS ratchet tip dig only on dens PASS or latch-only fallback after verified-empty null; stock PLAYHEAD march expected; no dens/ratchet Proven invent; no USB/Accept |
| `dens-ab-fixture-tip-mop270-2026-11-26.md` | MOP-270: tip — why mop258/269 dens null (both ends loud / empty-end unverified); asymmetric silent-end dens recipe; latch-only ratchet fallback after verified null; no USB/Accept |
| `usb-dens-ab-reopen-open-mop269-2026-11-26.md` | MOP-269: dens A/B reopen after #235 / mop268 — STOPPED `sp_ui_shown` stick **reconfirmed**; mop258-class sparse dens **Open/null** (5.5/s A=B=C); peer LFO ratchet still blocked; Undo `[]`; ASK JON PC; no Accept; next fixture tip mop270 |
| `usb-ui-shown-peeks-pass-mop268-2026-11-26.md` | MOP-268: Keep-safe Undo after #234 — `sp_ui_shown` resolve + toast 0 vs 127; **`sp_ui_shown[0]` stick 0 then 15 PASS**; dens parked (ask before reopen); Undo `[]`; ASK JON PC; no Accept |
| `panel-led-surface-tip-mop267-2026-11-26.md` | MOP-267: tip dig + glue — remapped UI step has no stock SRAM home; latch `sp_ui_shown[track]`; master `-1` via live `0x80000000`; no USB Accept; dens parked |
| `usb-panel-led-peeks-open-mop266-2026-11-26.md` | MOP-266: Keep-safe Undo after #232 — tip wire + mop265 CUR_TRACK package + toast/step-map PASS; panel/getter stick **Open** (correct metrics; `0x800065b5` ignored); dens parked; Undo `[]`; ASK JON PC; no Accept |
| `led-stick-tip-dig-mop265-2026-11-26.md` | MOP-265: tip dig — `0x800065b5` = stock master-step low byte (not remapper write); mop263/264 peeks wrong metric; glue left master `-1`; tip fix maps master via `CUR_TRACK`→`sp_map`; no USB Accept; dens parked |
| `usb-led-repeeks-open-mop264-2026-11-26.md` | MOP-264: tip24 Keep confirmed after PC; Keep-safe Undo twin LED re-peek — tip wire + toast/step-map PASS; LED `0x800065b5` still marches → **Open**; tip dig skipped; dens parked; Undo `[]`; ASK JON PC; no Accept |
| `usb-led-peeks-open-mop263-2026-11-26.md` | MOP-263: Keep-safe Undo LED peeks after #229 — tip wire loaded + toast/step-map PASS; LED byte `0x800065b5` still marches under address → **Open**; dens parked; Undo `[]`; ASK JON PC; no Accept |
| `base-ev-ui-step-impl-mop262-2026-11-26.md` | MOP-262: tip — base `ev_ui_step` @ `0x4009b2b0`; PM machine-ports order 40; SPOS `sp_ev_ui_step`/`sp_map` order 50; reject PLAYHEAD write-back; no USB Accept/Keep; dens parked; LED peeks → mop263/264 Open |
| `playhead-led-firmware-dig-mop261-2026-11-26.md` | MOP-261: tip investigation — pin LED/UI hook `0x4009b2b0`; propose base `ev_ui_step` (mirror `ev_audio_step`); reject PLAYHEAD write-back; **no** Detour/`unit.s` wiring; dens stay parked; no Accept invent |
| `publishability-gates-hub-mop260-2026-11-26.md` | MOP-260: tip hub honesty — dens digs **parked**; playhead remapping = **0.1.x firmware gap** (mop258/259 dens Open + stock PLAYHEAD marches = remapper not owning audible/LED); ratchet/reverse blocked until firmware LED/playhead remap; catalog already **PINNED**; no dens re-dig; no Accept invent |
| `usb-playhead-sparse-trig1-open-mop259-2026-11-26.md` | MOP-259: stronger sparse TRIG1-only playhead A/B — grid REC unverified; dens **Open** (later parked mop260); Undo `[]`; ASK JON PC; store `media/mop259-spos-sparse-trig1/` |
| `usb-playhead-ab-open-mop258-2026-11-26.md` | MOP-258: address-mode playhead A/B Undo dig — toast/step-map observed; sparse density **Open** (later parked mop260); jump-colour not re-opened; Undo `[]`; ASK JON PC; no Accept (frames/WAVs in project store `media/mop258-spos-playhead/`, not under module tree) |
| `performance.json` | ColdFire `schema: 1` — static/measured **752**; load stock/module longest **287.8** µs (idle 0); stress **62 s REACHED** (mop181; mop179 Part path ILLEGAL) |
| `cycles-performance-plan-mop170-2026-11-24.md` | MOP-170: tip-only ColdFire cycles / `performance.json` recipe (compose, static ×16, ot_emu PC-watch, cfmeter load, ≥60 s stress) |
| `usb-cycles-mop178-2026-11-24.md` | MOP-178: Keep-safe USB dig — tip remapper + static **752**; measured/cfmeter/stress open; Undo `[]`; no Accept |
| `usb-cycles-mop179-2026-11-24.md` | MOP-179: measured **752**; page-2 load 287.8/287.8; stress ILLEGAL ~30.8 s (Part); Undo `[]`; no Accept |
| `usb-stress-mop181-2026-11-24.md` | MOP-181: ≥60 s stress **REACHED** without Part; hangs 0; dropped 0; Keep tip24; no Accept |
| `usb-*-*.md` | Private package digest, base SHA, Undo/Keep outcome |
| `catalog-gate-mop83-2026-11-24.md` | MOP-83 … **MOP-260**: honest catalog furtherance — SPOS structural + mop157 audibleProven; mop167/184 remapper+words-move Proven; mop172 SETUP Proven; mop196 FUNC+TRACK toast USB **Proven**; mop197 `tests.qualification` **Placed**; mop178/179/181 cycles/stress Proven; mop188/189 Play Modes runtime Proven; memory tip-wired **944** (mop202); mop199/201/203/211/219 jump-colour USB Open; mop243 owner waive (jump-colour **Unproven/waived**); mop244/245/247 Keep Accept+reboot **PASS**; catalog **PINNED** mop248; mop258/259 dens Open → mop260 dens **parked** / playhead remapper = **0.1.x firmware gap** |
| `catalog-pin-mop248-2026-11-25.md` | MOP-248: Jon-authorized catalog pin + promote — cite Keep mop245/247 + jump-colour Unproven/waived mop243 + qual place mop197; no Accept / jump-colour Proven invent |
| `keep-publish-gate-mop244-2026-11-25.md` | MOP-244: Keep of Seq Pos publish-gate honesty — Proven cite mop242; jump-colour Unproven/waived mop243; Accept PASS mop245; reboot **PASS** mop247; catalog pin mop248 |
| `protocol-mop244-keep-usb-2026-11-25.md` | MOP-244: authorized Keep USB protocol — **consumed** by mop245 Accept + mop247 reboot |
| `usb-hw-mop245-keep-2026-11-25.md` | MOP-245/247: authorized Keep Accept **PASS** + reboot persistence **PASS** (tip24 + SEQ POS still in inv); catalog pin mop248 |
| `publishability-gates-hub-mop244-2026-11-25.md` | MOP-244: tip hub after Keep publish tip — Accept PASS mop245; reboot PASS mop247; catalog pin mop248 |
| `usb-jump-colour-open-mop219-2026-11-25.md` | MOP-219: SLICE/STRT mute-isolation USB — S0≈S15; abort C/D; still **Open** (fixture); Undo `[]`; ASK JON PC; no Accept |
| `media/hw-*-mop219.*` | Unit USB/LCD STRT locks + mute S0/S15 frames/WAV |
| `jump-colour-slice-fixture-tip-mop223-2026-11-25.md` | MOP-223: tip — Keep-safe USB SLICE/STRT protocol after mop216; jump-colour still **Open**; catalog **SHUT**; no Accept (**consumed** by mop219) |
| `publishability-gates-hub-mop224-2026-11-25.md` | MOP-224: tip hub honesty after mop216 — toast/`sp_len` **Proven**; jump-colour still **Open**; catalog **SHUT**; no Accept / Proven invent (historical; current mop244) |
| `publishability-gates-hub-mop227-2026-11-25.md` | MOP-227: tip hub honesty after mop219 — toast/`sp_len` **Proven**; jump-colour still **Open** (`slice-strt-mute-isolation` consumed; `shared-Flex-attr-lock`); **no** tip-named next USB lever; catalog **SHUT**; no Accept / Proven invent (historical; current mop244) |
| `publishability-gates-hub-mop242-2026-11-25.md` | MOP-242: tip hub honesty after MT distraction — same Proven/Open as mop227; tip default **park**; Jon decision for waive / authorize; catalog **SHUT**; no Accept / Proven invent (historical; current mop244) |
| `publishability-gates-hub-mop243-2026-11-25.md` | MOP-243: tip hub honesty after Jon owner waive — jump-colour **Unproven/waived** (not Proven); Keep/qual/pin still separate auth; catalog **SHUT**; tip-only; no new USB fixture; no Accept / Proven invent (historical; current mop244) |
| `publish-closeout-honesty-mop241-2026-11-25.md` | MOP-241: tip closeout — drop stale “mop209 … pending USB” limitation; cite mop211/216/219/223; jump-colour **Unproven/waived** (mop243); Keep Open mop244; catalog **SHUT**; no Accept / Proven invent |
| `jump-colour-deadend-tip-mop216-2026-11-25.md` | MOP-216: tip — declare `shared-Flex-attr-lock` dead-end after mop211 S0≈S15; one next USB lever SLICE/STRT on multi-region sample; jump-colour still **Open**; catalog **SHUT**; no Accept |
| `jump-colour-fixture-tip-mop209-2026-11-25.md` | MOP-209: tip — LEVEL/filter exhausted after mop203; SAMPLE/PTCH + mute-isolation S0/S15 next USB; jump-colour still **Open**; catalog **SHUT**; no Accept |
| `usb-jump-colour-open-mop211-2026-11-25.md` | MOP-211: PTCH + mute-isolation USB — S0≈S15; abort C/D; still **Open** (fixture); Undo `[]`; ASK JON PC; no Accept |
| `media/hw-*-mop211.*` | Unit USB/LCD dial-37 + mute S0/S15 frames/WAV |
| `sp-len-init-tip-mop202-2026-11-25.md` | MOP-202: tip wire — `sp_len` `.data` default 16 + arm-path ensure; package **892**/**52** = **944**; jump-colour still **Open** (USB mop203); no Accept |
| `usb-jump-colour-open-mop203-2026-11-25.md` | MOP-203: USB re-prove after mop202 — `sp_len=16` + toast 0/127 bound; C≈D; still **Open**; Undo `[]`; ASK JON PC; no Accept |
| `jump-colour-tip-dig-mop200-2026-11-25.md` | MOP-200: tip dig after mop199 C≈D — remapper path found; no clear code fix; next USB fixture; catalog **SHUT** |
| `usb-jump-colour-open-mop201-2026-11-25.md` | MOP-201: engineered fixture USB dig — `sp_len=0` → remapper follow; C≈D; still **Open**; Undo `[]`; ASK JON PC; no Accept |
| `qualification-place-mop197-2026-11-25.md` | MOP-197: tip place complete `tests.qualification` after toast Proven + memory 908; publication parse OK; Keep tip24 free; catalog **SHUT**; no Accept |
| `qualification-memory-mop192-2026-11-24.md` | MOP-192: tip-only linked measure — image **336** + bss **36** = **372**; Detours omitted (sites 0); filled example memory; object still absent; Keep tip24; no Accept |
| `toast-tip-wire-mop195-2026-11-25.md` | MOP-195: tip toast wire — `sp_level`/`sp_off` + `module_key`/`module_enc`; nm shows symbols; package **848**/**60** = **908**; USB re-proved mop196; no Accept |
| `usb-toasts-prove-mop196-2026-11-25.md` | MOP-196: FUNC+TRACK toast USB **Proven** after tip wire — `T1 SPOS 127` / `T1 SPOS OFF`; publication PNGs; Undo `[]`; ASK JON PC; no Accept |
| `qualification-place-mop197-2026-11-25.md` | MOP-197: place `tests.qualification` after toast Proven; object in manifest; jump-colour still Open |
| `usb-jump-colour-open-mop199-2026-11-25.md` | MOP-199: jump-colour USB dig — C≈D (envCorr ≈1); still **Open**; Undo `[]`; ASK JON PC; no Accept |
| `playmodes-audio-step-conflict-mop92-2026-11-24.md` | MOP-92: exact `0x400a2d6a` stock_guard clash with Keep Play Modes; base `ev_audio_step` coexistence design (no audible claim) |
| `base-ev-audio-step-remapper-mop101-2026-11-24.md` | MOP-101: smallest base remapper design (SPOS + Play Modes; PHAS off) |
| `base-ev-audio-step-impl-mop102-2026-11-24.md` | MOP-102: tip implementation of that remapper (assemble only; no twin) |
| `playmodes-runtime-mop183-2026-11-24.md` | MOP-183: Play Modes Detours → `runtime.json` tip recipe (honest stall — needs owner-approved version); published 0.1.1 `.mwrm` still Detours; no USB |
| `playmodes-runtime-mop188-2026-11-24.md` | MOP-188: owner-authorized Play Modes 0.2.1 `runtime.json` tip land + approval; published 0.1.1 `.mwrm` still Detours; USB Undo verify follows tip |
| `next-audible-fixture-mop110-2026-11-24.md` | MOP-110: Keep-safe Undo audible protocol (remapper peeks, WAV A/B plan, twin trap); links MOP-100 queue + MOP-83 gate + MOP-92/101/102; tip-only. MOP-133: prefer coexist MWMS (alone dial-max 30 vs dest 37) |
| `usb-audible-mop157-2026-11-24.md` | MOP-157: coexist Undo WAV A/B — mop73 620 B, PMTR 37, peeks moved, onset −254 → audibleProven; Detour-on-twin honesty (MOP-166); Undo `[]`; no Accept |
| `dual-install-keep-proof-mop166-2026-11-24.md` | MOP-166: tip-only Play Modes order 40 + SPOS order 50 Keep proof protocol on tip-matched `ev_audio_step` (no private Detour); remaining gates noted |
| `usb-dual-install-mop167-2026-11-24.md` | MOP-167: ran mop166 sheet — inventory dual + tip remapper `4ef940ac7942`; dial-max 37; enArmed; words **not** moved; Undo `[]`; no Accept |
| `usb-words-dig-mop169-2026-11-24.md` | MOP-169: tip dual afterStore Δ 7543 / words frozen `0x4000`; tip alone dial-max 30; Detour on tip twin refusal 9; Undo `[]`; no Accept |
| `usb-words-move-mop184-2026-11-24.md` | MOP-184: tip remapper dual words-move **Proven** (T1 unique 33; alt DEP/SPD+wiggle); Undo `[]`; ASK JON PC; no Accept |
| `qualification-fill-path-mop168-2026-11-24.md` | MOP-168: tip-only `tests.qualification` stub fill path (mop157-bound identity; no invented numbers) + ColdFire cycles plan + SETUP PMTR monochrome / `capture.json` provenance outline; gates stay open |
| `qualification-fill-recipe-mop176-2026-11-24.md` | MOP-176: tip-only QLR-shaped fill recipe for mop168 §1 (anti-patterns, identity command, coldfire cycles / memory / hardware / docs); leave object absent; no invented numbers |
| `qualification-fill-mop186-2026-11-24.md` | MOP-186: tip filled `qualification.example.json` cycles from mop179/181 (**752**/**4790**); sourceSha256 computed; memory null; hardware then pending; object still absent; pending owner (later mop191) |
| `qualification-owner-fill-mop191-2026-11-24.md` | MOP-191: Jon push owner fill — cycles kept; QLR-shaped functional hardware from landed digs; imageSha256 = mop172 SETUP OS image; memory null then; object still absent; toast Open/miss; Detours Proven |
| `setup-pmtr-provenance-plan-mop171-2026-11-24.md` | MOP-171: tip-only SETUP PMTR=SPOS monochrome / `capture.json` recipe (coexist dial, Keep-safe hardware / ot_emu, palette, minimum pages, manifest `otUi`); no PNGs / invented hashes |
| `usb-setup-pmtr-mop172-2026-11-24.md` | MOP-172: ran mop171 — tip dual PMTR **37**; hardware `ot-setup-pmtr-spos.png` + `capture.json`; Undo `[]`; no Accept |
| `usb-toasts-miss-mop175-2026-11-24.md` | MOP-175: FUNC+TRACK toast USB miss — SRC/LEV / DISARM ALL; no `Tn SPOS` glyphs; Undo `[]`; no Accept |
| `usb-toasts-reprobe-mop185-2026-11-24.md` | MOP-185: TRACK-held re-probe miss — AMP SETUP / RELOAD PAGE; mop175-shaped compare still SRC/LEV / DISARM ALL; Undo `[]`; no Accept |
| `usb-toasts-alt-stall-mop194-2026-11-24.md` | MOP-194: tip-only source-structure stall — built `unit.s` lacked toast handlers; archive `unit.full.s` not linked; closed by mop195 tip wire; no twin / Accept |
| `usb-playmodes-dual-mop189-2026-11-24.md` | MOP-189: Play Modes 0.2.1 runtime + SEQ POS dual-install USB **Proven** — remapper match; PMTR **37**; words unique **25**; Undo `[]`; no Accept |
| `media/` | Twin/unit panel PNGs; publication SETUP PMTR=SPOS under `../media/` (mop172); toast pages **Proven** under `../media/` (mop196) |

Post-PHAS handoff (tip-only): after PHAS peeks/WAV + Undo `[]` + Jon PC,
next USB is #8 SPOS —
[MOP-150](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#post-phas-handoff-to-queue-8-spos-mop-150).
Executable next-USB trial sheet after the PHAS tip (#103 / MOP-132; hub,
tip-only; mop109 peeks; remapper + WAV from mop110):
[MOP-133](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#queue-8-undo-trial-spos-after-phas-tip-mop-133)
— coexist MWMS dest **37**; remapper peeks at `0x400a2d6a`; no USB /
Accept / catalog force-list in that tip. Leave PHAS / TLEN / TSTR / RST /
PROB siblings alone. SPOS audible claim landed (mop157 / #130); tip
strengthen (mop157 honesty + dual-install protocol):
[MOP-166](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-tip-strengthen-mop157-honesty-and-dual-install-mop-166).
Qualification fill path:
[MOP-168](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-qualification-stub-fill-path-mop-168).
Qualification fill recipe:
[MOP-176](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-qualification-stub-fill-recipe-mop-176).
ColdFire cycles / `performance.json` recipe:
[MOP-170](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-coldfire-cycles-performance-plan-mop-170).
Measured / load / stress dig:
[MOP-179](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-coldfire-cycles-measured-load-stress-dig-mop-179).
≥60 s stress REACHED:
[MOP-181](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-coldfire-stress-reached-mop-181).
SETUP PMTR monochrome / `capture.json` recipe:
[MOP-171](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-setup-pmtr-monochrome-capturejson-plan-mop-171).
Hub sync after tip fan-out:
[MOP-173](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-publishability-gates-after-tip-fan-out-mop-173).
Hub sync after SETUP capture:
[MOP-174](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-publishability-gates-after-setup-capture-mop-174).
Hub sync after toast miss + qual recipe:
[MOP-177](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-publishability-gates-after-toast-miss-and-qual-recipe-mop-177).
Hub sync after cycles static:
[MOP-180](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-publishability-gates-after-cycles-static-mop-180);
prior [MOP-182](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-publishability-gates-after-cycles-measured-mop-182);
[MOP-183](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-play-modes-detours-runtime-mop-183);
[MOP-186](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-qualification-stub-fill-mop-186);
[MOP-187](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-publishability-gates-after-toast-reprobe-miss-and-qual-stub-mop-187);
[MOP-188](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-play-modes-detours-runtime-mop-188);
[MOP-189](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-play-modes-021-dual-install-usb-mop-189);
[MOP-190](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-publishability-gates-after-playmodes-prove-mop-190);
[MOP-191](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-qualification-owner-fill-mop-191);
[MOP-192](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-qualification-memory-mop-192);
[MOP-193](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-publishability-gates-after-memory-measure-mop-193);
[MOP-194](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-functrack-toast-alt-stall-mop-194);
[MOP-195](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-toast-tip-wire-mop-195);
[MOP-196](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-functrack-toast-usb-prove-mop-196);
[MOP-197](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-tests-qualification-place-mop-197);
[MOP-198](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-publishability-gates-after-qualification-place-mop-198);
[MOP-199](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-jump-colour-usb-open-mop-199);
current [MOP-200](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-jump-colour-tip-dig-mop-200).
Post-SPOS handoff (tip-only): after SPOS peeks/WAV + Undo `[]` + Jon PC,
next USB is #9 PROB —
[MOP-151](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#post-spos-handoff-to-queue-9-prob-mop-151)
→ [MOP-134](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#queue-9-undo-trial-prob-after-spos-tip-mop-134)
(**MOP-143**).

Catalogue draft has `tests.qualification` **Placed** (mop197) but pin
stays **SHUT** (jump-colour Open; drafts-only). FUNC+TRACK toast pages
**Proven** (mop196). Play Modes Detours → runtime **Proven** (mop188/189);
published 0.1.1 `.mwrm` still Detours (`lagsBehind`). Words-move **Proven**
(mop184); stress **Proven REACHED** (mop181); SETUP Proven (mop172);
memory tip-wired **908** (mop192/195). Alone dial-max blocks dest **37**
until coexist — MOP-68 / MOP-122 ABI. Base event landed (MOP-102). Audible
half landed (mop157). No catalog force-list.
