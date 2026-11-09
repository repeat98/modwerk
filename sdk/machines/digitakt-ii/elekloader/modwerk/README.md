# Proposed Digitakt II sequencer note hook

## Playback grid prototype

`ev_seq_grid` observes the audio constructor before stock tests for a trig. It uses the existing playback detour and returns immediately when the collection is empty. The callback receives the originating pattern, track and step plus four adjacent deadlines in stock musical time. The base derives these from the stock tick, lookahead, speed table and per-step swing flags. The callback is read-only.

The prototype covers ordinary audio tracks during playback. On initial PLAY, the existing queue bridge publishes step zero when stock created an audio source event. It skips mapped and Euclidean tracks and non-pattern sources. The stock constructor chooses which pattern supplies a step during a pattern switch. The four read-only callbacks run in subscription order in the sequencer context. The collection uses an Elekloader symbol.

Digikit `d6de4d0` reported 50 windows at swung 2× and 26 at straight 1×, including the PLAY source and rests. All 40 captured playback notes matched their grid onset. The empty, observer and renderer builds preserved the stock relative queue deadlines in the swung 2× fixture. The renderer used the Chord Arp engine at 1/32 and generated 174 checked note requests. It submitted no events. The renderer image SHA-256 was `570640af06a9fa642badb5c7515bb911df98da467720e25a326d6f0fe1010190`.

## Audio phrase proposal

```c
void observe(const struct dt2_seq_grid_window *window);
uint32_t phrase(const struct dt2_seq_grid_window *window, uint32_t pitch,
                uint32_t velocity, struct dt2_seq_phrase_note *notes);
```

`ev_seq_grid` observes the existing PLAY and audio constructor bridges listed below. `ev_seq_audio_phrase` runs at the existing PLAY bridge and at the stock audio submission call on OS 1.17, address `0x400d82f8`, one instruction and six bytes, SHA-256 `74cb3c143b6a825d695e48fbac2bca8e5ce59700baca9721a368828f7bbba81e`. Both collections run synchronously on stock sequencer deadlines. Chord Arp's private diagnostic now subscribes to the draft collections. The existing Euclidean pitch callback keeps its current interface and path.

The base calls up to four phrase subscribers in subscription order. Zero passes the source through to the next subscriber. A return of `DT2_SEQ_PHRASE_REST` consumes the source trig. A valid count from one to eight requests replacement with bounded note-on and release pairs. The first valid request owns the source. Invalid requests pass through and an allocation refusal preserves stock. The base reserves queue space and event records before committing. The module never sees a stock queue pointer or takes ownership of an event record.

Ordinary trigs use the stock pitch and velocity fields, including explicit per-trig values. Initial PLAY can replace a source whose startup payload is empty. The base allocates its own payload for those generated notes. Microtimed trigs, MIDI, and playback through source rests fall back to stock. The empty collection takes the stock submission path.

Digikit fixtures exercised PLAY and subsequent loops, two concurrent tracks, 2× swing, stock tempo nudging, STOP, mute and pattern changes. At simultaneous pressure on all 16 tracks, six received complete eight-hit phrases at each tested window and ten retained their stock trigs. Hardware qualification of this proposal remains open.

## Pitch callback

`ev_seq_note` is a pitch-only callback for the OS 1.17 sequencer. The base calls it after stock constructs the note and before the event enters the stock queue. PLAY and subsequent steps use the same callback contract. The base passes the pattern that generated the note, the sounding track, the stock step, root and a twelve-bit scale mask relative to that root. The base sets `DT2_SEQ_NOTE_EUCLIDEAN` for the verified Euclidean event shape on the audio path.

Subscribers receive a read-only context and the current pitch. The linker orders the callbacks by subscription order. Each receives the previous callback's accepted result. A result outside 0–127 retains the current pitch. There are four slots, and an empty collection preserves the incoming pitch. The dispatcher does no allocation or timing work and changes no pattern records.

