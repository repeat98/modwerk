type Screenshot = { path: string; caption: string; alt: string; additional?: boolean }
type ScreenshotGuide = { version: string; screenshots: readonly Screenshot[] }
type Media = { path: string; caption: string; alt: string }

// Website teaching copy, separate from immutable module releases and capture evidence.
// Check each instruction against the module README and the actual image. Bind it to
// the displayed version so a future UI change cannot inherit an outdated walkthrough.
export const MODULE_MEDIA_GUIDES: Readonly<Record<string, ScreenshotGuide>> = {
  euclid: {
    version: '0.1.4-experimental',
    screenshots: [
      {
        path: 'media/ot-setup-monochrome.png',
        caption: 'Hold FUNC and press FX1 or FX2, choose Euclid with LEVEL and press YES. TYPE chooses the filter or AMP; RATE sets speed, ROT shifts the rhythm and ATK softens each pulse’s attack in ENV mode. Raise MIX to hear the effect.',
        alt: 'FX2 SETUP with Euclid selected and ROT, RATE, TYPE, ATK, ENV and MIX controls.',
      },
      {
        path: 'media/ot-controls-monochrome.png',
        caption: 'Press the same FX key, try STEPS 16 and PULSE 5, then press PLAY for five evenly spaced pulses per cycle. FREQ sets the starting cutoff, RES its resonance, DEPTH the sweep amount and DEC its decay. Center DEPTH to stop the sweep; MIX 0 in SETUP gives dry playback.',
        alt: 'Euclid main FX2 page with FREQ, RES, DEPTH, DEC, STEPS and PULSE.',
      },
      {
        "path": "media/ot-swing-track.png",
        "caption": "Select the track, press REC for Grid Recording, then FUNC + BANK for TRACK TRIG EDIT. Choose SWING and turn LEVEL for the track’s amount; TRIG keys choose affected steps and 50% is straight timing. Press NO and leave Grid Recording: Euclid follows this track swing during playback.",
        "alt": "TRACK TRIG EDIT with SWING selected and SWING TR1 at 62."
      },
    ],
  },
  miniverb: {
    version: '0.2.3-experimental',
    screenshots: [
      {
        path: 'media/ot-location.png',
        caption: 'Select an audio track, hold FUNC and press FX2. Turn LEVEL to Mini Verb and press YES, then press FX2 to reach its controls. Play a sample to hear the reverb tail.',
        alt: 'FX2 SETUP effect chooser with Mini Verb selected.',
      },
      {
        path: 'media/ot-controls.png',
        caption: 'Raise MIX on encoder F to hear the reverb. DECAY sets the tail length, DAMP darkens its decay and TONE on encoder C colors the wet output; TONE 64 is neutral. MOD and RATE add movement. MIX 0 gives dry playback.',
        alt: 'Mini Verb main FX2 page with DECAY, DAMP and TONE above MOD, RATE and MIX.',
      },
    ],
  },
  tapeecho: {
    version: '0.1.2-experimental',
    screenshots: [
      {
        path: 'media/ot-setup.png',
        caption: 'On an audio track, hold FUNC and press FX2. Choose Tape Echo with LEVEL and press YES. Press FX2 to reach the main page, where all six controls live.',
        alt: 'FX2 SETUP effect chooser with Tape Echo selected and no setup controls.',
      },
      {
        path: 'media/ot-controls.png',
        caption: 'Play a sample, set SYNC to BEAT and use TIME to choose a rhythmic delay; FREE uses milliseconds. Raise FDBK for more repeats, WOW for pitch wobble and AGE for darker, noisier repeats. MIX blends them with the sample; set it to 0 for dry playback.',
        alt: 'Tape Echo main FX2 page with TIME, FDBK, WOW, AGE, SYNC and MIX.',
      },
    ],
  },
  repitch: {
    version: '0.1.2-experimental',
    screenshots: [
      {
        path: 'media/ot-location.png',
        caption: 'Load a loop on a Flex or Static track, hold FUNC and press SRC. Turn encoder E (TSTR) to RPCH. This makes the loop follow project tempo by changing playback speed and pitch together.',
        alt: 'Static SRC SETUP with TSTR set to RPCH.',
      },
      {
        path: 'media/ot-controls.png',
        caption: 'Press SRC and play the loop: lower project BPM to slow and lower its pitch, or raise BPM to speed it up and raise its pitch. A 120 BPM loop at 90 BPM plays lower and lasts longer. PTCH is disabled but RATE still works; change TSTR back from RPCH to leave this mode.',
        alt: 'Static SRC main page with a loaded 120 BPM loop, PTCH OFF and RATE available.',
      },
      {
        path: 'media/ot-attributes.png',
        caption: 'To store Repitch in the sample settings instead, press AED on MKII, then FX1 for ATTR. Select TIMESTRETCH and use RIGHT to choose REPITCH. Set the track’s TSTR to AUTO so it follows this sample setting.',
        alt: 'Audio editor ATTR page with TIMESTRETCH set to REPITCH and original tempo 120 BPM.',
      },
    ],
  },
  tapehead: {
    version: '0.1.2-experimental',
    screenshots: [
      {
        path: 'media/ot-location.png',
        caption: 'Select a track playing a sample, hold FUNC and press FX1 or FX2. Choose TAPEHEAD with LEVEL and press YES, then press the same FX key for its controls. There are no extra controls in SETUP.',
        alt: 'FX2 SETUP effect chooser with TAPEHEAD selected.',
      },
      {
        path: 'media/ot-controls.png',
        caption: 'Raise DRIVE to round the peaks and thicken the sound. Raise TRIM to lower the output level as you add drive; lowering TRIM makes it louder. Try DRIVE 100 and TRIM around 40 on a drum loop, then select NONE in SETUP to compare with the dry track.',
        alt: 'TapeHead main FX2 page with DRIVE, TRIM and COLOR at their default positions.',
      },
      {
        path: 'media/ot-color.png',
        caption: 'Turn COLOR to choose NORM, MED or BRGT. NORM is darker; MED, shown here, and BRGT let more top end through the saturation. Compare the three at the same DRIVE and TRIM settings.',
        alt: 'TapeHead main page with the COLOR selector displaying MED.',
      },
    ],
  },
  'analog-bassdrum': {
    version: '0.1.2-experimental',
    screenshots: [
      {
        path: 'media/ot-location.png',
        caption: 'Select an audio track, hold FUNC and press SRC. Choose ANALOG BD in the machine list and press YES. It synthesizes a kick on this track; press SRC for the sound controls and place trigs to play it.',
        alt: 'SRC SETUP machine chooser with ANALOG BD selected and its shared setup controls.',
      },
      {
        path: 'media/ot-engines.png',
        caption: 'Double-tap the assigned track’s TRACK key to open this engine browser. Choose 808 or 909 with UP/DOWN or LEVEL and press YES. Switching engines keeps your knob settings, so adjust the sound after switching.',
        alt: 'Analog BD engine browser listing 001 808 and 002 909, with 808 selected.',
      },
      {
        path: 'media/ot-808.png',
        caption: 'For the 808, use PITCH for the body note and DECAY for the tail. TONE shapes the transient, ATK controls its strength and SWEEP changes the falling pitch. Raise SAT for more drive; use the track’s AMP VOL to set its playback level.',
        alt: 'Analog BD 808 main SRC page with PITCH, DECAY, TONE, ATK, SWEEP and SAT.',
      },
      {
        path: 'media/ot-909.png',
        caption: 'For the 909, PITCH sets the body note and DECAY its tail. Encoder C (labelled TONE in this capture) sets pitch-envelope duration; TDEP sets its depth. Raise ATK for more attack and SAT for drive; press STOP to stop playback.',
        alt: 'Analog BD 909 main SRC page with PITCH, DECAY, TONE, ATK, TDEP and SAT.',
      },
      {
        path: 'media/ot-setup.png',
        caption: 'Hold FUNC and press SRC for the controls shared by both engines: ACCNT sets accent level and LPF softens the top end. LOW and HIGH shape the desk EQ; 64 is neutral for each band. The normal AMP and FX pages are still available.',
        alt: 'Analog BD SRC SETUP with ACCNT, LPF, LOW and HIGH.',
        additional: true,
      },
    ],
  },
  'midi-scenes': {
    version: '0.2.5-experimental',
    screenshots: [
      {
        path: 'media/ot-channel.png',
        caption: 'Press MIDI and select a MIDI track. Hold FUNC and press SRC, then set CHAN with encoder A to your synth’s receive channel and press YES. This capture has CHAN OFF; choose a channel to send MIDI to your synth.',
        alt: 'MIDI NOTE SETUP with CHAN, BANK, PROG and SEND all OFF.',
      },
      {
        path: 'media/ot-setup.png',
        caption: 'Hold FUNC and press FX1 for MIDI CTRL 1 SETUP. Turn encoder C to assign CC1 to the controller you want to morph, then press YES. The example uses CC 74; check what that controller changes on your synth.',
        alt: 'MIDI CTRL 1 SETUP with CC1 assigned to 74 and SCNCTRL5 visible.',
      },
      {
        path: 'media/ot-location.png',
        caption: 'Press FX1 to return to CONTROL 1. Hold FUNC and press encoder C to enable CC1 if it reads OFF, then turn C to set its normal value. Here CC1 is enabled at 0; this is the starting value for the scene example.',
        alt: 'MIDI CONTROL 1 with CC1 enabled at 0 and the other visible controls OFF.',
      },
      {
        path: 'media/ot-scene-lock.png',
        caption: 'Hold SCENE A and press a TRIG key to assign a scene to that side. Keep SCENE A held and turn encoder C to 64: you are setting the scene’s CC1 value while the normal value stays at 0. Repeat with SCENE B for a second endpoint if desired.',
        alt: 'MIDI CONTROL 1 while Scene A is held, showing a CC1 scene value of 64.',
      },
      {
        path: 'media/ot-released.png',
        caption: 'Release the scene key: the page shows the normal CC1 value, 0, again. Move the crossfader toward Scene A to morph toward its value of 64, and away to return toward the other side’s value. Listen to the assigned control change on your connected synth.',
        alt: 'MIDI CONTROL 1 after releasing Scene A, with CC1 displaying the base value 0.',
      },
      {
        path: 'media/ot-arp.png',
        caption: 'Press AMP in MIDI mode for the arpeggiator. MODE is OFF in this capture; choose an arpeggiator mode to use it. Hold a scene key while editing an enabled parameter to make a scene lock, using the same hold-and-edit workflow as CC1.',
        alt: 'MIDI ARPEGGIATOR with TRAN, LEG, MODE, SPD, RNGE and NLEN; MODE is OFF.',
        additional: true,
      },
      {
        path: 'media/ot-lfo.png',
        caption: 'Press LFO in MIDI mode. SPD1–3 set the three LFO speeds and DEP1–3 their depths; FUNC + LFO opens destination and waveform setup. Hold a scene key while changing a parameter to store its scene value.',
        alt: 'MIDI LFO page with SPD1, SPD2, SPD3, DEP1, DEP2 and DEP3.',
        additional: true,
      },
      {
        path: 'media/ot-control2.png',
        caption: 'Press FX2 in MIDI mode for CC5–10. Assign controller numbers in FUNC + FX2 SETUP, then enable the controls before editing scene values. They are all OFF here, so this image shows the page location rather than an active scene lock.',
        alt: 'MIDI CONTROL 2 with CC5 through CC10 all OFF.',
        additional: true,
      },
    ],
  },
  quantizer: {
    version: '0.1.2-experimental',
    screenshots: [
      {
        path: 'media/ot-location.png',
        caption: 'On MKII, press PROJ, select CONTROL and press RIGHT. Choose SEQUENCER and press YES. Scale Quantizer’s settings live in this project menu and use no effect slot.',
        alt: 'Project menu with CONTROL selected and SEQUENCER highlighted in its submenu.',
      },
      {
        path: 'media/ot-scale.png',
        caption: 'Scroll to SCALE and turn LEVEL to choose a scale, such as MAJOR here. PTCH edits and chromatic trig keys now snap to its notes. Choose OFF to return to the normal pitch behavior.',
        alt: 'CONTROL SEQUENCER menu with SCALE selected and set to MAJOR.',
      },
      {
        path: 'media/ot-root.png',
        caption: 'Scroll to ROOT and turn LEVEL to choose the key. C plus MAJOR gives C major; changing ROOT transposes the scale. Try the chromatic trig keys: key 1 plays the root.',
        alt: 'CONTROL SEQUENCER menu with ROOT selected at C and SCALE set to MAJOR.',
      },
      {
        path: 'media/ot-glide.png',
        caption: 'GLIDE sets the slide time between legato notes. Enable LEG on the track’s AMP SETUP page to use it, then turn LEVEL on this row to set the amount. GLIDE OFF, shown here, disables the slide.',
        alt: 'CONTROL SEQUENCER menu with GLIDE selected at OFF, below SCALE MAJOR and ROOT C.',
      },
    ],
  },
  previewvol: {
    version: '0.1.2-experimental',
    screenshots: [
      {
        path: 'media/ot-amp-volume.png',
        caption: 'Preview Vol works automatically when included in your build. Press AMP and use encoder D to lower the track’s VOL, as shown at -64. Sample auditioning uses default AMP VOL (displayed 0), while normal track playback keeps your stored volume.',
        alt: 'Track AMP page with VOL set to -64.',
      },
      {
        path: 'media/ot-flex-slot.png',
        caption: 'Double-tap a Flex or Static track’s TRACK key and select a sample with UP/DOWN or LEVEL. Use FUNC + YES to audition through MAIN or CUE + YES through CUE; press NO to stop. Only audition AMP VOL changes; sample loudness, FX and mixer levels still affect what you hear.',
        alt: 'Flex sample slot list with an original preview tone loaded in slot 1.',
      },
      {
        path: 'media/ot-file-browser.png',
        caption: 'Press YES from the slot list to open the file browser. Select a file and use FUNC + YES or CUE + YES to audition it before loading. Press NO to stop the preview; return to normal playback to check that the track’s stored AMP VOL is preserved.',
        alt: 'LOAD FILE TO FLEX 1 browser with PREVIEW_440_120.wav selected.',
      },
      {
        path: 'media/ot-audio-editor.png',
        caption: 'With a sample loaded, press AED on MKII to open the audio editor. The same FUNC + YES and CUE + YES shortcuts audition it here. This capture shows editor access; it does not demonstrate a rendered waveform or measured audio level.',
        alt: 'MKII Flex audio editor with TRIM, SLICE, EDIT, ATTR and FILE tabs; waveform area is blank.',
      },
      {
        path: 'media/ot-main-preview.png',
        caption: 'From the sample slot list, hold FUNC and press YES to preview through MAIN. The list stays on screen during this shortcut. Preview Vol substitutes the default AMP VOL for the audition; press NO to stop.',
        alt: 'Flex sample slot list captured during FUNC + YES main-output audition.',
        additional: true,
      },
      {
        path: 'media/ot-cue-preview.png',
        caption: 'Hold CUE and press YES to audition the selected sample through CUE instead. The LCD looks the same as the MAIN preview; the shortcut chooses the output. CUE and mixer levels still apply.',
        alt: 'Flex sample slot list captured during CUE + YES cue-output audition.',
        additional: true,
      },
      {
        path: 'media/ot-static-slot.png',
        caption: 'Static tracks use the same preview workflow: double-tap the TRACK key, select a sample, then use FUNC + YES for MAIN or CUE + YES for CUE. Press NO to stop and return to normal track playback.',
        alt: 'Static sample slot list with a sample assigned to slot 1.',
        additional: true,
      },
    ],
  },
  'cc-map': {
    version: '0.1.2-experimental',
    screenshots: [
      {
        path: 'media/ot-midi-location.png',
        caption: 'On MKII, press PROJ, choose MIDI and press RIGHT. Select CONTROL and press YES. CC Map uses incoming MIDI to change audio-track FX SETUP controls; enable that input here first.',
        alt: 'Project MIDI submenu with CONTROL selected.',
      },
      {
        path: 'media/ot-cc-enabled.png',
        caption: 'Select AUDIO CC IN and turn LEVEL to enable its checkbox. This allows your MIDI controller to change audio-track controls. Connect the controller to the Octatrack’s MIDI input.',
        alt: 'MIDI CONTROL menu with AUDIO CC IN selected and enabled.',
      },
      {
        path: 'media/ot-channels.png',
        caption: 'Open MIDI > CHANNELS and match your controller’s output channel to the target track’s TRIG CH. Here T1 uses channel 1. AUTO CH 11 is a separate setting; use channel 1 for this example.',
        alt: 'MIDI CHANNELS menu showing AUTO CH 11 and T1 TRIG CH 1.',
      },
      {
        path: 'media/ot-fx1-setup.png',
        caption: 'Select T1, hold FUNC and press FX1, then choose FILTER with LEVEL and press YES. Its SETUP page starts with HP at 12 dB. CC 68–73 address the six FX1 SETUP controls in encoder order; CC 68 targets HP.',
        alt: 'T1 FILTER FX1 SETUP with HP at 12 dB and LP, ENV, HOLD, Q and DIST visible.',
      },
      {
        path: 'media/ot-cc68-filter.png',
        caption: 'Send CC 68 with value 1 on MIDI channel 1, then close and reopen SETUP. HP now reads 24 dB, confirming that the message reached T1’s first FX1 SETUP control. Use the other mapped CCs to change the remaining setup controls.',
        alt: 'T1 FILTER FX1 SETUP after incoming CC 68 value 1, with HP changed to 24 dB.',
      },
      {
        path: 'media/ot-fx1-main.png',
        caption: 'Press FX1 for the normal FILTER page. Hold FUNC and press FX1 to return to SETUP, where CC Map’s added CC 68–73 mapping operates. Use the setup page to inspect the control changed by your MIDI message.',
        alt: 'T1 FILTER main FX1 page, outside the SETUP page controlled by CC 68–73.',
        additional: true,
      },
    ],
  },
  'sidechain-compressor': {
    version: '0.2.0-experimental',
    screenshots: [
      {
        path: 'media/ot-compressor-selection.png',
        caption: 'Select the audio track you want to duck. Hold FUNC and press FX1 or FX2, choose COMPRESSOR with LEVEL and press YES. Its SETUP page adds MON, KEY, KGN, KBAS and KWID to the usual compressor.',
        alt: 'COMPRESSOR selected in FX1 SETUP, with KEY OFF and MON OFF.',
      },
      {
        path: 'media/ot-sidechain-key-selected.png',
        caption: 'Use encoder C to choose the track that drives the compressor: KEY T2, shown here, listens to T2. KGN sets the level of that detector signal; KBAS and KWID filter it (a high-pass in Hz and a low-pass a set number of octaves above it). Leave MON OFF for normal listening; KEY OFF returns to compression driven by the receiving track itself.',
        alt: 'COMPRESSOR FX1 SETUP with KEY set to T2 and MON OFF.',
      },
      {
        path: 'media/ot-compressor-main.png',
        caption: 'Press the same FX key for this page and play both tracks. Raise RAT and lower THRS until the receiving track dips when the selected key track plays. ATK shapes the onset, REL the recovery and GAIN the output level. MIX 0 gives the dry signal.',
        alt: 'COMPRESSOR main FX1 page with ATK, REL, THRS, RAT, GAIN and MIX.',
      },
    ],
  },
  "synth": {
    "version": "0.1.1-experimental",
    "screenshots": [
      {
        "path": "media/ot-location.png",
        "caption": "Select an audio track, hold FUNC and press SRC, then choose FM SYNTH with UP/DOWN and press YES. No sample is needed; place a trig and press PLAY to hear the synth.",
        "alt": "SRC SETUP machine list with FM SYNTH selected."
      },
      {
        "path": "media/ot-controls.png",
        "caption": "Press SRC, set RATO to 1 and raise INDX from 0 to turn a sine tone into a richer FM sound. PTCH sets pitch, FINE tunes it, FDBK adds feedback and DEC shortens the modulation envelope. Use AMP for the volume envelope; press STOP twice to silence the voice.",
        "alt": "FM SYNTH sound page with PTCH, RATO, INDX, FINE, FDBK and DEC."
      },
      {
        "path": "media/ot-voices.png",
        "caption": "Press LFO and use encoder C (VOIC) to choose 2–4 voices, then F (CHRD) for a chord shape. The picture starts at one voice with no chord; increase VOIC before trying chords. All voices share the track filter and AMP.",
        "alt": "FM Synth LFO page with VOIC at 1 and CHRD at ----."
      },
      {
        "path": "media/ot-legato.png",
        "caption": "Hold FUNC and press AMP for LEG. OFF retriggers the envelope, MONO keeps one envelope across overlapping notes and POLY enables paraphonic legato. Choose OFF to return to separate attacks.",
        "alt": "FM Synth AMP SETUP with LEG OFF."
      },
      {
        "path": "media/ot-scale.png",
        "caption": "Open PROJECT > CONTROL > SEQUENCER and turn LEVEL on SCALE to choose a scale, such as MAJOR here. Pitch edits and chromatic keys follow that scale; SCALE OFF restores ordinary pitch behavior.",
        "alt": "CONTROL SEQUENCER menu with SCALE set to MAJOR.",
        "additional": true
      },
      {
        "path": "media/ot-root.png",
        "caption": "In the same menu, select ROOT and turn LEVEL to choose the key. C with MAJOR gives C major; ROOT has no effect while SCALE is OFF.",
        "alt": "CONTROL SEQUENCER with SCALE MAJOR and ROOT C.",
        "additional": true
      },
      {
        "path": "media/ot-glide.png",
        "caption": "Select GLIDE and turn LEVEL to set the slide time between legato notes. Enable LEG in FUNC + AMP to use it; GLIDE OFF, shown here, disables the slide.",
        "alt": "CONTROL SEQUENCER with GLIDE OFF below SCALE and ROOT.",
        "additional": true
      }
    ]
  },
  "vector": {
    "version": "0.2.3-experimental",
    "screenshots": [
      {
        "path": "media/ot-location.png",
        "caption": "Select an audio track and double-tap SRC for the machine chooser. Choose VECTOR and press YES, then choose its backing sample pool. Use a tuned sample: the generator treats its neutral pitch as C.",
        "alt": "SRC SETUP with VECTOR selected and SEED, SPAN, OFST, ROT, RPT and DIR controls."
      },
      {
        "path": "media/ot-pool-choice.png",
        "caption": "Choose STATIC or FLEX with UP/DOWN or LEVEL, then press RIGHT to open that pool. Load or select a sample with the normal slot tools and press YES on its slot to assign the pool and sample. Double-tap TRACK to return here later.",
        "alt": "VECTOR backing-pool menu with STATIC and FLEX choices."
      },
      {
        "path": "media/ot-generator.png",
        "caption": "Press SRC and play the pattern. DENS changes note density, ROOT and SCAL choose its key, GATE sets note duration and ACNT adds level accents; TYPE changes the phrase style. Turning a control immediately rewrites the phrase with the same seed.",
        "alt": "VECTOR main SRC page with TYPE, DENS, ROOT, SCAL, GATE and ACNT."
      },
      {
        "path": "media/ot-generated.png",
        "caption": "Press YES on the generator for a new variation: SEED advances and the phrase is committed. Try several variations, then shape the one you like with the knobs. STOP/PLAY keeps the phrase; selecting normal FLEX or STATIC removes VECTOR but retains the generated pattern.",
        "alt": "VECTOR generator during playback after creating a variation."
      },
      {
        "path": "media/ot-edit.png",
        "caption": "Push LEVEL on SRC to switch to the ordinary sample controls. In Grid Recording, hold a trig and turn PTCH to edit its note; AMP exposes the generated HOLD and VOL locks. Push LEVEL again to return to the generator.",
        "alt": "VECTOR sample-edit page with PTCH, STRT, LEN, RATE, RTRG and RTIM."
      },
      {
        "path": "media/ot-setup.png",
        "caption": "Double-tap SRC for the secondary controls. SEED selects a variation, SPAN and OFST set its pitch window, ROT shifts it, RPT sets motif length and DIR reverses it. Edits commit immediately; press SRC to return.",
        "alt": "VECTOR SRC SETUP with SEED, SPAN, OFST, ROT, RPT and DIR.",
        "additional": true
      },
      {
        "path": "media/ot-static-pool.png",
        "caption": "In pool choice, highlight STATIC and press RIGHT for the Static sample slots. YES on a loaded slot assigns it to VECTOR; RIGHT opens the file browser and LEFT returns to pool choice.",
        "alt": "Static sample-slot list with SINE440.WAV assigned to slot 1.",
        "additional": true
      },
      {
        "path": "media/ot-flex-pool.png",
        "caption": "Choose FLEX and press RIGHT to use the Flex sample and recorder slots. Select a loaded slot and press YES to assign it; the arrow keys navigate without changing the assigned pool until you confirm a slot.",
        "alt": "Flex sample and recorder-slot list.",
        "additional": true
      }
    ]
  },
  "playmodes": {
    "version": "0.1.0-experimental",
    "screenshots": [
      {
        "path": "media/ot-mode-all-reversed.png",
        "caption": "On the main screen, hold TRACK 1 and press DOWN to select REVERSED, then press PLAY. SCALE MODE NORMAL applies one mode to every track, hence ALL REVERSED; PER TRACK lets you choose a mode for each track.",
        "alt": "Main screen with ALL REVERSED playback-mode popup."
      },
      {
        "path": "media/ot-mode-all-pingpong2.png",
        "caption": "Keep TRACK held and press DOWN twice more for PINGPONG 2: the sequencer bounces and repeats the end steps. Continue DOWN for RANDOM or SHUFFLE, or press UP to go back. Hold TRACK and press UP until NORMAL to restore ordinary playback.",
        "alt": "Main screen with ALL PINGPONG 2 playback-mode popup."
      }
    ]
  },
  "mute-modes": {
    "version": "0.1.0-experimental",
    "screenshots": [
      {
        "path": "media/ot-system.png",
        "caption": "Open PROJECT > SYSTEM, choose PERSONALIZE and select MUTE MODE. Try the modes while playing a track with a long delay or reverb tail to hear what muting leaves audible.",
        "alt": "Project SYSTEM menu listing PERSONALIZE."
      },
      {
        "path": "media/ot-mute-otfx.png",
        "caption": "Use LEFT/RIGHT on MUTE MODE, or YES to cycle, and choose OTFX. Muting cuts the dry signal while delay and reverb tails continue; new trigs still fire underneath.",
        "alt": "PERSONAL SETTINGS with MUTE MODE set to OTFX."
      },
      {
        "path": "media/ot-mute-otfx-t.png",
        "caption": "Choose OTFX-T to keep the effects tails but suppress new trigs while muted. Compare muting and unmuting the same passage with OTFX to hear the difference.",
        "alt": "PERSONAL SETTINGS with MUTE MODE set to OTFX-T."
      },
      {
        "path": "media/ot-mute-dt-t.png",
        "caption": "Choose DT-T to let the current voice finish its AMP envelope and stop new trigs. This gives a different mute response from cutting the dry signal immediately.",
        "alt": "PERSONAL SETTINGS with MUTE MODE set to DT-T."
      },
      {
        "path": "media/ot-mute-ot.png",
        "caption": "Choose OT to restore the stock mute cut. This is the starting mode shown here; the setting applies globally rather than occupying an effect slot.",
        "alt": "PERSONAL SETTINGS with MUTE MODE set to OT."
      }
    ]
  },
  "recorder-loop-fix": {
    "version": "0.1.0-experimental",
    "screenshots": [
      {
        "path": "media/ot-flex-setup.png",
        "caption": "Recorder Loop Fix works automatically when included in your build. In a disposable project, select FLEX in FUNC + SRC SETUP and assign the track to its own recorder buffer. It needs no extra control or effect slot.",
        "alt": "SRC SETUP with FLEX highlighted."
      },
      {
        "path": "media/ot-recorder-setup.png",
        "caption": "Set recording length RLEN to 16 at 128 BPM and place recording and playback trigs at the bar start; SRC3 selects the source track for sound-on-sound. Record a sustained tone and listen through successive wraps, then STOP and PLAY to compare restarts. Fractional loop lengths can still repeat or skip one sample.",
        "alt": "RECORDING 1 SETUP 1 showing recording length 16 and SRC3 T1."
      }
    ]
  },
  "digitakt-digichain": {
    "version": "1.6.1-experimental",
    "screenshots": [
      {
        "path": "media/chooser.png",
        "caption": "Include digichain with Digi Poly or Digi Mono; it provides their machine registration and has no page of its own. For this example, press FUNC + SRC, choose POLY and confirm with YES.",
        "alt": "Digitakt machine chooser with POLY selected."
      },
      {
        "path": "media/chord.png",
        "caption": "Press TRIG, set NOT1 as the root, NOT2 to +4 and NOT3 to +7, then trigger the track for a major chord using the available voice pool. These are Digi Poly controls supplied through digichain. Select ONESHOT to return to sample playback.",
        "alt": "Digitakt POLY TRIG page with NOT1 through NOT4 and chord controls."
      }
    ]
  },
  "digitakt-digieq": {
    "version": "1.0.2-experimental",
    "screenshots": [
      {
        "path": "media/eq.png",
        "caption": "Press FUNC + LFO twice for Master EQ (2/4) and play a pattern. Knobs A–D set band levels and E–H their frequencies; try a small low-frequency cut with A and E. The four columns pair each level with its frequency.",
        "alt": "Digitakt Master EQ page with four band levels at 0 dB and their frequencies."
      },
      {
        "path": "media/q-type.png",
        "caption": "Press A–D to edit band Q, or E–H to choose the filter type; press again to return to level and frequency. Hold FUNC and LFO, then press PLAY (CLEAR) to restore all four bands to the flat defaults. HP, LP, BP and notch still filter at 0 dB until their types are reset.",
        "alt": "Master EQ with pressed knobs displaying Q and LSHF, BELL, BELL and HSHF types."
      }
    ]
  },
  "digitakt-digihealth": {
    "version": "1.0.2-experimental",
    "screenshots": [
      {
        "path": "media/settings.png",
        "caption": "Open SETTINGS and tick SYSTEM INFO, then return to a playing pattern. The top bar alternates CPU/DSP load and free-memory figures every two seconds. Untick SYSTEM INFO to hide it.",
        "alt": "Digitakt Settings with SYSTEM INFO enabled and CPU/DSP fields showing dashes."
      },
      {
        "path": "media/status-a.png",
        "caption": "Wait for the memory page: RAM is free heap memory and SMP is sample memory. These figures describe the current system, so compare the same project and passage when checking a change.",
        "alt": "Digitakt AMP page with RAM 13.5M and SMP 64.0M in the top bar."
      },
      {
        "path": "media/status-b.png",
        "caption": "On the load page, CPU and DSP show current and recent peak workload on hardware. The dashes in this emulator capture mean timing is unavailable; they are not zero load. Keep the passage unchanged when comparing settings.",
        "alt": "Digitakt SRC page with CPU and DSP timing fields displayed as dashes."
      },
      {
        "path": "media/fast-audio.png",
        "caption": "FAST AUDIO normally starts after boot; untick it in SETTINGS to disable it until the next power-on. Compare several readouts of the same passage with it enabled and disabled. The screenshot shows the setting, not a measured speed improvement.",
        "alt": "Digitakt Settings with FAST AUDIO selected and enabled."
      }
    ]
  },
  "digitakt-digimatrix": {
    "version": "1.0.1-experimental",
    "screenshots": [
      {
        "path": "media/settings.png",
        "caption": "Open SETTINGS, select MOD MATRIX and press YES. The 0/8 counter here means none of its eight routing slots is enabled yet. Set a slow LFO on a source track before adding a route.",
        "alt": "Digitakt Settings with MOD MATRIX selected at 0/8."
      },
      {
        "path": "media/slots-off.png",
        "caption": "Choose a slot with UP/DOWN or LEVEL and press YES to enable it. Knobs edit only enabled slots; pressing YES again disables the selected route.",
        "alt": "MOD MATRIX page with eight disabled slots and the first slot selected."
      },
      {
        "path": "media/route.png",
        "caption": "Use A for source track, B for LFO, C for destination track, D for parameter and E for depth. Here T1 LFO1 modulates T1 LFO1 speed at depth 2; try T4 and FLT.FREQ to hear a filter move instead. OWN controls whether the source also keeps its own LFO destination; NO leaves the page.",
        "alt": "Enabled matrix slot routing T1 L1 to T1 L1.SPD with depth 2."
      }
    ]
  },
  "digitakt-digimono": {
    "version": "0.13.3-experimental",
    "screenshots": [
      {
        "path": "media/chooser.png",
        "caption": "On an audio track, press FUNC + SRC, choose MONO SIN below SLICE and press YES. Digi Mono needs digichain in the build and synthesizes its own audio, so no sample is required.",
        "alt": "Digitakt machine chooser with MONO SIN selected."
      },
      {
        "path": "media/sin.png",
        "caption": "Use knob A (TUNE) for pitch and AMP for a short note envelope. Press FUNC + TRK and play trig keys to hear the sine voice; the other SRC cells are blank because SIN has no extra controls. Stop and leave keyboard mode, or select ONESHOT to return to samples.",
        "alt": "MONO SIN page with TUNE and seven unused SRC cells."
      },
      {
        "path": "media/saw.png",
        "caption": "Choose MONO SAW in FUNC + SRC for a brighter voice. UNIL and UNIW add unison level and detune, UNIX sets the number of unison saws, and SUB1/SUB2 add lower octaves. Shape note duration on AMP.",
        "alt": "MONO SAW page with TUNE, UNIL, UNIW, UNIX, SUBX, SUB1 and SUB2."
      },
      {
        "path": "media/noise.png",
        "caption": "Choose MONO NOISE for noise synthesis. ST reduces the rate of new noise values, RED makes it darker and STON ties the noise to note pitch; use AMP to make a short percussion hit. The current emulator frame omits the common track/level sidebar.",
        "alt": "MONO NOISE page with TUNE, ST, RED and STON.",
        "additional": true
      },
      {
        "path": "media/pulse.png",
        "caption": "Choose MONO PULSE and use D (PW) to change pulse width, with E/F (PWAD/PWRS) for modulation depth and rate. G/H add SUB1/SUB2, matching MONO SAW; B/C retain the unison controls.",
        "alt": "MONO PULSE page with unison, sub-octave and pulse-width controls.",
        "additional": true
      },
      {
        "path": "media/ens.png",
        "caption": "Choose MONO ENS and set PCH2–4 to tune its extra oscillators. WAVE blends saw and pulse; raise CHRL from 0 for chorus and use CHRW for its width. The current emulator frame omits the common TUNE/sidebar regions; their full redraw is unverified.",
        "alt": "MONO ENS page with PCH2, PCH3, PCH4, PW, WAVE, CHRL and CHRW.",
        "additional": true
      },
      {
        "path": "media/vo.png",
        "caption": "Choose MONO VO and select the start and target vowels with VOC1 and VOC2. V-SW sets the glide between them; CONS, CLEN and CVOL add a consonant at note start. VOIC blends breath noise into the voice.",
        "alt": "MONO VO page with vowel, breath and consonant controls.",
        "additional": true
      }
    ]
  },
  "digitakt-digineighbor": {
    "version": "0.6.1-experimental",
    "screenshots": [
      {
        "path": "media/chooser.png",
        "caption": "Put a sample and trigs on T1, then select T2 and choose NEIGHBOR with FUNC + SRC. Press YES to confirm; T2 will process another track’s audio rather than a sample of its own.",
        "alt": "Digitakt T2 machine chooser with NEIGHBOR selected."
      },
      {
        "path": "media/src.png",
        "caption": "Set SLOT on T2 to 1 to receive T1, then add a T2 trig. Start with TUNE 0, GAIN 0 dB and LEV 100; SLOT 0 or T2’s own number produces silence. TUNE can pitch-shift the routed audio.",
        "alt": "NEIGHBOR SRC page with TUNE, BR, SLOT, GAIN and LEV."
      },
      {
        "path": "media/amp.png",
        "caption": "On T2’s AMP page, use a long HOLD or DECAY so the envelope lets T1 through. Lower T1’s AMP VOL to hear only T2: the source tap is before that volume. Restore T1’s volume and set T2 SLOT to 0 when finished.",
        "alt": "Receiving track controls for ATK, HOLD, DEC, OVER, DEL, REV, PAN and VOL."
      },
      {
        "path": "media/filter.png",
        "caption": "Press FLTR on T2 and change FREQ to filter T1’s routed audio. Add resonance with RESO or shape the filter envelope; these controls process the receiving route.",
        "alt": "Receiving track filter page with FREQ, RESO, TYPE and envelope controls."
      }
    ]
  },
  "digitakt-digipoly": {
    "version": "2.0.1-experimental",
    "screenshots": [
      {
        "path": "media/chooser.png",
        "caption": "Use a build containing Digi Poly and digichain, then load a sample and choose POLY with FUNC + SRC. Confirm with YES; POLY borrows other tracks’ voices to play extra chord notes.",
        "alt": "Digitakt machine chooser with POLY selected."
      },
      {
        "path": "media/settings.png",
        "caption": "Open SETTINGS > POLY and leave enough tracks in its voice pool. LEFT/RIGHT selects a track and YES toggles whether it can lend its voice; extra chord notes are skipped when no voice is available.",
        "alt": "Digitakt Settings with the POLY voice pool and tracks 1 through 8."
      },
      {
        "path": "media/chord.png",
        "caption": "On TRIG, set NOT1 as the root, NOT2 to +4 and NOT3 to +7; leave NOT4 off. Trigger the track to hear a major chord with the selected sample. Turn the extra notes off or select ONESHOT to return to single-note playback.",
        "alt": "POLY TRIG page with root note, three extra-note controls and chord keyboard."
      }
    ]
  },
  "digitakt-digislicer": {
    "version": "2.1.1-experimental",
    "screenshots": [
      {
        "path": "media/chooser.png",
        "caption": "On an audio track, press FUNC + SRC, choose DIGISLICER below SLICE and confirm with YES. Use a drum loop for the first example.",
        "alt": "Digitakt machine chooser with DIGISLICER selected."
      },
      {
        "path": "media/src.png",
        "caption": "Select the loop with SAMP and press SRC again for the slice editor. SLICE selects the played slice and LEN sets how many slices a note spans; custom slices override GRID. This capture is before the loop is assigned.",
        "alt": "DIGISLICER SRC page with TUNE, PLAY, BR, SAMP, SLICE, LEN, GRID and LEV."
      },
      {
        "path": "media/editor.png",
        "caption": "Press YES in the editor, choose CREATE GRID, select 16 with LEFT/RIGHT and confirm with YES; this replaces existing slices. A selects a slice, B moves its start and C fine-tunes it. Close with SRC or NO, wait a second for saving, then use FUNC + TRK to play slices on trig keys.",
        "alt": "DIGISLICER waveform editor with four transients and slice, move, fine and zoom controls."
      }
    ]
  },
  "digitakt-digisophie": {
    "version": "1.1.13-experimental.2",
    "screenshots": [
      {
        "path": "media/chooser.png",
        "caption": "Press FUNC + SRC on an audio track, choose SOPHIE and press YES. It synthesizes its own sound; no sample is needed. Place trigs or use the keyboard to play it.",
        "alt": "Digitakt machine chooser with SOPHIE selected."
      },
      {
        "path": "media/fuse.png",
        "caption": "Use knob B to choose the model, shown here as FUSE, for a bright metallic tone. Start with SWEEP and FOLD at 0; TUNE sets pitch, METAL and COLOR shape the harmonics, and FBK adds oscillator feedback. Raise feedback gradually.",
        "alt": "SOPHIE SRC page with FUSE selected and TUNE, FOLD, SWEEP, METAL, FBK and COLOR."
      },
      {
        "path": "media/amp.png",
        "caption": "Press AMP, set HOLD to NOTE and choose a finite DEC so trig LEN determines when release begins. Play the pattern and shape its envelope here. Press STOP and let the release finish; DEC INF keeps notes from finishing normally.",
        "alt": "Digitakt AMP page with ATK, HOLD, DEC, OVER, DEL, REV, PAN and VOL."
      },
      {
        "path": "media/boom.png",
        "caption": "Turn the model selector to BOOM for a rounded sine body with an FM attack. Compare it with FUSE at the same pitch, then try PIPE or SHARD, or lock MODEL on individual trigs.",
        "alt": "SOPHIE SRC page with BOOM selected.",
        "additional": true
      }
    ]
  },
  "digitakt-digiutils": {
    "version": "1.9.1-experimental",
    "screenshots": [
      {
        "path": "media/waveform.png",
        "caption": "Play a pattern, then hold the three-dots SONG key for about half a second to open the waveform. A short press keeps the normal SONG popup. This silent capture is flat; playing audio gives the trace something to show.",
        "alt": "Digiutils waveform view with a flat trace from silent input."
      },
      {
        "path": "media/spectrum.png",
        "caption": "Press the three-dots key again for the frequency spectrum. Compare it while the same passage plays to see how its frequency balance changes. This capture has silent input, so no meaningful spectrum is shown.",
        "alt": "Digiutils spectrum view with silent input."
      },
      {
        "path": "media/xy.png",
        "caption": "Press the three-dots key again for stereo X-Y, where the two channels form a shape. Silence produces the single point shown here; compare a playing stereo passage. Another three-dots press closes the utility page.",
        "alt": "Digiutils stereo X-Y view with a single point from silent input."
      },
      {
        "path": "media/fullscreen.png",
        "caption": "Press YES to toggle fullscreen and hide the top bar. The underlying track knobs, mutes and transport still work while viewing the signal. Press NO to close the utility and STOP when finished.",
        "alt": "Fullscreen X-Y view with the top bar hidden and a single point at the center."
      }
    ]
  },
  "digitone-digihealth": {
    "version": "1.1.2-experimental",
    "screenshots": [
      {
        "path": "media/settings.png",
        "caption": "Open SETTINGS and tick SYSTEM INFO, then return to a playing pattern. Load and free-RAM pages alternate every two seconds; untick it to restore the normal top bar. This Digitone port has no FAST AUDIO toggle.",
        "alt": "Digitone Settings with SYSTEM INFO enabled."
      },
      {
        "path": "media/memory.png",
        "caption": "Wait for the memory page to read free heap RAM. The picture shows RAM 13.1M; compare the same project when investigating a change. This is a system readout, not an individual module’s memory cost.",
        "alt": "Digitone AMP page with RAM 13.1M in the top bar."
      },
      {
        "path": "media/load.png",
        "caption": "The load page shows CPU and audio-render DSP current and recent peak figures on hardware. DSP covers effects and mixing, not the separate FM voice CPU. Dashes in this emulator capture mean timing is unavailable, rather than zero load.",
        "alt": "Digitone SYN1 page with CPU and DSP load fields showing dashes."
      }
    ]
  },
  "digitone-digitables": {
    "version": "1.3.1-experimental",
    "screenshots": [
      {
        "path": "media/tbl.png",
        "caption": "Press AMP until its third page, or hold a track key for half a second and choose TABLES in the Mod Menu. Select a table with TBL and set SPD for its step rate, then hold the track key to open its editor. TBL OFF restores ordinary pitch playback.",
        "alt": "Digitone AMP third page with TBL and SPD controls."
      },
      {
        "path": "media/editor-step.png",
        "caption": "Use trig keys or LEFT/RIGHT to choose a step and A or UP/DOWN for its semitone offset. Try offsets 0, +4 and +7, length 3 with C and loop point 1 with D; NO returns to TBL, where a held note plays the sequence. This picture shows table 1, length 4 and step 1 at +04.",
        "alt": "Table 01 editor with length 04, loop 01 and step 01 NOTE +04."
      }
    ]
  },
}

export function moduleMediaGuide<T extends Media>(id: string, version: string, media: readonly T[]): { primary: T[]; additional: T[] } {
  const guide = MODULE_MEDIA_GUIDES[id]
  if (!guide || guide.version !== version) return { primary: [...media], additional: [] }

  const primary: T[] = [], additional: T[] = []
  const remaining = new Map(media.map(item => [item.path, item]))
  for (const screenshot of guide.screenshots) {
    const item = remaining.get(screenshot.path)
    if (!item) continue
    const described = { ...item, caption: screenshot.caption, alt: screenshot.alt }
    const target = screenshot.additional ? additional : primary
    target.push(described)
    remaining.delete(screenshot.path)
  }
  // New images and audio remain visible even before a walkthrough is authored.
  primary.push(...remaining.values())
  return { primary, additional }
}
