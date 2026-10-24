# Send FX

An Analog Rytm MKII mod by @stigmagit. Version 0.1.0-experimental, for OS 1.74 with core-ar2 0.3. Checked in the emulator; its chorus was heard by the author on a unit (an earlier build, `stereo-chorus`), the flanger and the phaser await that test.

## Overview

Send FX adds a third send effect beside the delay and the reverb, with a choice of effects: CHORUS, FLANGER and PHASER in this version. Each sound track has its own send. The voices, as the codec brings them back to the processor (the same signal the delay and reverb sends take), are summed by those sends; the chosen effect turns them into a stereo return which, at LEV, joins the PRE FX return: it reaches the analog mixer with the delay and the reverb, before the distortion and the compressor.

With every send at 0, the default, nothing is added: the unit sounds as stock.

## Controls

**FX page:** on the FX track, press DELAY (the second parameter key), then DELAY again. The effect's number and name run along the top; SND counts the sound tracks that send; LEV is the return level.

| Gesture | What it does |
| --- | --- |
| FUNC + turn A | Chooses the effect (CHORUS, FLANGER, PHASER). A new effect starts from its own defaults |
| FUNC + turn E | LEV, the return level (default 100) |
| Turn A-H | The effect's controls below |

| Effect | A | B | C | D | E | F | G | H |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CHORUS | SPD 0.01-5 Hz | DEP sweep | TIME 1-30 ms | WDTH 0-180° | FDBK | HPF | LPF | - |
| FLANGER | SPD ± speed and direction | DEP span | TUNE shortest delay | FDBK ± | LPF | - | - | - |
| PHASER | SPD | DEP | SHP towards square | LAG | FREQ centre | FDBK ± | STG 2/4/6/8 | WDTH |

**SEND page:** on a sound track, press AMP, then AMP again. Encoder A sets that track's send, 0-127 (default 0).

Pressing the same key once more, or any other page or menu key, goes back to the stock pages. The effect and its controls are kept in the kit, the send in the sound, LEV in the project: save the kit and the project to keep them. A turned control shows its value in place of its name for a moment.

## Usage

Send a few tracks, then pick and shape the effect on the FX track.

### Quick tutorial

1. Select a snare or a hi-hat track, press AMP, then AMP again: the SEND page opens. Turn encoder A to about 90.
2. Play the track: the chorus joins in at its defaults.
3. Press FX, DELAY, then DELAY again: the FX page opens. Hold FUNC and turn A for the flanger or the phaser, then shape it with A-H.
4. Press DELAY once more to go back to the delay, and save the kit to keep the settings.

## How it works

- `gate.s` hooks the end of the FX returns routine (one site, 6 bytes, `movel #32,%macsr`), right after stock has written the PRE and POST returns of this block into the codec's output ring; d2 holds the output slot. The detour sets the MAC mode as stock does, then runs `send_fx_block`.
- The input: the codec's receive buffer, 32 frames of 12 words (MAIN, the eight voices, AUDIO IN). Stock's own tables give each voice's word and the track that plays it now, so the send of that track scales the voice, on a squared curve like stock's sends. Voices whose send is 0 are skipped.
- The effects run on 16-bit signals, so a gain is one multiply. CHORUS: two 4-point Hermite taps on an 85 ms line, swept by an LFO worked out at each end of the 32-frame block. FLANGER: two taps gliding through the line half a cycle apart with sin² cross-fades (a barber-pole sweep), the right side crossing the fades. PHASER: 2-8 first-order all-pass stages a side, their coefficient from a table and stepped across the block. One-pole high- and low-pass on the chorus and flanger return.
- The output: scaled by LEV, added to the PRE words of the block, saturated to 24 bits.
- `ev_tick` copies the sends and the kit values for the audio block, `ev_key` and `ev_enc` run the pages, `ev_draw` draws them, `ev_project` clears the state. After 2 s with no send above 0 the state is cleared once and the block returns at once.
- The pages: the FX page fills the screen in the layout of Elektron's newer effect pages (number and name on top, SND and LEV on the left, two rows of illustrated controls), with this mod's own icons and font for the title; labels and values use stock's own text routine. The SEND page keeps stock's top and bottom bars and draws one stock-style dial.

