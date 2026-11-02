# Site statistics and module popularity

The Statistics tab is the first tab and default view in `#admin`. It reports member growth and the sign-up rate against traffic (see [COMMUNITY_OPERATIONS.md](COMMUNITY_OPERATIONS.md#member-statistics)), visits and use of the local configurator, module engagement and current moderation workload. All private reads require the existing server-verified administrator session; the public collector has no read endpoint. Guest participation stays account-free. No credentials, real visitor records or real usage counts belong in the public repository.

## Definitions and coverage

| Measure | Trigger | Limit |
| --- | --- | --- |
| Visitors today | Distinct random browser identifiers received during one UTC day | Identifiers rotate daily; this is not a count of people or period-wide unique visitors. Any supported event establishes a visit. |
| Page views | Initial visit or navigation to a different app path | Fixed page names only; admin/review views and query-only changes are excluded. Raw routes, URLs and referrers are not sent. |
| Configurations started | First module added to an empty configuration, or a nonempty import/duplicate | Empty automatic configurations do not count. Configuration IDs are deduplicated on the device and never sent. |
| Successful builds | Completed local builds that still belong to the current operation | Failed, rejected and cancelled builds do not count. |
| Firmware download requests | Click on an enabled firmware download button | Does not prove that the file was saved or flashed. |
| Configuration exports | Configuration backup download requested | Contents and file names are not sent. |
| Support dialog opens | The Support Modwerk dialog opens, from the sidebar or the mobile menu | Counted from deployment of `0051_support_and_hourly_usage.sql`; earlier days read as zero and are not compared. |
| Ko-fi clicks | Click on the dialog's Ko-fi button, or on a bell or account inbox entry that links to the Ko-fi page | Counts link opens, not tips. Ko-fi's own dashboard reports what happens there. |

The dashboard offers 7, 30 and 90 UTC-day periods, a selectable daily chart for every usage metric (hourly in the 7-day view, see below), an accessible daily table and CSV export. Chart bars support clicks and arrow/Home/End keys with one tab stop; exact selected values appear below the chart. Collection begins with the first accepted event after deployment. Earlier traffic is unavailable and appears as a dash, not an invented zero. Today and the collection start day are partial. Offline use, blocked requests, privacy preferences, device resets and automated traffic affect coverage; these counts are not billing or audit evidence.

Every count also adds to a total for its UTC hour (`usage_hourly`, keyed `YYYY-MM-DDTHH`). The 7-day view can switch the chart to its 168 hours; 30 and 90 days stay daily because hours are kept for only 14 days. Hours before `hourly_started` in `usage_meta` have no value, and the current hour is partial. An hour's visitors are daily visitors counted in the hour of their first event that day, so a day's hours add up to its visitors; they are not unique visitors per hour.

Selected-period event totals include today. Percentage changes compare the completed portion of the selected period (6 or 29 days) with an equally long immediately preceding window. The first collection day is excluded conservatively, and comparisons require both full windows to be within collected, retained history. There is no 90-day comparison because its preceding window exceeds the existing 90-day retention. A zero previous total shows an absolute increase rather than an infinite percentage. Averages, busiest days and days with visitors use fully collected completed days, including covered zero-activity days. Daily visitors are not summed into period-wide unique visitors. Aggregate events are not a linked conversion funnel.

CSV contains only daily aggregate values, UTC dates and `uncollected`, `partial` or `complete` coverage. Uncollected metric fields are blank; a recorded zero stays zero. It contains no visitor identifiers, module/configuration grouping or private report content.

## Page traffic

Migration `0061_page_traffic.sql` adds `usage_page_daily(day,page,views)`, retained for 90 UTC days by the existing cleanup. The admin dashboard ranks named pages by views and share, with a selectable daily chart using the same 7/30/90-day period. These are repeatable page views, not unique visitors per page. Earlier totals cannot be split retroactively. The first named event sets `pages_started`; earlier days show unavailable and the start day and today are partial. Older clients may still send unnamed views: the dashboard shows their count separately and excludes them from named-page shares.

Both `/usage/count` and `/usage/events` accept an optional `page` only for `page_view`. `usage-pages.ts` supplies a finite, server-validated catalog: site sections, libraries/configurators and public catalog module IDs. Library categories are grouped by machine. Discussions, profiles, direct messages, account screens, module-set details and community module details are grouped without their IDs. Queries, fragments, usernames, account tokens and arbitrary paths are never sent. Only the app's missing-page rendering decision records `missing-page`; a route missing from the analytics catalog records `unclassified`. Admin/review and redirect-only routes do not count. Navigating between two distinct paths counts again even when they share a page group; query-only changes and repeated React effects do not. No new visitor identifiers, sessions or per-person page histories are stored.

The legacy `page-not-found` bucket mixed missing pages with valid routes, including the Overview introduced on 21 October 2026. It remains accepted for older clients and is labelled “Legacy unclassified / missing pages” in Admin. Never interpret it as a broken-link count or backfill it into Overview. New routes need a bounded label in `usage-pages.ts` and coverage in `usage-pages.test.ts`; preserve the renderer's missing-page signal instead of treating an unknown analytics label as a missing page. Deploy the Worker accepting new labels before publishing the frontend.

The existing opt-out, DNT/GPC, origin checks, omitted credentials/referrer and abuse limits apply. Opted-in event retries update global and page counts atomically and only once, even if a retry changes its page. The bilingual notice and usage-consent version are updated; existing opt-ins require a new choice for the expanded payload. Apply the migration and deploy the Worker before the frontend; older identifier-free clients can still send unnamed views, and the dashboard supports older responses.

## Machine attribution

Migration `0083_usage_machine_coverage.sql` preserves existing machine totals and expands the closed machine enum to Digitakt II and Analog Rytm MKII. Apply it before deploying the Worker, then publish the frontend. Local build outcomes count even when a research machine's download gate is closed; counting must never change release approval or download availability.

Admin shows an Unattributed row equal to the selected period's overall build/failure/download totals minus their named machine totals. This includes old clients and pre-breakdown events; never backfill them into a guessed machine. `machineCoverageExpanded` records the migration boundary, whose first day is partial. Earlier zeros on newly covered machines do not establish inactivity. When adding a build-capable machine, update the usage enum, database constraint, builder/download callers and coverage tests together.

## Community invitation responses

The administrator dashboard shows separate totals for the signed-in member and signed-out visitor invitations: shown, Join Discord, Create account (visitors only) and dismissed. The inline signup welcome has a separate Join Discord total; its optional Ko-fi link contributes to the existing support-link total. New signup invitation markers suppress the member popup and do not count as impressions. Dismissal includes the close button, the explicit dismissal action and Escape. Migration `0054_discord_invitation.sql` adds the daily and hourly counters and their collection boundary. These are action counts; a link click does not confirm account creation or Discord membership. Local modal and welcome previews do not count. They use the same existing reporting preferences, browser privacy signals, credential-free requests and retention as other usage counts; no account ID or Discord identity is sent with the action.

## Community insights and moderation

`GET /api/admin/insights` returns current counts, open issue age buckets and per-module/set aggregate engagement. It uses the same server-side administrator check and `Cache-Control: no-store` as other private reads. No report body, comment body, reporter identity, guest ID or session material enters this response. Each data source is grouped before joining to prevent multiplication of independent ratings, comments and issues. Withdrawn modules with retained activity remain visible as history.

Module download requests are cumulative from their own collection boundary; likes, ratings, retained comments and open issues are current totals. These are independent of the usage period selector. Rating averages display their sample size; unrated modules remain labelled unrated. Ranking supports downloads, likes, Bayesian ratings, comments and issues, plus title/ID search. Module download totals cannot be added together to infer firmware download requests.

Community health shows open/resolved issues, reports waiting at least seven days, current comments and backend community publications. Issue age is elapsed time since creation, including reopened reports; there is no invented resolution timestamp. Open reports are grouped into under 7, 7–29 and 30+ days. Pending module PRs are reviewed on GitHub, so the retired website submission queue is no longer presented as a live PR count.

Issue links open the existing private inbox, with per-module links selecting open reports for that module. Optional `moduleId` and `status=all|open|closed` filters are bound and applied on the server before the existing 200-report limit. The UI explains when that limit is reached. Refresh updates usage and community reads together; an independent source failure does not replace unavailable counts with zero. Returning from moderation reloads current statistics.

### Following up unanswered discussions

The existing first-reply list starts with the oldest open, unlocked member discussions waiting more than 48 hours. Category and oldest/newest filters, ten-row pagination and a refresh control cover the whole backlog. Automatic module threads, hidden threads, and threads answered visibly by someone other than their author are excluded; the author's own replies and hidden replies do not answer them.

`GET /api/admin/unanswered-threads?page=1&category=all&order=oldest` uses the same server-verified administrator boundary. Category filters use the forum's effective category, `COALESCE(section,category)`, because newer sections retain `general` underneath. Categories and sort values are closed enums, pages are bounded and clamped when the backlog shrinks, and ties sort by thread ID. The response contains public thread IDs/titles and waiting dates, never author identities or post bodies. Queue requests do not reload activity charts or change their headline totals. Use the refresh control after replying.

## Privacy and authorization

The `#privacy` page lets visitors turn counts off on their device. Do Not Track and Global Privacy Control suppress reporting before an identifier is created. Storage failures also suppress reporting; network failures never block configuration or firmware work. The request omits cookies, guest/admin session headers and referrers.

`POST /api/usage/events` accepts a closed event enum and two random UUIDs (`visitor`, `eventId`), optionally a validated machine for build/download events or a fixed page key for page views, with a 512-byte limit and an exact field allowlist. It rejects firmware bodies, configuration contents, arbitrary extra fields and requests from another website origin. No accounts are created. No IP address, user agent, guest identity, raw route, module list or firmware is stored with these site statistics. Public module reporting is separate, as described below.

The server stores only purpose-separated daily HMAC digests for duplicate suppression. Key material derives from the existing backend-only `ADMIN_KEY_SHA256`; it must never appear in frontend variables or API responses. Rotating the administrator key invalidates existing admin sessions and also changes active visitor digests, so counts around a rotation can overcount. `GET /api/admin/statistics?days=7|30|90` remains behind the existing administrator authorization boundary, including on self-hosted adapters.

D1 batches atomically count an event and a previously unseen daily visitor once. Duplicate requests with the same event ID cannot increment another metric. A daily identifier is limited to 200 requests per hour. This is a cost guard, not protection against a bot generating new identifiers.

## Storage and deployment

1. Apply the additive `0008_private_usage.sql` migration to the community D1 database.
2. Deploy the reviewed Worker, retaining its existing bindings and backend administrator secret.
3. Publish the frontend with the normal community API URL. Do not publish local QA configuration or test records.

The Worker runs cleanup hourly at minute 17, using UTC. Raw identifiers are never persisted. Hashed deduplication rows retain only today and yesterday; daily totals retain today and the preceding 89 days; hourly totals retain today and the preceding 13 days. Hourly scheduling means expired rows can remain until the next successful sweep. `collection_started` preserves the original coverage boundary. Rate-limit rows expire after an hour and are removed by the same sweep.

A self-hosted backend must call `cleanupUsage` on a comparable schedule. No historical analytics are imported or backfilled by this feature. Cloudflare infrastructure has its own request processing and operational metadata outside these application tables.

## Validation

Backend tests cover administrator-only reads, guest denial, exact event/visitor deduplication, atomic failure/retry behavior, strict payload rejection, browser privacy headers, daily digest rotation, rate limiting, unconfigured service behavior, empty coverage and retention boundaries. Client tests cover the outgoing allowlist, omission of credentials, local configuration deduplication, daily visitor rotation, privacy preferences and nonblocking failures.

Run `npm run check` with Node.js 24. Local UI QA uses an isolated local D1 database and synthetic events, never production records or firmware. This frontend/backend change does not modify the firmware engine, module sources or verification gates and does not require rerunning the native firmware matrix or DSP stress suite.

[D1 transactional batch documentation](https://developers.cloudflare.com/d1/worker-api/d1-database/) and [Worker cron triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/) describe the deployment primitives.

## Public module popularity

Library cards and module community panels lead with the members who reported a module working and its likes, followed by firmware download requests. Ratings are no longer shown or collected. The library can sort by most reported working, most liked and most downloaded; most reported working breaks ties by likes, and every sort ends on the name, so ties are deterministic. Modules with likes but no working reports are included in the summary. Unavailable counts appear as a dash, while a successfully fetched zero is shown as zero. Public module aggregates do not grant access to administrator site statistics.

The administrator's Rating (Bayesian) sort, which still ranks the ratings members gave before they were retired, uses the shared score `(count × average + 5 × prior) / (count + 5)`. The prior is the vote-weighted mean across rated modules in the complete statistics response, calculated before search, machine or category filtering. Public rankings use the public response; administrator rankings include all retained records in their response. Five prior votes pull small samples toward that mean while larger samples approach their own average. An empty response uses the neutral midpoint of 3 stars, but unrated or unavailable modules have no score and sort after every rated module. Equal scores sort by rating count descending, then name and module ID. Scores use full precision; the displayed averages and counts remain unweighted, and no stored ratings or API fields change.

A click on an enabled firmware download button reports each unique module ID from the **completed build report**, once for that request. It does not count module selection, configuration export, build attempts, rejected builds or a confirmed file save/flash. Repeated download requests count again. Previous downloads cannot be reconstructed and are not backfilled; `0009_module_downloads.sql` records the UTC deployment coverage boundary. Counts are cumulative from that point, including through module version updates; likes remain the current total of guest likes and can decrease when unliked.

`POST /api/usage/module-downloads` accepts exactly `moduleId`, `eventId` and `visitor`, at most 512 bytes, for available build-integrated modules that have passed their build approval gate. Each module request receives an independent random event ID. No configuration ID, name, version pins, list or common build/download ID is sent. The daily random visitor identifier is used only for a separately hashed 200-request/hour rate limit; deduplication hashes do not contain a visitor or module ID. Neither rate-limit nor deduplication rows retain an association between a visitor and a module. The server receives each individual module ID and stores only its cumulative total. Infrastructure request processing remains outside these application tables.

Module reporting uses the same device opt-out, Do Not Track, Global Privacy Control, omitted credentials/referrer and nonblocking failure behavior as private site statistics. Invalid modules, extra fields, firmware bodies and other website origins are rejected. A transactional batch prevents duplicate or partially failed requests from inflating totals, including retries that change the module ID. Hashed markers retain today and yesterday and expire through the existing hourly cleanup; public totals and their coverage boundary remain. Independent requests can be blocked or lost, so public module totals and private site download totals may differ.

Apply additive migration `0009_module_downloads.sql` before deploying the new Worker. Keep the existing database bindings and administrator secret. The summary response remains an array and retains numeric `average` for compatibility with older clients; `count: 0` denotes an unrated module. New tests cover public unrated/zero totals, independent downloads, retry/failure atomicity, strict validation, privacy, rate limits, retention and discovery sorting. No firmware engine or module source changes are involved.

### Stability grade

The foot of each library card grades how far real use backs a module, so nobody mistakes untried firmware for settled firmware before a gig or a session. `moduleStability` in `src/catalog/module-stability.ts` computes it in the browser from the summary, and `STABILITY_GRADES` there holds every threshold:

| Grade | Requires |
| --- | --- |
| Limited real-world testing | The default for every module, and whenever the summary cannot be fetched |
| In regular use | 100 downloads, 14 days since the first download, no confirmed bug for 14 days |
| Lots of use, no recent confirmed bugs | 300 downloads, 45 days since the first download, no confirmed bug for 30 days |

A confirmed bug that affects the current version, or whose applicability is unknown, replaces the grade with the number of confirmed bugs; unconfirmed reports and reports waiting for the reporter are shown beside the grade and do not change it. A module whose build is still being verified says so first. Hovering the grade (or a screen reader) gives the figures behind it, the next step and the hardware record. Download requests are opted-in and not unique people, and the days were set from the first weeks of counting (from 6 Oct 2026), so raise them in `STABILITY_GRADES` once six to eight weeks of figures show how fast reports arrive.

For this the summary adds `openIssues`, `lastIssueAt` (the latest report, open or closed) and `firstDownloadAt` to each module. Private reports count too, but only as a number and a date. `0052_module_first_download.sql` adds `first_download_at` to `module_downloads`; existing rows take their first retained daily count, else the start of daily or overall counting, which is never earlier than the real first download.
