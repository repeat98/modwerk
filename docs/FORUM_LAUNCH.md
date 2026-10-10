# Forum launch evidence — 3 October 2026

The forum draft from PR #64 is included in the consolidated Modwerk release PR. This record distinguishes implemented safeguards from external checks still required; it is not a public-launch approval.

## Completed locally

- Verified-account ownership and independent administrator authorization; private reports/logs never enter public queries or automatic GitHub issue publication.
- Private reversible removal-request queue with password confirmation, throttling, owner-only withdrawal and administrator-only review. No automatic account/data deletion. Completion is blocked while credentials or private data remain.
- Server-side registration switch defaulting closed, with existing-account login/recovery remaining available.
- Private aggregate account-mail counters; generic delivery-failure responses avoid membership disclosure. No recipient/token/provider payload is stored in counters.
- Encrypted D1 export and isolated local recovery, archive authentication, no-overwrite guard and local-only restore guard. Fictional preview restored with all 37 tables and row-value digests matching, integrity `ok` and no foreign-key violations; no production database was restored.
- Full production and development dependency audit: zero reported vulnerabilities at the time of the check. This is a package advisory check, not an independent security audit.
- Local Node 24 Better Auth password benchmark: approximately 43 ms hashing / 39 ms verification, about 93 MiB peak process memory in that run. Node process memory and wall time do not prove Worker isolate CPU/memory usage or concurrency capacity.

Authentication regression tests cover email verification, recovery, expiry/replay, unique resends, forged/unsigned sessions, device revocation, origin checks, ownership, moderation and suspension. Additional tests exercise provider/network failure, global mail quotas, closed registration and private operator counters. Tests intercept mail in memory and contain no firmware or real inbox data.

Final application validation: `npm run check` passed 368 application tests, 31 synthetic SDK/source checks, licence checks, lint, TypeScript and a production build. The final Worker dry-run bundle passed (396.73 KiB gzip). The local Account page was used to submit and withdraw a fictional request; the member stayed signed in and its private report remained accessible. The previous forum visual checks covered 375/768/1280-pixel layouts, posting, reply formatting and keyboard navigation. Automated tests intercept mail and never send real messages.

Controlled real-mail checks used the owner-supplied recipient, a separate local Worker/database and a temporary sending-only key restricted to `octamod.app`. Resend recorded delivery of one verification and two recovery messages. From was `Octamod <accounts@octamod.app>` and Reply-To was the owner-approved support contact. Verification and recovery rejected replay; verified login worked, recovery revoked prior sessions, the old password was rejected and the new password accepted. A verified-account resend returned generic acceptance without another message. Pending-account resend/expiry and quota boundaries remain covered by synthetic regression tests. On 3 October, the owner confirmed that both verification and recovery messages reached the inbox. Recipient-side SPF/DKIM/DMARC results remain unconfirmed.

The real journey exposed two frontend issues, both fixed: signed-in members can now open verification/recovery forms, and stripping a consumed token no longer removes the success confirmation. The signed-in recovery form, confirmation and fresh-link behavior were checked in the local browser. During provider navigation one local test verification link appeared in tool output; it was consumed and replay rejection verified. No password or API-key value was printed. The temporary sending key was revoked and its private local database/credentials/action-token files removed. Production was not migrated, deployed or opened for registration.

## External checks and owner decisions still required

