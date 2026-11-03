# Modwerk accounts and single sign-on

The owner’s 4 October 2026 request supersedes the original guest-only Octamod policy. Visitors can read the library, module discussions and forum without signing in. Ratings, comments, forum interactions, issue reports and firmware composition require a verified account. Administrator access remains a separate backend authorization; visitor OAuth cannot grant it.

Signup and login offer email/password, Google, GitHub and Discord. Social signup first asks for a public username. Provider names and photos never automatically become a public profile. The provider must supply a verified email address. Accounts with matching email addresses are not silently linked; use the original sign-in method for an existing account. Provider credentials for community SSO are separate from GitHub developer OAuth credentials.

## Backend configuration

Apply the combined release migrations 0011–0020 in order; migration `0017_social_accounts.sql` adds the social account handoff. Preserve the existing `AUTH_SECRET`, `SESSION_TRANSPORT`, `APP_URL`, `REGISTRATION_OPEN`, `PRIVACY_READY`, mail settings and independent administrator key.

The combined release pins `AUTH_BASE_URL` in `wrangler.worker.jsonc` to the canonical backend auth URL, `https://octamod-community.octamod.workers.dev/api/auth`. `APP_URL` remains the frontend URL, `https://modwerk.app/`. Register the following exact callback URLs with the providers, replacing the example backend if hosted elsewhere:

| Provider | Callback URL | Worker credentials |
| --- | --- | --- |
| Google | `https://octamod-community.octamod.workers.dev/api/auth/callback/google` | `SSO_GOOGLE_CLIENT_ID`, `SSO_GOOGLE_CLIENT_SECRET` |
| GitHub | `https://octamod-community.octamod.workers.dev/api/auth/callback/github` | `SSO_GITHUB_CLIENT_ID`, `SSO_GITHUB_CLIENT_SECRET` |
| Discord | `https://octamod-community.octamod.workers.dev/api/auth/callback/discord` | `SSO_DISCORD_CLIENT_ID`, `SSO_DISCORD_CLIENT_SECRET` |

Store client secrets only as Worker secrets. Never put them in `VITE_` variables, committed files or logs. A provider button stays disabled until its credentials, auth secret and backend URL are configured. Email sign-in remains available independently; social registration also respects `REGISTRATION_OPEN`.

Better Auth performs the provider authorization-code exchange, state-cookie verification and PKCE. The integration binds Google redirect tokens to the state nonce and uses Better Auth’s ID-token verifier for RS256 signatures, issuer, audience and expiry before reading identity claims. The pinned Google provider does not perform these checks itself on its redirect path; the `googleTokenBinding` plugin supplies them. A top-level visit to the API sets its own first-party state cookie, avoiding dependence on third-party cookies between GitHub Pages and the Worker. The frontend receives only a random, single-use, one-minute exchange code, whose hash is stored on the backend and which is bound to a private verifier in its originating tab. The signed member session is delivered through the existing session response header or same-origin HttpOnly cookies. Provider access and refresh tokens are encrypted at rest. Only explicit facade routes are exposed.

## Provider setup status — 4 October 2026

With the owner’s explicit approval, the Google, GitHub and Discord community OAuth apps are configured with the production callbacks above and the matching local callbacks at `http://127.0.0.1:8999/api/auth/callback/<provider>`. GitHub app 3904181 and Discord app 1556325095641976895 use the Modwerk name, logo and public homepage/privacy/rules links. Google project `modwerk-510615` has the same branding, the `modwerk.app` authorized domain and its backend callback domain. Discord interactions and linked-role verification URLs remain empty: community sign-in uses neither feature.

The Google app remains External / Testing with the owner as its test user. Public Google login still requires the applicable publishing/branding verification after the reviewed homepage and legal notices are publicly available; the private local test does not establish that launch gate. No unnecessary API scopes, bot or billing trial were enabled.

All six `SSO_*` credentials are stored privately in the ignored local Worker configuration and in **staged Worker version `9cd85259-e35a-46e4-a9b7-a52cf0f544ae`**. That version was created with `wrangler versions secret bulk`; it was **not deployed**. It copies the existing staged Worker code, not this release branch. Wrangler patches the latest version: this staging chain also preserves the Modwerk sender and sending key staged in versions `4c541395-5e26-4e85-bd78-713f52875a0d` and `73e1542f-b1b0-4c46-95d5-908230528708`. Carry its six secrets, together with the existing auth/mail/admin secrets, into the reviewed release version during a separately authorized rollout. Never deploy this staging version merely to activate SSO. Production migrations and the closed registration/privacy flags remain unchanged. Developer GitHub OAuth needs its own credentials and callback; visitor SSO does not configure or authorize that workspace.

## Account page and builds

Members can change their username, display name and optional bio, see their private email and sign-in methods, inspect active sessions and revoke other sessions. Deleting an account requires its password or a social sign-in in the preceding ten minutes, plus typing `DELETE`. One database transaction removes authentication and private account records, revokes sessions and anonymizes the retained discussion author. Discussions remain readable as “Deleted member”; pinned module source credits are preserved. Local configurations and firmware are unaffected.

Signed-out build attempts open a keyboard-accessible sign-in/signup modal. Its quiet Skip for now counts down for five seconds before enabling; reopening the prompt restarts the wait. Sign in, Create account and Cancel remain available immediately. Skipping lets a guest build without an account until the page reloads. The return route restores the configuration after authentication. Each actual build checks the selection with `/api/auth/build-access` immediately before local composition, signed in or not; beta-only modules still need a verified beta member. That request contains no firmware. Changing accounts or signing out cancels an active build and prevents reuse of another account’s build state. Existing engine qualification and download gates remain in force.

The sign-in buttons use locally served provider artwork: Google’s pre-approved gradient-logo/lettering asset and the official GitHub and Discord symbols. Native buttons retain the existing server OAuth flow and keyboard behavior; no provider widget script is loaded just to show the form. Required rules agreement and optional news consent each keep the checkbox and full linked label in one wrapping row, including on mobile. Asset provenance and trademark notices are in `public/auth/NOTICE.txt`.

The Forum sidebar badge marks the new feature. Public reading remains available, while mutation routes independently enforce verified membership.

## Verification

`npm run check` runs application checks only. Social regression tests exercise all three actual provider adapters with synthetic HTTP responses, signed synthetic Google ID tokens and an in-memory database. They cover account creation/returning login, cookie/state enforcement, browser binding, expiry/replay, verified provider email, refused implicit account linking, provider configuration, public forum reading, member-only mutation/build access, profile isolation and account deletion. Live local signup and returning login also passed for Google, GitHub and Discord using the owner-authorized accounts, real provider callbacks and isolated local databases. The accounts retained the chosen public username, verified provider email and unchecked optional news preference. Separate databases avoided implicit linking of the owner’s matching provider emails. Configuration-return navigation was checked separately; no firmware was selected or uploaded. These tests cover the registered loopback callbacks, not deployed production callbacks.

Provider setup references: [Better Auth Google](https://www.better-auth.com/docs/authentication/google), [GitHub](https://www.better-auth.com/docs/authentication/github), [Discord](https://www.better-auth.com/docs/authentication/discord), and [OAuth state and linking](https://www.better-auth.com/docs/concepts/oauth).

Social registration also requires `PRIVACY_READY=true`, the current community rules version and an explicit optional news choice (unchecked by default). Both conditions are rechecked during provider callbacks. The integrated migration stores the accepted rules version and news choice in the short-lived handoff, then records them privately against the created account. Social-only members confirm exports and removal requests with a server session created within ten minutes; password accounts continue to confirm their current password.
