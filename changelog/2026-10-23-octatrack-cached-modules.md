Octatrack base (beta): installed modules run from the ColdFire's cache again. The 20 October base (`b5fae2ae`) shipped with cached module code, but a regeneration that night listed the base's build flags by hand and left `--cached-modules` out, so every base since has run module code uncached, with each instruction and load going to SDRAM. That costs every module CPU time, and POLY8 most, because it renders its voices in the audio interrupt: about three voices on the uncached base, seven to eight cached. `npm run octatrack:base -- --beta` now names every flag of the beta base, and `--write` takes no other, so the committed base can't lose one again.

Sync to Octatrack (beta): Analog BD 0.1.5 can be synced. On a base with module sets every sync goes as one set, and the site refused any package newer than ABI 9 before sending it ("Something went wrong talking to the Octatrack"); Analog BD 0.1.5 is ABI 10, which the base takes.

Owner-approved beta release exception (23 October 2026): exact base `0c5934e1` may ship with bound Keep/Undo, all-module churn and flashed power-on restore still unverified; finding 64 remains open. See the beta test plan.

Deployment documentation now distinguishes a published frontend from a failed notification-sync step and requires separate inventory and notification verification.

Fixed release notification synchronization for machine module links such as Analog Rytm MKII: the inventory parser now accepts the shared machine route shape instead of a Digitakt/Digitone allowlist. Regression coverage checks every catalogue link and rejects malformed/external routes. Related to #832.
