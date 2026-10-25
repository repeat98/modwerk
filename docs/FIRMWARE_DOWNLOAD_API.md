# Local firmware download API

Release verification can build and save firmware without opening a browser.
Use Node 24, `npm ci`, and a checkout of the revision deployed on Modwerk.
This is GPL developer tooling running on your computer. Stock firmware and all
built images stay local; network requests fetch public metadata and stock-free
packages only. The community Worker never receives firmware.

The site emits `firmware-builder.json`, a fingerprint of the engine, catalogue,
build policies and dependency lock. The tool rejects a different local builder,
unpublished/paused/beta modules, incompatible selections, a stock OS mismatch,
changed live inputs during a build, and unexpected release or image hashes.
Digitakt II downloads remain disabled. Octatrack, Digitakt mk1 and Digitone
mk1/Keys use their existing builders and stock verification.

This verifies a **saved local build from published inputs**. It does not test
browser controls, account/download tracking, physical flashing or hardware
behavior, and grants no release/closure authority or qualification waiver.
Local developer downloads do not add account subscriptions or send updates.
Use the existing release fanout and report-resolution flow separately.

## One command

Save this request outside the repository, for example `/tmp/digi-download.json`:

```json
{
  "machine": "digitakt",
  "os": "1.54",
  "moduleIds": ["digimono", "digieq"],
  "version": "D180",
  "expectedVersions": {"digimono": "0.13.2-experimental"},
  "expectedSha256": "b90e05a46af97b7179e7a17123b9335bcec90db4cec20996575d036a25249130",
  "riskAccepted": true
}
```

Review the selected modules' experimental limitations and the instrument's
recovery instructions before accepting the risk. `expectedSha256` is optional
for a first build; include it when comparing against a tested private image.
`expectedVersions` uses Modwerk release versions, while receipt package pins
also retain the native Elekloader versions and source identities. Required
dependencies, such as DIGICHAIN, are included and checked automatically.

```sh
npm run firmware:download -- \
  --stock /path/to/Digitakt_OS1.54.syx \
  --output /path/to/private-downloads \
  --request /tmp/digi-download.json
```

For Octatrack, set `machine` to `octatrack`, `os` to `1.40C`, choose native
module IDs, and omit `version` (the published display version is ELEKLOADER).
Optional `keepStockFx2` and `usbAudio` settings use the browser engine's existing
validation. For Digitone, use `digitone`, its supported stock OS, native module
IDs and a four-character ASCII display version.

Every success creates a fresh private output folder, saves the firmware and
builder sidecars, reads them back and hashes their actual bytes. Existing files
are never overwritten. JSON output and `download-receipt.json` identify the
stock hash, deployed builder fingerprint, inventory hash, exact module
versions, source pins, saved paths and SHA-256. A failed save removes its
incomplete output folder. Keep these stock-derived sidecars private too.

## After a release that rebuilt modules

When a merge changes module source, the release compiles the packages again
and imports them with its approval record, so a plain checkout of the merge
commit reports "Local builder differs from the deployed builder". Reproduce
that import in a scratch worktree at the merge commit, then build:

```sh
gh run download <release run id> -n octamod-source-<merge sha> -D <dir>
GITHUB_REPOSITORY=repeat98/modwerk GITHUB_TOKEN=$(gh auth token) \
  OCTAMOD_APPROVER_ID=$(gh api users/repeat98 -q .id) \
  node scripts/import-module-build.mjs <dir>
npm run prepare
```

The local fingerprint then equals the deployed `firmware-builder.json`.

## HTTP API

```sh
npm run firmware:api -- \
  --stock /path/to/Digitakt_OS1.54.syx \
  --output /path/to/private-downloads \
  --port 8789
```

Startup prints the loopback URL and a credentials-file path. That temporary
file has mode 0600 and contains the random bearer token; the token is never
printed or committed. The listener binds only `127.0.0.1`. It rejects website
Origins, unexpected Host headers and missing tokens, with no CORS permission.
Only server startup chooses the stock/output paths and site URL. Request
bodies cannot change them. Stop the process to remove its credentials file.

Read the credentials privately in your API client, then send:

```http
POST /build-download
Authorization: Bearer <local token>
Content-Type: application/json

<the JSON request above>
```

HTTP 201 returns the saved receipt and authenticated download URLs. `GET` each
returned URL with the same bearer token to transfer its bytes; the response
includes `X-Firmware-SHA256`. The server checks the saved file again before
serving it. `GET /health` also requires the token. Concurrent builds receive
409. Bodies are limited to 16 KiB. Restarting the server expires its download
URLs; the saved local files remain. The most recent 100 builds retain URLs.

Both commands default to `https://modwerk.app/`. `--site` can select another
HTTPS deployment or a localhost HTTP server serving a production build for
development. Redirects are refused and every package is hash checked.
There is no fallback to stale local packages when a deployed asset is missing
or a fingerprint differs. Deploy this feature before its first live-site run.

## Validation of this implementation

The full repository checks pass, including API authorization, input limits,
concurrent-build refusal, stale-release/package rejection, fresh private saves
and changed-download rejection. Private stock was used outside Git and CI for
two additional checks against a local production deployment of this feature:

- The Digitakt HTTP build, authenticated download URL and saved SYX were byte
  identical to the approved D180 image: 1,599,008 bytes, SHA-256
  `b90e05a46af97b7179e7a17123b9335bcec90db4cec20996575d036a25249130`.
- Octatrack Quantizer 0.1.3-experimental produced the same previously saved
  live-browser image: 453,136 bytes, SHA-256
  `88a84f760775ac7cccf4514ab70d89b88c2b38d1ea2516e7b7ab3d34c94d890c`.

Digitone uses the existing kit and its checks; this change has no new private
Digitone full-image comparison or physical hardware result. None of these
download checks establishes flashing, audio, timing or persistence behavior.
