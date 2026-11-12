# Exact Mini Verb 0.2.1 owner release decision

On 11 October 2026, owner repeat98 answered the release question in the
issue-fix session:

> Approve this exact experimental release with limits disclosed; keep #428 open until the reporter confirms (Recommended)

The question named native source SHA-256
`c68e43ca208d50214273845bb0a980a44d715a9f5e5a4c0e537fedabf444723d`
and the two exact I428 updates recorded in TESTING.md:

- Mini Verb only: update SHA-256 `f0c5f31449f5b6c16d1a88e6c52f3687f4c8d11b4e4335fac2b365632fa516dc`, MAIN `2a517bc54a92fbf811a3f7366ce27713fdcbdb1aeb2ebbd9bd9c2368ba317cfa`.
- Saved six-module selection: update SHA-256 `72dab691058497b1ac2e429aa6e639d2b2887e6ddb57abbe2de539df43467f49`, MAIN `af3dddc8263846bcd63e6487e753730d77b1c1c372b893bab143c252c4b0f3b8`.

The owner was explicitly told that publishing requires an exception for
current-build hardware, chip timing and complete runtime memory bounds, that
played automation, Part/project persistence, physical reboot and maximum load
remain unverified, and that the original THRU noise is unconfirmed. They chose
publication with these limits and **keeping #428 open**, rather than the
separately offered release-and-closure option. This is authorization, not a
hardware test result. No device/audio/reboot pass is supplied or inferred.

The exception applies only to this version/source and these images. The older
0.2.0 hardware-only exception and measurements remain historical. Ordinary
owner-reviewed publication, required checks, actual UI, stock isolation,
native/browser parity and source-only package reproduction still apply.

After deployment and saved live-download verification, post the candidate
version, confirmed mixer regression and unconfirmed symptom on #428 without
resolving it. Its shared Modwerk report must also remain open. Use the existing
per-version follower notifications; do not send a separate blast.
