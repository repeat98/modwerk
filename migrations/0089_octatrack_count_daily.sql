-- Identifier-free daily totals of the Octatrack base install guide's steps and the diagnostics invitation's answers,
-- through /api/usage/count like octatrack_beta_daily: a day, a fixed event name, at most one fixed category
-- ('' for none) and a count. No account, device, module, session, visitor or event identifier. The server checks the
-- names against OCTATRACK_STEP_COUNTS (octatrack-diagnostics-contract.ts); hourly cleanup keeps 30 days.
CREATE TABLE octatrack_count_daily (
  day TEXT NOT NULL,
  event TEXT NOT NULL CHECK(length(event) BETWEEN 1 AND 40),
  detail TEXT NOT NULL DEFAULT '' CHECK(length(detail) <= 32),
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(day,event,detail)
);
