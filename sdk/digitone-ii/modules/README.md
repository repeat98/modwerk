# Digitone II modules

Each folder here is a library module for Digitone II OS 1.12 on Modwerk's Digitone II base (core 1.1). The first is [Voice Spread](voice-spread/): its two value rows in SETTINGS > PERSONALIZE set the pattern for module settings, and it acts on the voices through the base's `ev_frame_params`, which on the Digitone II hands over the 16 voices, not the tracks. Downloads stay off until the owner turns them on.

Create one with `npm run module:new -- my-mod --machine digitone-ii --author your-github-login`; see [the Digitone II goal](../../machines/digitone-ii/GOAL.md) and [base](../../machines/digitone-ii/elekloader/README.md).
