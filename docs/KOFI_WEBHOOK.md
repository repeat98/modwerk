# Ko-fi webhook

The support dialogs show the running costs (`SUPPORT_COSTS` in `src/config/support.ts`) and a bar for how much of them Ko-fi tips covered this month. Ko-fi has no API for reading a goal or a total, so the Worker counts the payments Ko-fi reports to it.

## How it works

- Ko-fi posts each payment to `<community API>/kofi/webhook` as a form field `data` holding JSON with the account's verification token (`server/kofi.ts`).
- The Worker keeps Ko-fi's message ID (a repeated delivery counts once), the UTC month, the amount in cents, the currency and whether it counts (`kofi_payments`, migration 0105). The payer's name, email address, message and links are never stored.
- Donations and subscriptions count; shop orders and commissions do not. A payer at `example.com` is Ko-fi's **Send test** and never counts.
- `GET <community API>/support/coverage` returns `{ month, euros }`: this UTC month's counted payments in euros, or `euros: null` while the token is not set. Payments in another currency are kept but not added.
- The dialogs add `SUPPORT_COSTS.covered` when `SUPPORT_COSTS.month` (`YYYY-MM`) is the current month, for tips from before the webhook was set up.

## Setup (owner)

1. On Ko-fi, open the webhooks page (`https://ko-fi.com/manage/webhooks`) and set the webhook URL to `https://octamod-community.octamod.workers.dev/api/kofi/webhook`.
2. Copy the verification token shown there and store it as a Worker secret: `npx wrangler secret put KOFI_VERIFICATION_TOKEN --config wrangler.worker.jsonc`.
3. Press **Send test** on Ko-fi. The test is stored but not counted; `npx wrangler d1 execute octamod-community --remote --config wrangler.worker.jsonc --command "SELECT month,amount_cents,currency,counted FROM kofi_payments"` shows it with `counted` 0.
4. Tips received earlier this month: set `month` and `covered` in `SUPPORT_COSTS` once.

Until the secret is set, the webhook answers 503 and the dialogs show the costs without a bar.
