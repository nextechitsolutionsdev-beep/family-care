# QA remediation — 21/10/2026

Follow-up to `docs/QA-REPORT.md` (audit of `40cdea1`, documented in `d022fc0`). The original audit is unchanged; corrections are recorded here. No other developer changed the repository after `d022fc0`.

Owner decisions (21/10/2026): test on the live project with tracked cleanup (no separate project); shared phone numbers warn, open the existing file or need explicit confirmation; doctor commission is visible to the owner and to each doctor for their own terms only; per-offer «once per patient» setting (existing offers unchanged); one permanent patient code for all specialties. Details: `docs/ASSUMPTIONS.md`.

## Status

| | |
|---|---|
| Code, migrations, tests, docs, user guide | Committed and pushed to branch `codex/qa-remediation` (not merged into `main`) |
| Seven database migrations | **Not applied** (verified only inside rolled-back transactions on the live project) |
| Edge Functions `manage-users`, `experience-feedback` | **Not deployed** |
| Frontend | **Not deployed** (production still serves `40cdea1`) |
| Migration-dependent workflows | **BLOCKED** until the migrations are applied: 5 browser tests; listed below |

Nothing here is "fully verified" until the release steps below are approved and the blocked tests pass against the migrated project.

## Corrections to the audit

- **Loading (M3) was overstated.** The audit measured with `page.goto(route)`, which reloads the app per route. Measured separately, sidebar navigation makes no table reads (ClinicProvider keeps its data). The costs are cold login, reload, the refresh button and the refresh after every save. Production login→Today median was 2.4 s (three runs), not 8.8 s.
- **Inactive offer code (L2):** no raw text reached the screen; `P0002` already showed a generic Arabic message. It was unspecific, not exposed.
- **Unlabeled control (H1.5):** not an accessibility defect. The check read controls while React replaced them during a re-render (a detached element has no labels). Reproduced on `/follow-ups` at 1920 px; the label is present in the DOM.
- **Archive summary (L8):** confirmed; counts were taken in a separate statement before archiving.

## Findings

Classes: **Defect** (product), **Stale** (test behind approved behaviour), **Infra** (test infrastructure), **Decision** (owner), **Unreproduced**.