The LFOs are free running, as a pedal's: nothing is tied to the tempo ([sequencing.md](../../../../../docs/module-guides/sequencing.md)).

## Changes to stock flows

- **DELAY pressed again on the FX track** opens the FX page, and **AMP pressed again on a sound track** opens the SEND page. On stock a second press of either key does nothing (checked in the emulator, OS 1.74, also a third press). The same key once more, or any other page or menu key, gives the stock page back.
- **The PRE FX return** carries the effect too while a send is above 0. The delay and the reverb are untouched.

## Compatibility and limitations

OS 1.74 only, with core-ar2 0.3. Storage: one 7-bit sound field (`send_fx_send`), two kit fields (`send_fx_a`, 32 bits: the effect and controls 1-4; `send_fx_b`, 28 bits: controls 5-8), each control stored as its difference from the effect's default, and one 7-bit project field (`send_fx_lev`). UI claims: `FX DELAY page key twice`, `AMP page key twice`. One code site: 0x4010ee66, 6 bytes, at the end of the FX returns routine.

- **One effect at a time.** The slot holds one effect; a mod per effect would need the FX returns as a shared core event first (one owner per site).
- **Little time left in the audio block.** In the emulator four Hermite taps a frame, or twelve phaser stages a side, with every voice sending, stopped the audio: each effect here was cut down until it ran with all eight voices sending. The margin on a unit is not measured.
- The controls and sends are not stock parameters: no parameter locks, LFO, scenes or MIDI CC.
- Always on the PRE return; no POST choice. Only the analog voices are sent, not the external input.
- Tracks that share a voice (RS/CP, MT/HT, CH/OH, CY/CB) share its send: the last one played sets it.
- Settings saved by the `stereo-chorus` test builds are not read (new fields).

## Tests and measurements

Full record in [TESTING.md](TESTING.md). In short:

- **In the emulator (rytm-emu):** the pages open, choose an effect, set and close as described; stock does nothing with the extra key presses. Each effect puts its return on the PRE words, and each runs with all eight voices sending. Through a test build fed by a sample's digital layer (the emulator's analog voice model cuts long sounds), a long snare with and without each effect was rendered for the author.
- **On a unit:** the chorus (earlier `stereo-chorus` build, same algorithm) "sounds really good" to the author. The flanger, the phaser and this build's pages are not tested on a unit yet.
- **Memory:** about 13 KB of code and 16.7 KB of data (the line) in the 128 KB shared mod area (elekloader lint).
- **CPU:** see the limitation above; not measured on a unit.

## Screens and audio

![CHORUS on the FX page](media/fx-chorus.png)

![FLANGER on the FX page](media/fx-flanger.png)

![PHASER on the FX page](media/fx-phaser.png)

![The SEND page on the BD track](media/fx-send.png)

Captured in rytm-emu from build FX04 ([capture record](media/capture.json)). No audio preview is included.

## Authorship and licences

Send FX is by stigmagit, under GPL-3.0-or-later ([LICENSE](LICENSE)). Built on core-ar2 and elekloader (irpina, GPL-2.0-or-later). The FX return and receive buffers were located from the reverse engineering in [rytm-mods-src](https://github.com/Iced-Cream/rytm-mods-src) (MrScruff, Iced-Cream) and [rytm-emu](https://github.com/trigcondition/rytm-emu)'s notes, then read again in OS 1.74 for this mod. The page layout follows the style of Elektron's newer effect pages; every icon and the title font are this mod's own drawing. Emulator tests ran in rytm-emu. Screenshots: [media/LICENSE.md](media/LICENSE.md).