| Gate | Status / required evidence |
| --- | --- |
| Resend domain and sender setup | Launch domain is `modwerk.app`: add it in Resend, add its records at Hetzner, stage the new key and sender, then check recipient-side SPF/DKIM/DMARC; see [DOMAIN_AND_MAIL.md](DOMAIN_AND_MAIL.md). Root `octamod.app` was verified in Ireland earlier and delivered the real-mail checks above. Enforced TLS approved. This does not prove inbox delivery. |
| Actual Cloudflare crypto capacity | A small access-key-protected, database-free/mail-free temporary benchmark Worker is prepared and dry-run bundled. Deployment is awaiting specific approval after automatic approval review rejected external resource creation. Test the actual plan; [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) document 10 ms CPU per request on Free and 128 MiB per isolate. Do not weaken scrypt to fit a quota. |
| Real mail and account journey | Verification/recovery provider delivery, owner-confirmed inbox placement and local account/revocation journey passed; temporary key and private test data removed. Recipient-side SPF/DKIM/DMARC results remain unconfirmed. Keep the test recipient and credentials out of source/screenshots. |
| Support / privacy / retention | The public receiving support contact is `support@modwerk.app`; UI links and email Reply-To use it. Its inbound mail is received by Resend; a test message must arrive there before release ([DOMAIN_AND_MAIL.md](DOMAIN_AND_MAIL.md#3-mail-where-support-mail-arrives)). Earlier test messages were delivered to the owner's own inbox, the contact before 10 October 2026, with the correct Reply-To. Support response procedure, operator ownership and archive/provider retention remain to confirm. The current privacy copy states actual retention and request-based removal. See [COMMUNITY_OPERATIONS.md](COMMUNITY_OPERATIONS.md). |
| Production recovery point | Record a Time Travel bookmark and verify an encrypted production export with a restricted local recovery before migrations. No production export or restore was performed for the local evidence above. |
| Production schema/backend | Main's 0010 issue-report schema is already present. Draft migrations 0011–0020 are not applied remotely; production Worker still serves the earlier release. Apply only when explicitly authorized. |
| Frontend release | Owner approval to merge is still needed. Merging `main` triggers the existing GitHub Pages workflow; deploy/check the API first with registration closed, then publish the reviewed frontend and open registration after the gates pass. |
| Developer GitHub sign-in | Backend OAuth app credentials and its exact callback must be configured and the actual provider flow checked before enabling live developer login. Local verification uses a simulated provider; see [DEVELOPER_WORKSPACE.md](DEVELOPER_WORKSPACE.md). |

## Machine community and developer additions — 4 October 2026

Digitakt/Digitone module filters, immutable machine configuration snapshots and structured private reports now join the Octatrack flow. GitHub-only developers can claim reviewed maintainer declarations, read explicitly shared reports, reply and resolve/reopen them. Sharing defaults off for new and historical reports. Withdrawal, per-module administrator revocation, suspension, logout and client-secret rotation enforce the server-side access boundary. Module updates still require owner-reviewed PRs.

Node 24 `npm run check` passed 473 application tests, 31 synthetic SDK checks, licence/schema checks, lint, TypeScript and a production build. Worker dry-run bundling passed (410.97 KiB gzip); no Worker or database was deployed. Regression tests cover OAuth state/cookie/PKCE/browser proof, expiry/replay/provider failure, stable GitHub identity, wrong module/identity, opt-in report access, replies/resolution, consent withdrawal, validated Octatrack log access and admin revocation/suspension. All identities, reports and provider credentials were synthetic. No firmware/DSP/hardware tests ran.

Local browser checks used separate frontend/API ports, completed simulated GitHub login and claiming, submitted a shared Digitakt report, answered/resolved it from a developer-only session, and shared/copied a Digitakt snapshot into the correct local machine configuration. The Digitone form showed its own models, OS releases, version and isolated configuration. Developer/private-report layouts were checked at the default desktop viewport and 375 pixels with no horizontal content overflow. This evidence does not validate a real GitHub OAuth app or authorize launch.

The German/English notices, operator disclosure, optional-count consent, account export, rules agreement and initial rights deadlines are implemented by the compliance change. [LEGAL_COMPLIANCE.md](LEGAL_COMPLIANCE.md) records the actual provider/transfer/retention evidence still required. Registration needs both server flags; neither should be opened until those gates are resolved. No provider agreement or production change was performed by that work.

## Controlled release procedure

1. Resolve the performance and real-mail checks, choose support/operating details, and review security/privacy boundaries and this evidence.
2. Obtain explicit approval for the production rollout. Record Worker version, database bookmark and verified encrypted recovery point; preserve existing secrets.
3. Apply migrations 0011–0020 after 0010 and deploy the reviewed API with `REGISTRATION_OPEN=false` and `PRIVACY_READY=false`. Verify existing content and independent admin access, private endpoints, trusted origin, migrations and failure behavior.
4. Merge the reviewed PR only when authorized; GitHub Pages builds/publishes the frontend. Check mobile/keyboard navigation and the exact deployed API boundary.
5. Open registration through the reviewed production configuration only after approval and the controlled journey passes. Review operator counters/provider metrics and the moderation queue during the initial launch period.

Do not restore the database merely to roll back frontend/Worker code. Schema additions preserve earlier data and remain while a reviewed compatible Worker/frontend is selected. Any destructive Time Travel restore or private-data removal needs its own exact scope and authorization. Never copy fictional preview data or firmware into production.


## Release preparation follow-up — 4 October 2026

The new Modwerk sender delivered one branded verification and one recovery email to the approved inbox, with owner-confirmed SPF/DKIM/DMARC PASS and a complete isolated verification/login/reset/replay/revocation journey. The temporary sending key was revoked. An explicitly approved temporary Cloudflare Worker completed two synthetic password hash/verify checks, recording 164/241 ms CPU. The owner purchased Workers Paid and its current-plan status was verified; the temporary Worker was deleted. An encrypted production backup restored locally with all 23 tables and row values matching, integrity `ok` and no foreign-key violations. These checks supersede the earlier mail/capacity/backup setup blockers in the historical table; production migration and frontend/API/domain cutover still require their actual rollout checks.