| ID | Original finding | Class | Root cause | Fix | Verification | Remaining |
|---|---|---|---|---|---|---|
| H1 | 6/22 E2E failed; CI ran no tests | Stale + Infra | Specs not updated after `902cc6c` (follow-up admission), specialty presets, weekday filter (`f728b49`), audited revisions (19/10); CI built and deployed only | Specs follow the approved flows (continuation link → collect → admit in «اليوم» → finish; code/order customisation; date before doctor; revision-aware independent oracles). CI: quality job + built-app smoke before deploy | Latest full run: all 23 supported workflows passed; 5 migration-gated workflows remain blocked (see Results) | Database and browser suites are not in CI (they need the live project; no production credentials in CI) |
| H2a | `clinic.e2e` ignored `deleteUser` errors (2 active staff logins left per run) | Infra | Auth user cannot be deleted while its profile exists (FK NO ACTION); result unchecked | Fixture ledger: profile then Auth identity deleted only when nothing references it, existence re-checked; otherwise deactivate + ban and fail | 63 ledgers today: 16 logins deleted, 0 retained, 0 teardown failures | — |
| H2b | `roles.e2e` left a doctor login | Infra | No cleanup | Tracked by the ledger | Deleted in teardown | — |
| H2c | Global `run_jobs` with future dates (future rent for real tenants) | Infra | `clinic.e2e`, `database.test` | Removed; job rules run only inside rolled-back transactions | No `run_jobs` in any browser/API test; birthday/reminder/consent in `financial-rollback` | — |
| H2d | Permanent financial/messaging/catalog/expense test records | Infra | No tracked fixtures; catalog rows and expenses had no batch tag; campaigns reached every consenting patient of a specialty | Ledger with exact IDs; `demo_batch_id` on specialties/services/expenses (migration 100000); campaign step refuses to send unless every recipient is a fixture of its batch; unreferenced rows deleted, financial rows archived; tests that need the tag check the migration **before** writing | Teardown verification; `database.test.mjs` replaced by `api-integration.test.mjs` plus rolled-back tests | One test expense and two test catalog rows from before this fix remain (see Cleanup) |
| M1 | Duplicate patients created silently | Decision → Defect | No check | Warning with «فتح ملف …» buttons and required «ملف منفصل لنفس الرقم»; trigger `PHONE_EXISTS` for every entry point; a confirmation covers one write; placeholders and unchanged numbers exempt | `remediation-schema` (insert, edit, intake, placeholder, edit to a taken number with/without confirmation); `remediation.e2e` phone test passed | Server enforcement needs migration 100300 |
| M2 | Reception could read doctor commission | Decision → Defect | Table-level SELECT | Column privileges without `doctors.default_share_bps`, `visit_lines.doctor_share_bps`, `payment_allocations.doctor_share_minor`; `clinic_commission_terms()` (owner all, doctor own); client selects explicit columns; browser never computes commission | `remediation-schema`: 42501 for reception and doctor on every column, owner/doctor terms correct, reception booking/collection/payment allocation still work | Needs migration 100100. Live API check (incl. embedded selects) is in BLOCKED remediation test 4 |
| M3 | Every navigation reloads ~40 tables | Corrected | Measurement method | Desk saves refresh operational tables only; catalog/terms/settings reused until a full refresh or a catalog/settings edit | Before/after table below | Cold login and reload still read every permitted table; history growth remains a future concern |
| M4 | Pagination without order | Defect | `.range()` without `order()` | Keyset pagination on each table's unique (composite) key | `pagination.test` (2,500 rows changing between pages, single + composite keys); `pagination-live.test` (real PostgREST, page size 7, 8 tables equal the database) | Client tables are read at slightly different moments, so financial **totals** come from one database snapshot (`clinic_report_summary`, migration 100500) |
| M5 | Date inputs follow browser locale | Defect | Native `<input type=date>` | `DateInput`: dd/mm/yyyy entry/display, Arabic digits, pasted ISO, impossible dates/leap years refused, «فتح التقويم» button; ISO at the API | `dates.test`; `remediation.e2e` date test; every browser test enters dates through it | — |
| L1 | Archived test operations visible in Reports audit log | Defect | Filter missed follow-ups, services, specialties, expenses | Mapping added for positively identified rows | Client logic | Audit rows of deleted test logins and of removed lines cannot be positively identified; they stay visible (audit trail preserved) |
| L2 | Inactive offer code error | Corrected + Defect | `select … into strict` → `P0002` | `OFFER_NOT_FOUND`, `OFFER_INACTIVE`, `OFFER_ALREADY_USED_BY_PATIENT` with Arabic messages | `remediation-schema`, `financial-rollback` | Needs migration 100200 |
| L3 | Past follow-up dates accepted silently | Decision (no prohibition) | No check | Notice + required confirmation before Cairo today (visit follow-up, finish-visit follow-up, reschedule) | `remediation.e2e` past-date test passed | Server still accepts past dates (legitimate historical entry) |
| L4 | Empty test-batch selector | Defect | Shown when any batch existed | Shown only with an open batch | Browser tests | — |
| L5 | Sessions survived password reset/deactivation; leaked-password protection off | Defect; plan check | No revocation; reads ignored removed sessions | Reset revokes sessions; deactivation bans + revokes; reactivation unbans; role helpers require a live session | `remediation-schema` (reads 0 and writes refused after revocation; revoke callable only by the service role); `edge-validation` | Needs migration 100400 + `manage-users` deployment. Leaked-password protection: the plan could not be read with the available credentials; Supabase documents it for paid plans; not changed |
| L6 | Survey function allowed localhost; no CSP/frame headers | Defect | Hard-coded origins; no `_headers` | Production origin only unless `EXPERIENCE_ALLOWED_ORIGINS` adds others; build emits CSP, `frame-ancestors 'none'`, `X-Frame-Options: DENY`, HSTS, Permissions-Policy | `edge-validation` origin test; `csp.smoke` on the built app | `experience-feedback` deployment pending. After it, local browser tests open the survey from localhost only if that secret lists the dev origin |
| L7 | Login/data load stalled once | **Unreproduced** (intermittent) | Not identified. Seen 3 times (audit baseline, one measurement run, the first four tests and one later test of the final run): the profile or data load exceeded the test's 12–15 s wait. Diagnostics on three reruns found no pending request; reloads took 1.9–4.5 s with single requests up to 3–5 s | Requests time out after 20 s; reads retry once automatically; profile load failures offer «إعادة المحاولة» | All affected tests passed on rerun with unchanged code | Root cause open. Could be network/Supabase latency; needs monitoring after release |
| L8 | Archive script counts wrong | Defect | Counts taken before archiving | One statement; counts from rows actually changed | Ledger teardown output | — |
| Q1 | Offer reuse by the same patient | Decision | — | Per-offer «مرة واحدة لكل عميل»; existing offers repeat; partial unique index (concurrency-safe) plus earlier-redemption check; a redemption is consumed even if the visit is later voided | `remediation-schema` (first/second visit, other patient, retry, switch to once, direct duplicate insert) | Live concurrent test is in BLOCKED remediation test 4 |
| P1 | **New requirement:** one permanent patient code | Decision | Codes were per specialty (`DEN-000382`), also used as specialty membership | `patients.patient_code` `FC-000123` from a sequence; backfilled once (clinic patients first); immutable; unique; legacy codes kept as searchable aliases, no new ones; membership moved to `patient_specialties` (owner/reception only); per-visit «تخصص الزيارة» then doctor; code shown in search, file, visit, receipts and invoices | `patient-code.test` (links/balances/legacy codes unchanged across the migration, one code over two specialties, retry consumes one number, edits keep the code, change refused, doctor sees own visit only and no membership); `search.test` (permanent and legacy codes find the patient) | Needs migration 100600. Live UI/concurrency journey is BLOCKED remediation test 5 |
| D1 | **New requirement:** doctor categories for every specialty | Decision | The first category was always «أطباء أسنان» | `src/domain/doctorCategories.ts`: the first category is named after the selected specialty (doctor form, doctor table, doctor-account form); specialty is chosen first. Display only: stored value `dentist`, renting/percentage and all financial rules unchanged | `doctor-categories.test` (أسنان, باطنة, جلدية, «ال» prefix, multi-word, a new specialty); browser check showed «أطباء الباطنه» in the live form | — |
| R1 | Release safety: new frontend on old, intermediate and final schema | Infra | Several screens assumed the final schema | `src/clinic/compat.ts` probes columns/functions. Commission terms unavailable → «—» and doctor/percentage editing disabled (never 0); once-per-patient setting and patient codes hidden until their columns exist | `compat.test` (5); `migration-prefixes.test` stages every prefix 0…7 and checks reception/owner reads with the frontend's column lists, booking, collection and a doctor statement | Old frontend still breaks after 100100 (see release plan) |
| C1 | Migration checksums vs line endings (pre-existing) | Defect | 27 of 31 applied migrations were applied from CRLF files; Git stores LF, so a fresh clone failed `npm run migrate` with «Applied migration changed» | `scripts/migration-integrity.mjs`: a mismatch is accepted only if the SQL recorded at apply time still hashes to the stored checksum **and** equals the file after CRLF→LF; any other change is rejected. Applied history untouched | `migration-integrity.test` (match, CRLF/LF both ways, edited SQL, altered record, missing record); `migration-history.test` (all 31 applied files in LF and CRLF form; an edited copy is rejected); fresh clone with Windows defaults: 4 exact, 27 line-endings, 0 rejected, 7 pending | — |

