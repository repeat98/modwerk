# Octatrack release observations, 22 November 2026

## The UI stopped during playback on base 0.7.13

A tester’s instrument logged a stopped UI tick during playback on released base 0.7.13. The incident and its installed set both belong to the same boot. Six modules were installed, including Tape Echo and E-Verb. The CPU meter read about 78%. The audio frame interrupt continued long enough to record the freeze. At the next start the instrument reported all six modules restored.

An earlier boot on 0.7.12 had the same symptom with only Tape Echo and E-Verb installed. These records give the set and transport state. Identifying the cause needs the action and the point where the UI stopped making progress. The overlap in installed modules alone cannot identify either one as responsible.

## A short removal set also failed during USB staging

A tester using Opera on Windows saw an unconfirmed USB staging transfer on both 0.7.12 and 0.7.13. On 0.7.13 the offer contained just two removal headers. All three failed attempts had one more primed USB receive than completed receives and recorded zero bus resets. This extends the [staging observations](2026-11-20-usb-staging-diagnostics.md) to a transfer small enough to fit in one chunk. The released diagnostics do not identify which command failed.

Other attempts with the same removals reached trial, disconnected during the USB Audio configuration change, and returned to the previous active identity. Removing MIDI Scenes alone was then kept. An observation that distinguishes the two failures is whether the unit had already published the trial when it disconnected. The former needs the upload command and remaining receive length. The latter needs the outcome of claiming the returning interface and matching the open trial.

## Reading an older crash record

A tester uploaded a retained crash record from an older base. The program counter was outside SDRAM. The crash handler copies instruction bytes only when the program counter is in SDRAM, so the two byte arrays could contain zeros or values from an earlier exception. The pull summary now explains when those bytes are unavailable and keeps the exception count, vector and program counter. The record alone cannot date the exception.