The [base recipe](../base.json) builds this draft beside the unchanged imported core. `seq-note-entry.s` bridges the PLAY queue and the audio note constructor used during playback. It preserves the stock arguments and continuation at each site. The constructor receives the pattern for the queued note before the active-pattern pointer switches. `seq-note-bridge.c` validates the event and pattern pools and constructs the callback context. It passes through events with a stock trig override index, since stock sources those notes from the override record. The public interface awaits review.

The bridge uses the OS 1.17 regions below. The scale rows are read in place using the stock keyboard predicate's layout. The bridge does not ship a copy of that data.

| Region | Address | Length | SHA-256 |
| --- | --- | --- | --- |
| PLAY queue call and stack cleanup | `0x400d6632` | 3 instructions, 6 bytes | `99ffb4255cee5ce97ab12b419a0363d57b6cec99f924416364629a96d93a8f0e` |
| Audio step constructor arguments and call | `0x400d81fc` | 3 instructions, 8 bytes | `51280ae0eb20244d34b609595a75a5a3f34301c01e6e27eed44875d43075d7a4` |
| Stock scale membership rows | `0x402258c4` | 35 rows, 455 bytes | `7c99f5c1ce7e99dfd6a514304e08d982a58d7b85aa9c1f8de88dd9c5d6d01adc` |

Local Windows C11 checks exercised empty and full subscriber collections. They verified the eight-byte context layout on the host, callback order, handling of invalid pitches, and that pitch zero is accepted. The firmware bridge and target ABI still need a ColdFire build and emulator verification.

The Windows C dispatcher also ran through a host-side digikit probe on stock Digitakt II OS 1.17. With no subscribers, all 18,636 captured frame headers after the playback anchor matched stock byte for byte. With a test subscriber, the F Mixolydian reroll changed pitches, repeated across loops, and preserved the timing of all 61 note-ons and 37 note-offs. The F-sharp Mixolydian fixture quantized F5 to E5 with all 22 note event times preserved. With a live tempo and swing change, all 41 note-ons and 29 note-offs matched the equivalent stock run. The regular-trig control matched stock across all 4,545 captured frame headers.

A separate, fixture-only ColdFire bridge was assembled and linked with GCC 13.1.0 for MCF54455. In digikit, both guarded entry points called the C dispatcher, including on PLAY. A subscriber changed all 13 F5 note-ons to E5, with all 22 note event times matching stock. The empty collection and regular-trig cases retained every captured header byte and note event time. Five empty-collection non-note frames shifted by at most nine emulator instructions. The subscriber image also saved coupled ColdFire and SHARC ready snapshots after 8,540 frames, with zero missing blocks and no halt.

The general bridge was tested in a private OS 1.17 diagnostic image built with the same toolchain (`bea5da9d47385e19a7054dfcaa107a014404c9aba27a9032af9d9e24b6a98996`). Two simultaneous Euclidean tracks and direct PLAY on A02 track 2 used the expected context. A01 to A02 switched scales on A02's first note. The empty collection and regular-trig controls preserved all captured header bytes. Note-event times matched stock in those cases and across 35 PLAY, pause, resume and restart events. With track 2 at 2× and live changes to tempo and swing, all 133 note events stayed in the same DSP frames. One frame send shifted by 97 emulator instructions. The image passed framing, checksum and HMAC checks and saved both coupled ready snapshots after 8,540 frames with zero missing blocks and no halt. The diagnostic subscriber and images are local emulator test material. They do not qualify the base or the module for hardware.

The next diagnostic used the kit-pinned Elekloader SDK `3b31ef3` and the Windows GCC 13.1.0/binutils 2.40 toolchain. Elekloader linked the hook into the normal `core-dt2` 1.1 package, with zero or one subscriber. The package retained the 1.0 reference sites and interface entries listed in the recipe. Both released perform packages also linked separately and together with this base. Both images passed framing, packet checksum and HMAC checks and kept every non-MAIN OS section byte-identical. The linked subscriber image (`8f6b5c8212b69a8d1e34feb2c7a67b895859efbfbefb1e657abb5e780baaaf1c`) saved both ready snapshots after 7,750 frames with zero missing blocks and no DSP halt.