## Results (this branch, 21/10/2026)

| Check | Result |
|---|---|
| `npm ci`-equivalent install, `npm run lint`, `npm run typecheck` | Pass |
| `npm test` (unit: money, phone, dates, pagination, search, refresh scopes, Edge Function validation incl. session revocation and origins) | 26/26 pass |
| `npm run build` + bundle secret check | Pass; `dist/_headers` generated |
| `npx playwright test -c playwright.smoke.config.mjs` (built app, production headers) | 1/1 pass, no CSP violation |
| `npm run test:db` (all seven migrations staged in rolled-back transactions, plus `api-integration` and `pagination-live`) | 19/19 pass |
| `npx playwright test` (28 tests, latest full run) | **23 passed** · **4 ended at migration guards** · **1 skipped at its migration guard**. These 5 blocked workflows require pending migrations: `quick-catalog`, `expenses`, audit «catalog forms», remediation «once-per-patient offer, commission privacy and server report totals», and remediation «one permanent code …». Guards run before test writes. Two intermittent timeouts in the preceding run passed on this full rerun without code changes. Playwright exits nonzero because the four migration-gated checks are reported as failures; this suite is not fully green until migrations are applied and all 28 pass. |

### Loading, same data, alternating old/new runs (median of 3, local dev server → live project)

