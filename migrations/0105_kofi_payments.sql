-- Ko-fi payments from the webhook (server/kofi.ts), for the share of the running costs that tips cover. Only Ko-fi's
-- message ID (a repeated delivery counts once), the UTC month, the amount in cents, the currency and whether it counts
-- (a donation or subscription that is not Ko-fi's test) are kept. No name, email address, message or link is stored.
CREATE TABLE kofi_payments (
  message_id TEXT PRIMARY KEY,
  month TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  counted INTEGER NOT NULL,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX kofi_payments_month ON kofi_payments(month, counted);