On that linked build, the empty collection preserved all 5,909 captured playback frame headers. The subscriber changed stock note-ons at 60 to 61 or 62. All 32 note events stayed in the stock DSP frames in both runs, with one frame send 12 emulator instructions apart. A panel-edited Euclidean trig fixture reached the bridge 21 times and the dispatcher 18 times. The three events with an override index skipped the dispatcher, and both override notes in the audible window kept stock pitch 60. Playback started one DSP frame later relative to the panel anchor. From the first note, all 32 note-event times matched stock exactly. This checks the stock override path for that fixture. A distinct manually entered pitch lock and other lock types still need tests.

A MIDI Euclidean track on channel 1 reached the stock MIDI constructor 37 times in both builds and never called the audio pitch dispatcher. The bytes at the MIDI transmit entry matched stock for all 20 note-ons and 19 note-offs. Send times differed by up to 972 emulator instructions relative to the PLAY anchor.

The pinned GCC 16.2.0/binutils 2.47 base reproduced [the same package](../../base-binding.json) twice. It linked with each released perform package and with both together. Both diagnostic images passed framing, packet checksum and HMAC checks and preserved every non-MAIN section. The base-only image (`75ff5a0f6e9a09929103c2212dfb5d556d510106b6fc00d5451cf5e66db8ed27`) and the image linked with the existing GCC 13.1.0 fixture subscriber (`152e461d7974e4d0546343f1adf463bde6f9a7c9bc1daaefd4118aa81e09c0b3`) each saved coupled ready snapshots after 7,750 DSP frames with zero missing blocks and no halt.

The pinned base repeated the stock comparisons above in digikit `d6de4d0`: all 5,909 frame headers with an empty hook, 32 note events in the same DSP frames with the subscriber, three explicit override records skipped by the dispatcher, and all 39 stock MIDI note messages matched. The override fixture still started one DSP frame later relative to PLAY and matched all event times when aligned to the first note. Hardware qualification remains open.

## Active project generation

`project-generation.h` exposes a read-only generation for modules with temporary project state. Capture the generation when populating that state and compare it for equality before reading the state again. Saving the project does not replace the active project.

Two guarded OS 1.17 sites cover loading a saved project and initializing a new project. Both check that stock is operating on the active project and replay the displaced stock operations. The generation lives in RAM and adds no data to the project format.

The project-replacement entry points also clear each contributed kit-data block and notify its `changed(kit, 0)` callback. A saved load fills the blocks from its kit records. A new project starts with empty blocks even if it is saved before the UI ticks. `core_project_kitdata_generation` exposes the same generation on bases that provide this guarantee.

Two isolated pinned builds produced base SHA-256 `c4992eba731456afa6254e28a3f51e681e98ce97bae2a6d919e0053cf4f49583`. The base retains the previous 18 sites and exports and links with both Perform modules separately and together. In digikit, Euclidean Scale restored its kit data on saved-project reload and cleared it on Create New. The combined image reached ColdFire and SHARC ready with zero missing blocks and no halt.

On 2026-11-08, Claptom-music reported that the combined K117 image `185fc6dbb84bb99f5477d22cead24ff7fc3e7f2e60c703168b83a207bf24bcf3` booted on their Digitakt II and restored the saved SCF switch and reroll melody after a scratch-project reload. Create New was verified in digikit.

Two isolated builds with GCC 16.2.0 and binutils 2.47 reproduced [the same base package](../../base-binding.json). The base kept the preceding package's sites and interface entries and linked with both released Perform modules, separately and together. In digikit `d6de4d0`, the exact build incremented the generation once on saved-project reload and once on **Create New**. Save and cancelled load kept the same generation. The base linked with Euclidean Scale reached ColdFire and SHARC ready after 7,750 DSP frames with no missing blocks or halt. Physical-unit verification is pending.
