# Domain and mail: modwerk.app

How the Modwerk domain, hosting and account mail are set up, in the order they must be done. Nothing here changes what visitors of octamod.app see until [launch day](#launch-day). Everything in [Before launch](#before-launch) can be done at any time and is safe to do now.

Check progress at any point with `npm run domain:check -- <stage>` (stages `mail`, `pages`, `worker`, `redirect`, or `all`). It reads public DNS and public pages only, needs no credentials, and prints what is still missing. It is not part of `npm run check`.

## State on 4 October 2026

Read from public DNS, GitHub and the deployed Worker; nothing was changed.

| Part | State |
| --- | --- |
| Registrar and DNS | Hetzner, for both domains. modwerk.app has Hetzner's default zone: parking A/AAAA records, a default MX and root SPF `v=spf1 +a +mx ?all`. No site, no HTTPS. |
| octamod.app | Live. GitHub Pages custom domain of this repository (verified, HTTPS enforced, certificate to 30 December 2026). |
| Community API | Cloudflare Worker `octamod-community`, reached at `https://octamod-community.octamod.workers.dev/api` (repository variable `COMMUNITY_API_URL`). It trusts **one** origin, taken from `APP_URL`; a preflight from `https://modwerk.app` is answered 403 today. |
| Worker secrets | `ADMIN_KEY_SHA256`, `AUTH_SECRET`, `EMAIL_FROM`, `RESEND_API_KEY` are set. The last two are for octamod.app. |
| Account mail | Resend, root domain, Ireland, for octamod.app. Its records are the reference for what modwerk.app needs. |

### Verified setup follow-up

On 4 October, Resend showed `modwerk.app` verified in Ireland with enforced TLS and tracking disabled. Its domain-restricted sending key and `Modwerk <accounts@modwerk.app>` sender are staged, followed by the six community SSO credentials; none of those staging versions is the release deployment. A temporary key sent one branded verification and one recovery email from an isolated local Worker. Both were delivered, their account links completed the local verification/recovery journey, and the owner confirmed inbox arrival and SPF/DKIM/DMARC PASS. The temporary key was revoked. GitHub's ownership TXT is present. The public site still uses the parking addresses until the approved cutover; the historical table above describes the earlier baseline.

## What changes with the domain

One value, `APP_URL`, decides all of this: the origin the API trusts (CORS and the origin check on every write), the base URL of the account service, and the origin in verification and recovery links. It is `https://modwerk.app/` in `wrangler.worker.jsonc` on this branch. `AUTH_BASE_URL` separately pins the community OAuth backend to `https://octamod-community.octamod.workers.dev/api/auth`; provider callbacks use that backend, while account verification/recovery links use `APP_URL`. Only the sender and the Resend key are separate secrets. `index.html` carries the origin for link previews, and every module page derives its canonical URL and preview image from it.

The frontend needs no change: assets are relative, the Content-Security-Policy is derived from the API URL, and the API URL stays the workers.dev address.

## Before launch

### 1. Mail: Resend for modwerk.app

Do this in the Resend dashboard, signed in as the account owner.

1. Add the domain `modwerk.app` as a root domain in the **Ireland** region, like octamod.app.
2. Turn **open tracking and click tracking off** for the domain, so verification and recovery links are not rewritten. Set TLS to **enforced** (approved on 3 October: delivery fails rather than falling back to an unencrypted connection).
3. Copy the records Resend shows for this domain into Hetzner's DNS console. Use the host names relative to the zone. Do not invent or reuse values: the DKIM key and the targets are specific to the domain.

| Type | Host | Value |
| --- | --- | --- |
| TXT | `resend._domainkey` | the DKIM value shown by Resend |
| CNAME | `send` | the value shown by Resend |
| CNAME | `rsend` | the value shown by Resend |
| TXT | `_dmarc` | `v=DMARC1; p=none;` |

   `p=none` asks receivers to report, not to reject. Tighten it only after delivery is proven (see [After launch](#after-launch)). Leave the registrar's MX and root records alone for now.
4. Press **Verify DNS Records** in Resend, then run `npm run domain:check -- mail`. The three required lines (DKIM, send, DMARC) must be green. The two advice lines are covered below.
5. Create a **sending-only** API key restricted to `modwerk.app`. Keep it in a password manager, never in the repository, the frontend variables, screenshots or a pull request.

### 2. Mail: stage the sender and key on the Worker

The secrets are replaced together with the code at launch, so production keeps sending as octamod.app until then. Stage them in a version that is not deployed:

```sh
npx wrangler versions secret put RESEND_API_KEY --config wrangler.worker.jsonc   # the new modwerk.app key
npx wrangler versions secret put EMAIL_FROM --config wrangler.worker.jsonc       # Modwerk <accounts@modwerk.app>
```

`AUTH_SECRET` and `ADMIN_KEY_SHA256` stay as they are: rotating `AUTH_SECRET` would invalidate every session and action link. A staged version is not the release; do not deploy it on its own.

Before launch, send a verification email to a real inbox from a local Worker (`docs/FORUM.md`, local sample data) with the new key and sender. In the inbox, open "Show original" (Gmail) and confirm **SPF: pass**, **DKIM: pass** and **DMARC: pass** for `modwerk.app`. The earlier octamod.app test left recipient-side results unconfirmed; do not skip this.

### 3. Mail: where support mail arrives

The registrar's default MX points at a Hetzner mail server with no mailbox, so it cannot receive mail. Account mail is sent only, so it does not need one. A public support address does.

The public support contact is `support@modwerk.app` (`SUPPORT_EMAIL` in `src/support.ts`). It is the Reply-To of every account, news, activity and welcome message and is linked from the sign-in, privacy, account-removal, imprint, content-report and projects pages, so no personal address appears on the site. The owner's Gmail address was the contact from 3 October to 10 October 2026. Messages already sent keep their old Reply-To.

Receiving uses Resend, which already sends for this domain. On 10 October 2026 the owner replaced the registrar's root MX with the record Resend shows under **Domains → modwerk.app → Enable Receiving** (`@  MX  9  inbound-smtp.eu-west-1.amazonaws.com.`, Ireland like the sending region). Resend accepts every address at the domain, so `support@` needs no separate setup, and sending is unaffected because it runs on the `send` subdomain. Received messages are listed under **Emails → Receiving** in the Resend dashboard and are retrievable through its API and an `email.received` webhook. Resend does not forward to another inbox by itself; that needs a webhook handler or a separate forwarding service.

The owner released the switch of `SUPPORT_EMAIL` on 10 October 2026 while Resend still showed the receiving MX as pending, probably because its resolver held the old record's two-hour TTL. Resend drops mail for a receiving domain until that record is verified, so messages sent to `support@` before then may have been lost. Once the dashboard shows the record verified, send a test message from another account and confirm it appears under **Emails → Receiving**. `npm run domain:check -- mail` reports the inbound line green once the registrar MX is gone; that shows the record exists, not that mail arrives.

The Worker reads `SUPPORT_EMAIL` at build time. `scripts/change-scope.mjs` counts every file the Worker compiles, `src/support.ts` included, so merging a change to it redeploys the Worker and the new Reply-To takes effect.

### 4. GitHub: verify the domain for Pages

In GitHub: **Settings → Pages → Add a domain** (account level, not repository level), enter `modwerk.app`, and add the TXT record GitHub shows at host `_github-pages-challenge-repeat98`. This stops anyone else from claiming the domain for a Pages site. It does not point any visitor at Pages and does not affect octamod.app. `npm run domain:check -- pages` shows the challenge line green.

Do **not** add the Pages address records yet. The apex would answer 404 with an invalid certificate until launch, and there is no benefit in doing it early.

## Launch day

Prerequisites: the launch pull request is approved and ready; `npm run check` passes on it; the forum gates in [FORUM_LAUNCH.md](FORUM_LAUNCH.md) are done (D1 backup and recovery bookmark, Worker crypto capacity, migrations 0011–0020); the three "Before launch" sections above are green. Choose a quiet hour. Steps 2–5 should follow each other within minutes.

1. **Record the way back.** Note the current Worker version (`npx wrangler deployments list --config wrangler.worker.jsonc`) and the D1 bookmark, and keep the Pages settings page open.
2. **Deploy the Worker**, with the staged secrets and the new `APP_URL`: `npx wrangler versions upload --config wrangler.worker.jsonc`, inspect it with `npx wrangler versions view <id> --config wrangler.worker.jsonc` (all four secrets present, `APP_URL` is `https://modwerk.app/`), then deploy that version. Apply the migrations first, after the backup, as FORUM_LAUNCH.md describes. From this moment the API trusts only modwerk.app; the old site's comments and ratings pause until step 5.
3. **Point DNS at Pages.** In Hetzner's DNS console, delete the default A, AAAA and `www` records for modwerk.app and add the records below, with a short TTL (300 seconds) while launching.

| Type | Host | Value |
| --- | --- | --- |
| A | `@` | `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153` (four records) |
| AAAA | `@` | `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153` (four records) |
| CNAME | `www` | `repeat98.github.io.` |

   Replace the root SPF with `v=spf1 -all`. Resend sends from the `send` subdomain, so the root authorises no sender, and the registrar's `+a` would otherwise authorise the Pages addresses.
4. **Set the repository's Pages custom domain** to `modwerk.app` (Settings → Pages). This releases octamod.app from this repository: it stops serving the site from here. Wait for GitHub's certificate, then tick **Enforce HTTPS**.
5. **Publish.** Merge the launch pull request into `main`; the Pages workflow verifies the owner merge, builds and publishes to modwerk.app. Then run `npm run domain:check -- all`: `pages` and `worker` must be green. `redirect` follows in the next step.
6. **Redirect octamod.app.** The `redirect/` folder is the whole site: a signpost page that sends every visitor to the same path, query and fragment on modwerk.app, so shared module links and mail links already sent keep working. Nothing is stored or read in the browser. `404.html` is the same page, which is how GitHub Pages reaches it for old deep links such as `/module/euclid/`.

   A custom domain belongs to one Pages site, and step 4 gave modwerk.app to this repository. octamod.app therefore needs its own tiny Pages site: create a repository, put the contents of `redirect/` at its root (including `CNAME` and `.nojekyll`), publish it from the `main` branch, and set its custom domain to `octamod.app`. GitHub issues a fresh certificate when a domain moves between sites, so octamod.app can show a certificate error for minutes to about an hour. Check with `npm run domain:check -- redirect`.

   Saved configurations and remembered firmware live in the browser under octamod.app and do not follow to modwerk.app. After the redirect, the old page can no longer be reached to export them, so announce the move on the old site first and ask people to use **Export configuration** (a JSON backup, no firmware) and import it on modwerk.app.
7. **Check the accounts end to end** with a real inbox: register, receive the Modwerk mail from `accounts@modwerk.app`, verify (the link opens modwerk.app), sign in, recover the password. Registration stays closed (`REGISTRATION_OPEN=false`) until the owner opens it.

### Way back

Nothing in the migrations is destructive, so the data stays. To undo the front: roll the Worker back to the recorded version (`npx wrangler rollback --config wrangler.worker.jsonc`), set the repository's Pages custom domain back to `octamod.app`, and restore the previous DNS records. Do not restore the database to undo a code change (see FORUM_LAUNCH.md).

## After launch

- **Tighten DMARC** once real mail is delivering: look at the delivery evidence in Resend for a few weeks, then move `_dmarc` to `p=quarantine`, later `p=reject`. Add `rua=mailto:` only to an address that actually receives mail.
- **Retire octamod.app mail**: when nothing sends as octamod.app any more, delete its Resend domain, revoke its API key and remove its records. Keep the domain itself registered for as long as the redirect is needed.
- **Optional hardening:** a `CAA` record limited to `letsencrypt.org` (GitHub Pages certificates come from Let's Encrypt) and DNSSEC at the registrar, if offered. A wrong CAA record blocks certificate renewal, so add it only with `npm run domain:check -- pages` open.
- **Cosmetic:** the Worker and its workers.dev address still say octamod. Renaming creates a new Worker and changes `COMMUNITY_API_URL`; it is not needed for the launch.

## Rules

- No credentials in the repository, in frontend variables, in screenshots or in pull requests. Secrets go to the Worker with Wrangler's interactive input.
- DNS and provider changes are made by the owner. Nothing in this repository edits DNS or a provider account.
- Verification, recovery and the one-time new-member welcome share the account-mail quota. Activity and optional news follow their separate settings; see [mail operation](FORUM.md).
