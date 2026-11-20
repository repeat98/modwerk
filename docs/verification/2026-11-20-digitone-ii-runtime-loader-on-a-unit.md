# Digitone II: modules loaded into RAM by the runtime loader, 20 November 2026

The Digitone II's runtime loader (`sdk/machines/digitone-ii/LOADER.md`) on the contributor's Digitone II (@prodbysmolec), OS 1.12, the flashed base being the RAM boot base of #1821 and each loader image booted from RAM over the link (nothing written to the flash).

- **Build:** `npm run machine:base -- digitone-ii --dev` of this pull request after merging main, development package `e4dfa5abc4b2fdbf701a03781ce38d7708e90a5b15ed9b3ace5e4619f4cccdc1` (no jump to an odd address), linked by Elekloader 0.11.0's patcher to `.syx` `9655e19e0bdb3d20e7af8bf41278b7607a2d0087dabf401c7cc09b21979c988e`, main OS CRC 304cfcdc: a trial and its rollback, Keep, the encoder, key and draw hooks, a kept removal and the refusal while playing ran on it. The steps below ran first on the same branch before the merge (`.syx` `00b7cbeb…`, main CRC f3712795; earlier `51600aa9…`, which read the encoder delta from the queue message's top byte).
- **Before the unit:** the glue's values in the stock OS (LOADER.md's table): the sixteen task records from the fifteen `task_create` calls, each live one's list head and saved sp read back over the link inside its stack; no task in the ready lists outside the table; the live vector table; the free DDR (no stock instruction addresses it; it read as power-on noise). Stock passed link messages of 33 to 8,192 bytes to the link's receive site.
- **Packages:** two original test modules built with `sdk/runtime/loader/build.py`: one counts UI ticks into the test value (88 bytes, module 6c997e9d); one reports the last key press, encoder turn and frames drawn (180 bytes, four hooks, module f1961bc2). Neither takes an event or patches stock code.
- **Trial and rollback:** `dn2_link.py try`: the controller's HELLO, ENTER, BEGIN, CHUNK, VERIFY, COMMIT and LEAVE over the link's upload command, then `ident` read one module live and the test value rising 33 a second (the 30 Hz tick); `undo` left none live.
- **A host that went away:** during one trial the developer pressed a key, so the link refused the host (a person at the unit) and the trial stayed open with no frames: about ten seconds later, the unit stopped, it rolled the trial back by itself (none live, the live set's digest the base's again).
- **Keep and removal:** a kept trial stayed live; a removal of that module as a trial and its rollback brought it back; a kept removal left none live.
- **While playing:** with the sequencer started over the link (playing word 1), the loader refused ENTER as unsafe and nothing changed; STOP, then the next trial loaded.
- **Hooks:** with the hooks module kept, `NO` pressed over the link arrived as key 0x0c pressed, turns of B and C by ±1, ±2, ±3 and ±8 as those deltas, and draws counted as the screen recomposed. The parameters turned went back where they were.
- **A stock-code site** (on the merged build): a private test package (it holds the site's six stock bytes, so it is not committed) turns `jsr 0x40113e2a` at 0x4002e4c0, in the UI task's frame composition, into a `jsr` to its own code in the pool's uncached alias, which counts the call and jumps on to stock. Kept, the site read `4eb9 4e800134`, the count rose with each redraw (2, 7, 9 as keys were pressed), and the unit drew and answered normally; removed, the site read its stock bytes again. Ten rounds of keep, a key press and removal each left the site patched while live and stock after. A first site at 0x4002e43a patched and restored the same way, but sits in a branch the idle loop skips, so it counted nothing. 476,894 frame interrupts to 9,544 UI ticks over that session, 50 to one, and the log held its START only.
- **The example module** `sdk/machines/digitone-ii/examples/corner_dot.c` (44 bytes, module aee18e5a, its draw hook only), on the merged build: before it the screen's bottom-right 3x3 pixels read clear; kept and a redraw later all nine were set; removed and a redraw later clear again.
- **Health:** the diagnostics log held its START only (no FREEZE); 81,400 frame interrupts to 1,634 UI ticks over the first session, 50 to one, so the UI never stood still. How it sounded was not asked yet.
- **Not tested:** stock copies, a switch while another task is paused inside a site (the check that refuses it never had to), a package converted from a catalogue mod, a module that takes keys, long sessions, Keep across many modules.

## Edge cases

On the merged build (main CRC 304cfcdc) unless the row says otherwise; private test packages built with `sdk/runtime/loader/build.py`.

| Case | Why this change makes it a risk | How run | Result |
|---|---|---|---|
| A trial while the sequencer plays | the loader must never switch while audio-critical code runs | PLAY over the link, then `try` | pass: ENTER refused as unsafe, nothing changed |
| The host goes away during a trial | a trial no one keeps must not stay | a person's key presses refused the host mid-trial | pass: rolled back by itself about 10 s later, stopped |
| Two modules at once | positions, hooks and pool extents side by side | `try --keep` of the tick counter, then `corner_dot` | pass: two live, both hooks ran |
| A same-id replacement | the loader swaps one position in place | `corner_dot` kept, then a build with the dot moved left under the same id | pass: still two live, only the new dot drawn |
| A site the core owns | a module must never patch a base or core site | a package for 0x4002e464, the core's tick site | pass: refused at commit, the bytes unchanged |
| A full pool | 2 MiB at a fixed address must refuse, not overrun | eight modules with 280 KiB of bss each, kept one by one | pass: seven fit beside two small ones, the eighth refused at verify; 9 live, frames to ticks 50:1, the log START only |
| A refusal leaves upload mode | a refused package must not hold the loader | the two refusals above, after the host fix | pass: phase normal at once (before the fix, after about 10 s) |
| A stock-code site, patched and restored | the switch writes stock code under the lock | `jsr` at 0x4002e4c0, ten keep and remove rounds | pass: patched while live, stock bytes after |
| Removal and its rollback | a removal is a trial too | `remove`, then undo, then `remove --keep` | pass |
| A power cycle with modules kept | RAM modules must go and the flashed base come back | the developer power-cycled with a module kept | pass: `ident` boot 0, the flashed base |
| A switch while another task is paused inside a site | the paused-task check must refuse it | not run: no way to hold another task inside a site on demand | not run: the check never had to refuse |
| Stock copies (ABI 7) | copies are reconstructed from stock bytes | not run: no Digitone II package carries copies yet | not run |
| A module that takes a key or a turn | a taken event never reaches stock | not run: the probe module takes nothing | not run |
