# Screen Off

Version `0.1.0-experimental`. Hold UP and tap NO. The screen goes black until you do it again. The pattern, the sound and the trig lamps keep going.

The MKII already dims the OLED after five minutes without a key or a knob, and turns it off after an hour, and only while the sequencer is stopped. This is the blank you can ask for now, including while a pattern plays.

## Overview

Screen Off is a front-panel shortcut. It has no page and no knob. Installing it changes nothing until you use the chord.

While the screen is black, every other key and every knob still does its usual job. You just cannot see the page. Hold UP and tap NO again and the page you were on comes back.

UP on its own still moves through a list. NO on its own still disarms, or steps back. The chord is NO pressed while UP is already held.

## Controls

There is no control to turn. The blank is either on or off, and off is where it starts.

| Chord | What happens |
|---|---|
| Hold UP, tap NO | The screen goes black, or comes back if it was already black. |
| UP alone | Unchanged. In a list, the highlight still moves. |
| NO alone | Unchanged. It still disarms, or steps back. |
| Any other key or knob, while the screen is black | Does its usual job. The screen stays black. |

## Usage

Use it when the Octatrack is on and you are not looking at the page: a long loop, or stepping away without waiting for the stock saver. The stock saver still runs when this blank is off.

### Quick tutorial

1. Hold UP and tap NO. The screen goes black. Let go of both keys.
2. Press PLAY, or turn a knob. The Octatrack does it, and the screen stays black. The trig lamps still show the pattern.
3. Hold UP and tap NO again. The screen returns to the page you left.

## Change to a stock flow

- **What changes, and for whom.** While Screen Off is installed, NO pressed with UP already held blanks the screen or brings it back. That NO does not also disarm, and it does not answer a question on screen.
- **Why.** FUNC + NO is already Temp Save, including a second press. UP + NO is free, and it is one press rather than a timed double tap. The screen has to be able to go black while a pattern plays, which is when the stock saver stays lit.
- **What you do differently.** Hold UP, then tap NO. In a list, the UP press can move the highlight by one step before the screen goes black.
- **Only while the module is installed.** Remove it and UP + NO is stock again: NO does whatever NO does with UP held, which on the pattern screen is just NO.
- **Neighbouring flows.** UP alone, NO alone, FUNC + NO and FUNC + YES are left alone. Not yet compared on a unit.

## Compatibility and limitations

OS 1.40C. It needs the Modwerk base, installed over USB. The base is what hands the module each key and each composed frame. A card build that never calls those hooks will not blank the screen.

The blank clears the pixels of the composed frame. On a MKII that leaves the OLED dark, which is the wear that matters. It is not yet known whether the panel can also be powered down the way the stock hour-long saver does. On an MKI the backlight may stay on behind a blank glass.

The blank is forgotten when you power off. It is not part of the Part or the project. The stock saver still dims and switches off on its own schedule when this blank is off.

The author reports that on a MKII the chord blanks the screen and brings it back. An MKI, the stock saver and a power cycle are not tried.

## Tests and measurements

The host gate is [TESTING.md](TESTING.md). It drives the chord, the keys that must still pass, and the frame clear. Cycle counts are not done. The MKII chord is the author's report.

## Authorship and licences

jonathanwardle1992-beep. MIT, in [LICENSE](LICENSE). No Elektron firmware or extracted code is included.

## Screens and audio

Screen Off draws no page of its own. There is no screenshot and no audio preview. The stock page goes black, and comes back as it was.