| Path | Before (`d022fc0`) | After (this branch, pre-migration) |
|---|---|---|
| Cold login → Today | 44 requests / 174 KB | 46 / 185 KB |
| Full reload / deep link | 43 / 172 KB | 45 / 183 KB |
| 11 sidebar clicks (total) | 0 requests | 2 (Reports totals) |
| Refresh button | 41 / 170 KB | 43 / 181 KB |
| **Save → refresh** | **42 / 171 KB** | **25 / 140 KB** |

Timings varied more between runs than between versions (cold login 2.4–4.5 s), so no speed claim is made. The two extra requests on cold login and reload are the pre-migration fallback (commission-terms call returns 404, then a legacy query); after migration 100100 one remains.

## Pending migrations (apply in this order)

| File | Effect | Old frontend after it |
|---|---|---|
| `20261021100000_test_batch_catalog_expenses` | `demo_batch_id` on specialties, services, expenses | Compatible |
| `20261021100100_commission_visibility` | Column privileges hide commission; `clinic_commission_terms()` | **Breaks** (old app selects `*` and aborts the load) |
| `20261021100200_offer_patient_limit` | `once_per_patient`, partial unique index, offer errors, dispatcher | Compatible |
| `20261021100300_shared_phone_confirmation` | `PHONE_EXISTS` trigger; confirmation flag in both entry points | Old app cannot confirm a shared number |
| `20261021100400_session_revocation` | Role helpers require a live session; `clinic_revoke_user_sessions` | Compatible |
| `20261021100500_report_summary` | `clinic_report_summary()` | Compatible |
| `20261021100600_permanent_patient_code` | Backfill + sequence + immutability; `patient_specialties`; legacy codes frozen | Old app shows no code for new patients |
| `20261119100000_payment_excess` | `payments.excess_minor`; payment above the remaining balance is applied up to the balance, the rest is extra revenue; refund repeats it; report line | Compatible (old app never sends more than the remaining) |
| `20261119100100_appointment_time_slots` | Unique active booking per doctor per minute; stops if existing duplicates are found | Compatible (a clash shows the generic duplicate message) |
| `20261119100200_doctor_working_hours` | `doctors.working_hours`; out-of-hours/day-off booking needs `confirm_outside_hours` and is audited; patches `private.command` in place | Old app cannot confirm, so it cannot book outside a doctor's days (as before) |
| `20261119100300_payer_service_prices` | `payer_service_prices`, owner RPC, price applied on covered visit lines | Compatible (no payer prices until the owner sets them) |

Combined review: no migration updates or deletes a payment, allocation, invoice, settlement, visit line or price; the only data change is the one-time code backfill on `patients` and the membership copy. All seven were staged together under every database test. Doctor access is unchanged or narrower.

## Cleanup

- 63 fixture ledgers today, all clean: 16 temporary logins deleted, 0 retained; 73 test batches archived (financial history retained, hidden) and 2 empty batches deleted.
- Live check after the final run: 0 open batches; 0 active test patients, doctors, payers or offers; 3 profiles and 3 Auth users (owner, reception, doctor), as before.
- Real data: the patient count rose from 2 to 3 during the session from a registration by the real reception account at 11:13 Cairo time (not a test). No real record was changed or removed.
- **Retained immutable test records** (cannot be deleted; hidden after migration 100000 when tagged):
  - test expense `1c19f068-817f-4cbe-add4-82c70d9e402c` (200.01 جنيه), voided by the owner's audited void after an interrupted test; listed as «ملغى» until tagged;
  - test specialty `e8c5f64d-2e10-454c-ad58-99e7b1c4e03b` and service `4d222a7b-6dd3-4af1-8246-73b9fc279661` (immutable prices, from the 20/10 audit), inactive;
  - archived test batches and their receipts, settlements, rent and audit rows (by design).
