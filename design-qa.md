# Module working feedback — design QA

Final result: **passed** (2026-10-08).

The user selected the third compact feedback layout after reviewing it on the full local Modwerk page, then requested yellow issue reporting. The configuration action remains primary; Following becomes a small control because downloads already follow updates. A single feedback block groups the invitation, working count and both reporting actions. The existing waveform, gauges, sidebar, tabs and creator support remain in their actual page context.

Visual reference: the third feedback-invitation mock (`exec-b6194b3e-635d-4cb4-ba81-bf0243b786dc.png`) and its selected local page implementation. `artifacts/module-feedback/feedback-card-comparison.png` places the source and final FM Synth details together, normalizing both to the actual 538px details-pane width. The native app typography/density, shorter Following label and existing creator cup are retained. Yellow issue colors are the requested refinement. Fixture discussion counts differ from the mock; they are not layout findings.

The five fidelity surfaces were checked:

- **Typography:** existing system font and title scale; 15px invitation, 12px supporting copy and count, and 13px reporting labels. Long labels wrap on small phones without clipping.
- **Spacing:** 16px feedback padding, prompt/count on the left and stacked actions on the right. At widths up to 820px the prompt and count precede paired actions. The full site shell and responsive gauges stay in place.
- **Colors:** neutral gray plus/button before saving; green check and “Reported working” only after success. Report an issue uses the existing open-issue colors (`#393222`, `#71603b`, `#efd17c`). Configuration retains the existing lavender style.
- **Assets:** actual module artwork, gauges and project icons are reused. No replacement artwork or approximate branding was introduced.
- **Copy:** “Tried it on your instrument?” and “Let others know how it went.” invite both outcomes. The count remains distinct members across versions. Automatic download follows are described to assistive technology without another large action or paragraph.

Responsive browser checks passed at 320, 375, 768 and the normal 1389px viewport: no document overflow, overlapping feedback actions or clipped labels. Reporting controls are at least 44 CSS pixels high; the 320px success state wraps to 52px. The early option preview’s margin/width overlap was corrected before the final implementation. The mobile Following alignment was corrected and checked again.

Interaction evidence: one Works press saves immediately and updates the local fixture count from 2 to 3; a green confirmation appears with a status announcement. A failed save produces an inline alert and permits retry. The yellow issue action opens the existing report form and focuses Title. These checks use a local fixture and create no production hardware claims. The earlier database/build-context coverage remains unchanged.

Evidence is saved in `artifacts/module-feedback/feedback-card-desktop.png`, `feedback-card-mobile.png`, `feedback-card-confirmed-mobile.png`, `feedback-card-error.png` and the comparison image. Required full app checks passed: 191 test files, 1,286 tests, lint, type checks, catalogue/licence checks and production build. No firmware source changed, so a native build was unnecessary.

The reporting consistency follow-up also checks the real module card, download follow-up, return reminder, delayed check-in and the Octatrack/Digi forms together at `?preview=reporting`. The preview uses the actual components with local submissions, and `?preview=reporting-module#module/fm-synth` exposes the real page shell. Reporting entry points in issue lists, discussions and the forum share the same amber action.

The inline module-page regression was reproduced and fixed: the general form label rule had stacked the release-follow checkbox. Its computed direction is now `row`; the bounded form stays inside the scrolling workspace and the Post report button is visible above the footer. Browser checks at 320, 375, 768 and 1280 CSS pixels found no document overflow. A per-module confirmation changes only that module to Reported working. Both the Octatrack dialog and the short Digi form reach their local success state; the latter submits with its already attached device and OS fields still collapsed. The flashing guide explains the card root with a file tree and links the official Elektron manuals. The approved modal now runs after five minutes in the real download flow; the eight-second development simulation exercises the same scheduler and dialog with a disposable local fixture.

Implementation validation passed catalogue/licence/SDK checks, lint, types and production build. The required parallel check passed 191 test files / 1,292 tests; one existing module-doctor test exceeded its five-second timeout. An isolated retry passed both tests in that remaining file, covering all 192 files / 1,293 tests without weakening assertions or timeouts. Seven new scheduler tests cover timing, visibility/dialog guards, duplicate tabs, changed builds, completion/dismiss/snooze, legacy reminders, cancellation and unavailable storage. Production assets omit the development previews and retain the real check-in.

The browser simulation now runs the production scheduler and check-in controller. It opened automatically after its eight-second fixture deadline without navigation. A one-click working confirmation and a successful local issue report stayed visible together; only their respective modules were completed. The 375px dialog had no horizontal overflow. Preview reports remained local. The real controller uses the existing working-report and issue endpoints with the full downloaded build context.

No unresolved visual or interaction defects remain in the checked reporting surfaces.
