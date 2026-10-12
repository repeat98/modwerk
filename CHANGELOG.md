# Application changelog

## 12 October 2026

- Removed the beta Octatrack boot shockwave's solid outline and dotted echo, retaining its screen distortion, text reveal and panel-lamp sweep.
- Made hardware feedback reminders and download follow-ups more compact, with module thumbnails, divided rows and side-by-side actions. Narrow panels keep full-sized touch controls, and reports retain the exact downloaded versions.
- Removed the New badges from Forum and Other projects in the sidebar and mobile menu.
- Made module-release announcements opt-in for each version. Deployments and media edits record release history quietly unless that version's authored notes explicitly set `announce: true`; existing subscriptions and delivery preferences remain intact.
- Limited FM Synth's Node and Python screenshot regressions to instrument captures so bundled audio previews are not decoded as PNGs or counted as screenshots; capture hashes and version/source checks remain required.
- Required the shared signal-art style for module thumbnails, documented the grid, palette and typography, and explained how to replace artwork whose original asset is bound by older release evidence.
- Documented explicit per-version announcement consent across the agent, module-author, publication and notification guides; publishing or editing media leaves announcements off by default.
- Documented focused comparisons and musical phrases without quiet padding, full Euclid clock/envelope capture, FM + Mini Verb capture through Octemu with offline VECTOR note generation, reliable parameter-lock editing, decoded MP3 checks and the retained-evidence editorial media path.

- Allow editorial documentation to be appended to a retained module's README when it also holds historical resource measurements. The entire approved record, other reports and runtime inputs remain immutable.
- Retained evidence compares exact approved infrastructure before consulting a historical builder-extension exception, so an obsolete exception cannot block an unchanged runtime.
- Documented how an authenticated Cloudflare operator can publish and verify an owner-approved site announcement when the admin UI is unavailable.
- Added slim waveform overlays for modules with audio previews: thumbnail-only hover and keyboard focus, click-to-seek playback, persistent controls while playing, and tap-to-play on mobile module pages. Existing card and thumbnail sizes are preserved.
- Verified members can upload public audio previews with credits and optional captions. The renamed Previews tab lists submitted recordings with usernames and captions; contributors and administrators can remove them. Uploads use the existing media bucket with file/request limits, retry protection and account-deletion cleanup. Synthetic recordings remain development-only.

- Prepared a fresh Discord invitation round with the existing announcement wording and link. Previous account and browser invitations no longer block this resend; each account or visitor browser receives the new round once. New signups still receive Discord inline in their welcome. Publication follows deployment through the admin announcement form.
- Bundled followed module releases into a daily digest, showing only the latest pending version and its changelog for each module. Replies and messages keep their chosen activity interval; existing follows, opt-outs and bell history are retained.

- Allowed up to 30 seconds for deployment release synchronization so a successful inventory fanout is not mistaken for a ten-second timeout. Existing idempotent retries, recipient preferences and digest processing remain in place.
- Fixed imported README provenance after adding audio previews, and limited E-Verb's monochrome capture checks to instrument screenshots.
- Documented imported-module media provenance updates and screenshot selection for mixed audio/image media.
- Local module README, TESTING and CPU guides can be edited without updating import checksums. Imported code, licences, archived snapshots and preserved upstream documentation retain exact integrity checks.
- Documentation PRs run a small Node-only import check so publication uses the same policy without requiring firmware builds or the full app suite. TapeHead's app checks share that policy.
- Added report triage: awaiting review, waiting for the reporter, investigating, confirmed bug and fix awaiting verification. Questions and suggestions are classified separately.
- Module warnings and quiet periods use confirmed bugs applicable to the current version or with unknown applicability. Unconfirmed reports remain visible; configuration reports do not blame individual modules.
- Maintainers can request information, classify, confirm, close and reopen reports through GitHub comments or consent-controlled report forms. Verified claimed maintainers can triage without release-author privileges. Existing author updates retain automatic CI-gated merge and publication.
- Added an insufficient-information closure outcome, retained closure explanations and kept older closed history without inferred outcomes. Retries and verified command acknowledgements avoid duplicate reporter notifications.
- Updated contributor prompts, GitHub report instructions and developer context. Firmware qualification, publication and verified-download resolution gates remain in force.
- Reworked module-card footers into one line: shorter testing grades, compact report counts with explanations and the Compare control.