- After migration 100000: tag the three rows above into a new archived test batch (exact IDs) so they disappear from normal screens.

## Test commands

| Command | Needs | Writes |
|---|---|---|
| `npm test` | nothing | nothing |
| `npm run test:db` | `FAMILY_CARE_TEST_TARGET=xkbyxefvzlcnyefkxwsx`, `FAMILY_CARE_ALLOW_PRODUCTION_FIXTURES=tracked-cleanup`, `.env`, Supabase CLI login | rolled back, except `api-integration` (ledger) |
| `npx playwright test` | same opt-in | ledger fixtures, checked teardown |
| `npx playwright test -c playwright.smoke.config.mjs` | `npm run build` | nothing |
| `npm run measure:loading` | same opt-in | one ledger patient |
| `npm run fixtures:cleanup -- <ledger>` | same opt-in | finishes an interrupted teardown |

## CI

`.github/workflows/cloudflare-pages.yml`: **quality** (install from lockfile, lint, typecheck, unit tests, build + bundle check, artifact) → **browser-smoke** (built artifact with production headers) → **deploy** (`main` only, deploys the tested artifact). CI has no database or owner credentials, so `test:db` and the browser E2E suite run locally only. There is no full E2E gate in CI.

## Release plan (needs owner approval — nothing below has been done)

Order matters: the new frontend works on the old, every intermediate and the final schema (R1; every pre-migration browser run above used it), while migration 100100 breaks the old frontend.

1. **Frontend (any time):** merge `codex/qa-remediation` into `main` → CI quality + smoke → Cloudflare deploy. Check that production serves the new bundle (asset name changes) and that owner, reception and doctor can log in. Before step 3 the new release-only controls stay hidden and Reports shows «—» for doctor share; everything else works as today.
2. **Maintenance window:** outside clinic hours. Tell staff beforehand; every open tab must be reloaded (or closed) after step 1, because a tab still running the old bundle stops loading data after 100100. Note the time of the last real receipt so the post-release check can compare totals.
3. **Migrations:** `npm run migrate` from a clean checkout of the merged commit (C1 makes CRLF/LF checkouts equivalent). Each file runs in its own transaction and ends with `notify pgrst,'reload schema'`; a failure rolls back that file and stops. Between a file and PostgREST's cache reload (normally seconds) the new frontend can see a column or function as missing: it then hides the feature or shows «—» and blocks doctor/percentage editing — it never writes a guessed value. If a screen still shows «—» a minute later, run `notify pgrst,'reload schema'` once more.
4. **Edge Functions:** deploy `manage-users` (needs 100400) and `experience-feedback`; set `EXPERIENCE_ALLOWED_ORIGINS` only if local browser tests must open the survey.
5. **Tag retained test rows** (three exact IDs above) into an archived test batch.
6. **Verify:** `npm run test:db`; `npx playwright test` — the 5 BLOCKED tests must pass before they are counted; `npm run measure:loading`; reception/doctor/owner check on production (doctor percentage visible to owner and that doctor only, patient codes FC-…, once-per-patient offer).

Recovery (forward only; no data is deleted and no broad privilege is re-granted):
- Frontend deploy fails → Cloudflare keeps serving the previous deployment; stop before step 3 (the old frontend and old schema still match).
- A migration fails → that file rolls back by itself and later files are not applied. The new frontend works on that intermediate state (tested for every prefix). Fix forward with a new migration in a later window.
- An old frontend is still open after 100100 → reload the tab; if the new frontend was never deployed, deploy it (or promote it in Cloudflare) rather than re-granting `select` on `doctors`, `visit_lines` and `payment_allocations`, which would expose doctor percentages to reception again. If neither is possible, desk work pauses until the deploy succeeds.
- Edge Function deploy fails → the previous version stays active; deactivation still blocks data access through the profile even without session revocation.
- The PostgREST cache is stale → `notify pgrst,'reload schema'`; no data is affected while it is stale (reads of a missing function fail closed).
