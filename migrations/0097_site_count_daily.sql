-- Identifier-free daily totals of where page loads came from and how the sign-in prompt was answered. Written through /api/usage/count like
-- octatrack_count_daily: a day, a fixed event name, exactly one fixed category and a count. No account, device, visitor,
-- session or address. The server checks the names against SITE_COUNTS (usage-contract.ts); hourly cleanup keeps 90 days.
CREATE TABLE site_count_daily (
  day TEXT NOT NULL,
  event TEXT NOT NULL CHECK(length(event) BETWEEN 1 AND 40),
  detail TEXT NOT NULL CHECK(length(detail) BETWEEN 1 AND 32),
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(day,event,detail)
);
