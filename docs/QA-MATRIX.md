# Family Care QA matrix — 20/10/2026

Build under test: `main` @ `40cdea1`. Production `https://family-care-4le.pages.dev` serves the identical build (`index-BxEIFQO0.js` and every lazy chunk hash match a local build of `40cdea1`). Database: Supabase `xkbyxefvzlcnyefkxwsx` (family care, org `peter`), the only project touched.

Environments: **L** = local Vite dev server (127.0.0.1:3002) against the live project · **P** = production site · **DB-RB** = SQL inside a transaction that is rolled back (nothing persists) · **DB-RO** = read-only transaction · **STATIC** = code/config review.

Evidence paths are local and gitignored (they can contain clinic data): `scratch/qa-2026-10-20/evidence/`, `scratch/qa-2026-10-20/e2e-run.log`, `test-results/`, `output/playwright/regression/`. Test fixtures use synthetic `QA`/`تجريبي` records in demo batches, archived afterwards by exact ID.

Status: PASS / FAIL / BLOCKED / NOT TESTED / PARTIAL. "Stale test" = the existing spec fails because it no longer matches deliberate product changes; the product behaviour itself was verified separately.

## Authentication, sessions, route protection

| ID | Role · Env | Preconditions | Steps | Expected | Actual | Status | Evidence |
|---|---|---|---|---|---|---|---|
| A-01 | Visitor · L | Logged out | Open `/`, `/reports`, `/patients` | Login screen only | Login screen; no data requests succeed | PASS | login.e2e, audit-ui CSV test, ui-audit T2 |
| A-02 | Visitor · L | — | Wrong email/password | Arabic error, stay on login | «غير صحيحة» alert | PASS | audit-ui CSV test |
| A-03 | All · L | — | Login at 1366, 1024, 390, 320 px; show/hide password | Usable, no horizontal scroll | No overflow; toggle switches type | PASS | login.e2e |
| A-04 | Owner/Reception · L | Logged in | Logout, browser Back, reload, open `/patients` | Login screen each time | Login screen | PASS | ui-audit T2, audit-ui |
| A-05 | Doctor · L | Logged in | Corrupt stored session (expired, invalid tokens), reload | Return to login, no stale data | Login screen | PASS | ui-audit T3 (`expired_session_returns_to_login`) |
| A-06 | All · L | Logged in | Reload any page | Session kept | Kept | PASS | all specs reload pages |
| A-07 | Doctor · DB/API | Doctor session | `auth.updateUser({data:{role:'owner'}})`, refresh, read payments | Still denied (roles come from `profiles`) | 0 payments | PASS | ui-audit T3; `private.current_role()` reads `profiles` only |
| A-08 | Owner · L | — | Login → Today | Today visible quickly | 1 of ~8 owner logins stalled >15 s on «جارٍ فتح العيادة…»; retry fine; not reproduced | PARTIAL | baseline first attempt `results/` |
| A-09 | Any · STATIC | — | Revoked session on writes | `require_role` rejects missing session | Writes check `auth.sessions`; reads rely on JWT expiry | PASS (Low note) | `private.require_role` |

## Accounts and roles

| ID | Role · Env | Preconditions | Steps | Expected | Actual | Status | Evidence |
|---|---|---|---|---|---|---|---|
| U-01 | Owner · L | Settings › الحسابات | New reception account with 6-char password | Blocked before submit | Browser validation blocks; no Auth user created | PASS | ui-audit T1 |
| U-02 | Owner · L | — | Create reception account (email+12+ password) | Account listed «نشط» | Created and listed | PASS | ui-audit T1 |
| U-03 | Owner · L | U-02 | Same email in upper case | Clear refusal, no second account | «البريد مسجل بالفعل. افتح الحساب الموجود من جدول الحسابات.» | PASS | ui-audit T1 |
| U-04 | Owner · L | — | New doctor account with specialty DEN, 33.33 % | Profile + doctor in one step | role doctor, `default_share_bps` 3333, specialty DEN, active | PASS | ui-audit T1 |
| U-05 | Owner · DB-RB | — | Doctor account with inactive specialty / missing Auth user / duplicate | Rejected, no orphan doctor | SPECIALTY_INACTIVE, FK error, ACCOUNT_EXISTS; counts unchanged | PASS | doctor-account.test |
| U-06 | Owner · STATIC/unit | — | Auth/profile failure paths in `manage-users` | Actionable codes; Auth user deleted on profile failure | EMAIL_EXISTS, WEAK_PASSWORD, INVALID_EMAIL, DOCTOR_ALREADY_LINKED…; cleanup verified | PASS | edge-validation.test, account-errors.test |
| U-07 | Reception · API | Reception session | Invoke `manage-users` list | 403 | 403 | PASS | ui-audit T2 |
| U-08 | Owner · L | Accounts at 390 px | View table | Usable | Horizontal-scroll table with hint; no page overflow | PASS | evidence/accounts-phone.png |
| U-09 | Owner · DB-RB | — | Deactivate user | Inactive profile loses all data access | `current_role()` null → RLS empty; Auth user not banned | PASS (Low note) | database role functions |

## Role isolation (RLS, RPC, UI guards)

| ID | Role · Env | Steps | Expected | Actual | Status | Evidence |
|---|---|---|---|---|---|---|
| R-01 | Reception · L | Sidebar | Today, Clients, Follow-ups, Doctor schedules, Catalog, Offers & messages, Expenses | Exactly these 7 | PASS | ui-audit `reception_nav` |
| R-02 | Reception · L | Open `/reports /settings /insurance /experience /doctors` | Redirect to `/` | Redirected | PASS | ui-audit T2 |
| R-03 | Reception · API | Read settlements, invoices, audit log, rent, demo batches, feedback, share revisions | Nothing | 0 rows each | PASS | ui-audit `reception_owner_tables`, rollback-audit |
| R-04 | Reception · DB-RB | Refund, insurer edit, doctor %/service %, statement, settle, offer create, run jobs, void paid visit | ACCESS_DENIED | ACCESS_DENIED for all | PASS | rollback-audit |
| R-05 | Reception · DB-RB | Patient, visit, service, payment | Allowed; `recorded_by` = receptionist | Allowed; recorded_by correct | PASS | rollback-audit |
| R-06 | Reception · API | Direct table update | Denied | 42501 | PASS | ui-audit |
| R-07 | Reception · API | Read doctors' commission terms | Owner-only (as per-service terms are) | Visible: `doctors.default_share_bps`, `visit_lines.doctor_share_bps`, `payment_allocations.doctor_share_minor` | FAIL (Medium, needs owner decision) | rollback-audit `reception_reads`, ui-audit |
| R-08 | Doctor · L | Sidebar / owner routes | Own area only | Today, Clients, Follow-ups, Catalog, حسابي; 7 routes redirect | PASS | ui-audit T3, roles.e2e |
| R-09 | Doctor · API/DB-RB | Payments, visits, payers, expenses, offers, outbox, audit, other doctors' lines/statement; payment/line/patient writes | Denied / empty | 0 rows; ACCESS_DENIED | PASS | ui-audit, rollback-audit |
| R-10 | Doctor · L | Own statement «عرض الحساب» | Visible | Visible | PASS | ui-audit T3, roles.e2e |
| R-11 | Visitor · API | Anonymous table/RPC access | None | No anon table grants; only `submit_experience_feedback` path via function | PASS | DB-RO grants query, clinic.e2e |
| R-12 | All · DB-RO | RLS on every public table | Enabled | 43/43 enabled; no direct INSERT/UPDATE/DELETE grants for authenticated | PASS | DB-RO policy listing |
| R-13 | Owner · L | Feedback results | Owner only | Owner reads; reception/doctor read 0; anonymous denied | PASS | clinic.e2e (survey section) |

## Reception and patients

| ID | Role · Env | Steps | Expected | Actual | Status | Evidence |
|---|---|---|---|---|---|---|
| P-01 | Owner · L | Register client+visit+service with `٠١٥٠٠٠٠٠٠١٧` | Stored `+201500000017` | `+201500000017` | PASS | ui-audit `arabic_local_phone_stored_as` |
| P-02 | Unit | Local, 10-digit, 20…, +20…, 0020…, spaces, Arabic/Persian digits, bidi marks | Normalized; malformed left for validation | All pass | PASS | phone.test |
| P-03 | Owner · L | Invalid phone «invalid» | Arabic error, nothing saved | «رقم موبايل مصري» alert; no patient | PASS | audit.e2e cash test (first part) |
| P-04 | Owner · L | Register second client with an existing phone | Duplicate warning or link to existing file | Second file created silently (2 clients, same number) | FAIL (Medium) | ui-audit `duplicate_phone_outcome` |
| P-05 | Owner · L | Edit client name, consent, notes | Persisted and shown | Persisted | PASS | audit.e2e, two-tab test |
| P-06 | Owner · L | Search by name / local phone / code (Ctrl+K) | Found | Found (`01500000017` finds `+20…`) | PASS | ui-audit, screens.e2e, search unit test |
| P-07 | Reception · L | Intake default visit date | Cairo today | `2026-10-20` | PASS | ui-audit T2 |
| P-08 | Reception · L | Change visit date across 7 days | Doctor list = DB availability for that weekday | Matched all 7 days | PASS | ui-audit `doctor_filter_by_weekday` |
| P-09 | Owner · L | Doctor not working on chosen date | Cannot book | Select disabled/filtered; server DOCTOR_UNAVAILABLE | PASS (existing spec stale) | insurance-doctor.e2e failure analysis, rollback |
| P-10 | Reception · L | Doctor schedules tab (desktop/phone) | Renders, choose specialty | Renders; no overflow | PASS | evidence/reception-*-doctor-schedules.png |
| P-11 | Owner · L | Intake with union, co-pay 20 %, paid now 60 | Atomic visit+payment; payer 240 | Exactly as expected | PASS | intake.e2e |
| P-12 | Owner · L | Multiple services + quantity + cancel before saving | Totals update; cancel removes line | 180/720 then 60/240 | PASS | intake.e2e |
| P-13 | Owner · L | Date input display format | dd/mm/yyyy | Native date input shows browser locale (mm/dd/yyyy observed) | FAIL (Low-Medium) | evidence/reception-intake-desktop.png |
| P-14 | Owner · L | Test-batch selector | Hidden unless an open test batch exists | Shown (empty) whenever any archived batch exists | FAIL (Low) | `Patients.tsx` line 57 |

## Visits, payments, invoices

| ID | Role · Env | Steps | Expected | Actual | Status | Evidence |
|---|---|---|---|---|---|---|
| V-01 | Owner · L | Payment 301 on a 300 visit | Refused, nothing written | Alert; 0 payments | PASS | audit.e2e |
| V-02 | Owner · L | Partial 100 → remaining 200 on visit, client file, Today | Consistent | Consistent after reload | PASS | audit.e2e |
| V-03 | Owner · L | Double-click «تسجيل وطباعة الإيصال» | One receipt | 1 receipt, `recorded_by` owner | PASS | ui-audit `double_click_payment_rows` |
| V-04 | Owner · L | Server commits payment, response lost; retry same dialog | One receipt | Error shown, retry → exactly one 50 جنيه receipt | PASS | ui-audit `lost_response_retry_payment_rows` |
| V-05 | Owner · DB-RB | Retry same key / changed amount same key | Same receipt / IDEMPOTENCY_CONFLICT | As expected | PASS | rollback-audit |
| V-06 | Owner · L | Refresh, collect exact remainder, print | Remaining 0; printable receipt | 3 receipts total; PDF printed | PASS | ui-audit, evidence/receipt-print.pdf |
| V-07 | Owner · L | Extra service after partial payment; reprint invoice | Old line/receipt unchanged; new total | Unchanged; total doubled; invoice printable | PASS | visit-additions.e2e |
| V-08 | Owner · DB-RB | Refund, retry, second refund | One reversal, net 0, original immutable | 1 refund row; net 0; UPDATE/DELETE → LEDGER_IMMUTABLE | PASS | rollback-audit-2 |
| V-09 | Owner · L | Cancel unpaid visit | Status ملغاة; outstanding 0 everywhere; snapshots kept | As expected | PASS | audit.e2e void test |
| V-10 | Owner · L | Complete visit (diagnosis) | مكتملة; survey queued (mock) | As expected | PASS | clinic.e2e, ui-audit |
| V-11 | Owner · DB-RB | Bundle with gift; deposit gate; home fee | Gift 0; arrival blocked until deposit; home fee once | 2198 = 599+1599; DEPOSIT_REQUIRED then confirmed; HOME_FEE_ONCE | PASS | rollback-audit-2 |
| V-12 | Owner · L | Billing locked after payment where applicable | BILLING_LOCKED for direct line add | Covered only by blocked database.test | NOT TESTED | — |

## Follow-ups

| ID | Role · Env | Steps | Expected | Actual | Status | Evidence |
|---|---|---|---|---|---|---|
| F-01 | Owner · L | Continuation of an open account; remaining printed; collect before entry | Not charged twice; admission after full payment | As expected | PASS | followup-plans.e2e |
| F-02 | Owner · L | Separately priced follow-up (200) | New billing visit, collected 70+130, admitted | As expected | PASS | followup-plans.e2e |
| F-03 | Owner · L | Paid follow-up as new service; insured 20.5 % | `co_pay_bps` 2050 | 2050 | PASS | visit-additions.e2e |
| F-04 | Owner · L | Future year follow-up not overdue | Not «متأخرة» | Not overdue | PASS | followup-plans.e2e, followup unit test |
| F-05 | Owner · L | Reschedule keeps predecessor + one successor on Today and file | As expected | As expected | PASS (spec then stale at «تمت») | audit.e2e reschedule (failed only at removed button) |
| F-06 | Owner · DB-RB | Reschedule twice | Chain, revisions 1→2→3 | As expected | PASS | rollback-audit-2 |
| F-07 | Owner · DB-RB | Follow-up dated yesterday | Rejected or warned | Accepted | FAIL (Low) | rollback-audit-2 `followup_past_date` |
| F-08 | Owner · L | Mark done without visit («تمت») | — | Button removed by design in `902cc6c`; flow is open → admit → «إنهاء المتابعة» | Stale test | clinic.e2e, audit.e2e |

## Insurance and unions

| ID | Role · Env | Steps | Expected | Actual | Status | Evidence |
|---|---|---|---|---|---|---|
| I-01 | Owner · DB-RB | Co-pay 33.33 %, 0.5 %, 20.5 % on 1999 جنيه | Patient share half-up; payer = total − patient; line sums equal visit | 66627/133273, 1000/198900, 40980/158920; line sums equal | PASS | rollback-audit |
| I-02 | Owner · DB-RB | Edit payer after visits | Visit terms unchanged | `co_pay_bps` snapshots unchanged | PASS | rollback-audit |
| I-03 | Owner · L | Payer account, pending share, service name, settle 120 | Balance and allocation exact | 240 pending; 12000 allocated | PASS | clinic.e2e (settlement section) |
| I-04 | Owner · DB-RB | Over-settle; retry; reverse; reverse again; settle full | Refused; same id; net 0; no double reversal; 240 | As expected | PASS | rollback-audit, rollback-audit-2 |
| I-05 | Owner · L | Payer screen at 390 px | Usable | Not reached (spec stale before this step) | NOT TESTED this run | insurance-doctor.e2e |
| I-06 | Owner · L | Union create, use, deactivate, archived hidden from intake | As expected | As expected | PASS | intake.e2e, archive.e2e |

## Doctor earnings

| ID | Role · Env | Steps | Expected (independent) | Actual | Status | Evidence |
|---|---|---|---|---|---|---|
| D-01 | Owner · DB-RB | Completed 1999 جنيه at 33.33 %, 0 %, 100 %, 0.5 % with no receipts | 66627, 0, 199900, 1000 | Same | PASS | rollback-audit |
| D-02 | Owner · DB-RB | Open visit / after receipt | 0 before completion; unchanged by receipt | Same | PASS | rollback-audit |
| D-03 | Owner · DB-RB | Change default 33.33 → 50 % after completion & receipt | Audited revision +33323; line snapshot and receipt untouched; statement 99950 | Same (owner decision 19/10/2026) | PASS | rollback-audit `revision_A` |
| D-04 | Owner · DB-RB | Service-specific 100 % overrides default 0 % | 199900 | Same | PASS | rollback-audit |
| D-05 | Owner · L | Statement in UI vs independent half-up | 99.99 جنيه | 99.99 جنيه | PASS | ui-audit `statement_vs_independent` |
| D-06 | Owner · L/DB-RO | Reports «نصيب الأطباء المستحق» vs independent SQL with revisions | 639999 during run; 630000 real data | Same | PASS (audit.e2e oracle stale: ignores revisions) | DB-RO calculation |
| D-07 | Owner · DB-RB | Rent 100.01 monthly, pay 50 twice same key | One payment; due 10001, paid 5000 | Same | PASS | rollback-audit-2 |
| D-08 | Owner · L | Statement period change hides stale data | Cleared, refetch required | As expected | PASS | audit.e2e |

## Administration, reports, exports

| ID | Role · Env | Steps | Expected | Actual | Status | Evidence |
|---|---|---|---|---|---|---|
| X-01 | Owner · L | Quick specialty + priced service 123.45 | All 5 lists 12345 | As expected | PASS | quick-catalog.e2e |
| X-02 | Owner · L | Specialty presets do not register unavailable specialties | Count unchanged | Unchanged | PASS | specialty-presets.e2e |
| X-03 | Owner · DB-RB | Archive/restore guards for catalog and bundles | Guarded | Pass | PASS | catalog-archive.test |
| X-04 | Owner · L | Specialty prefix field (manual) | — | Behind «تخصيص الكود والترتيب» by design | Stale test | audit.e2e catalog test |
| X-05 | Owner · L | Publish a new price version | New charges use it, old lines unchanged | Not executed (immutable versions in production) | BLOCKED | — |
| X-06 | Owner · DB-RB | Expenses: retry, conflict, zero/future, reception isolation, void | As expected | Pass | PASS | expenses.test |
| X-07 | Owner · L | Expense UI save/void | — | Not executed (would leave a visible voided test expense in the empty live ledger) | BLOCKED | — |
| X-08 | Owner · L | Reports totals before/after QA run | Unchanged by archived tests | Identical (3,300 / 0 / 0 / 6,300 / 0) | PASS | evidence/baseline-*.json |
| X-09 | Owner · L | Reports audit log after QA | Archived test operations hidden | 15 archived-test audit rows visible (follow-ups, services, profiles, removed lines) | FAIL (Low; page warns) | baseline diff |
| X-10 | Owner · L | CSV export | Receipts with recorder column | 3 rows for test patient; `سجّل_التحصيل` column | PASS | ui-audit, audit-ui |
| X-11 | Owner · L | Print report / receipts | Print layout | Receipt and invoice PDFs render | PASS | followup-plans, visit-additions, ui-audit |
| X-12 | Owner · L | Owner screens at 1366 and 390; tablet 768, 1920, 320 | No overflow | 10 screens pass (screens.e2e); audit-ui flagged 1 unlabeled input on `/patients` once, not reproduced at 768/1920/320 | PARTIAL | screens.e2e, ui-audit `patients_unlabeled_inputs` |
| X-13 | Owner · L | Catalog tabs keyboard (RTL arrows, Home/End); dialog focus return | As expected | As expected | PASS | audit-ui, audit.e2e |
| X-14 | Owner · L | Failed read shows error, retry recovers | As expected | As expected | PASS | audit.e2e |

## Offers and messaging

| ID | Role · Env | Steps | Expected | Actual | Status | Evidence |
|---|---|---|---|---|---|---|
| M-01 | Owner · DB-RB | 12.5 % offer on 1999 جنيه | Discount half-up 24988; total 174912 | Same; redemption 24988 | PASS | rollback-audit |
| M-02 | Owner · DB-RB | Apply twice / expired / inactive | Refused | OFFER_ALREADY_APPLIED, OFFER_EXPIRED; inactive returns raw «query returned no rows» | PASS (Low: raw error text) | rollback-audit |
| M-03 | Owner · DB-RB | Same code, same patient, second visit | Business rule | Accepted (no per-patient limit; `max_redemptions` empty) | NEEDS OWNER DECISION | rollback-audit |
| M-04 | Owner · DB-RB | Campaign preview/send; retry same key; stale preview | Consenting only; one campaign; stale refused | 1 recipient; opted-out excluded; same id; PREVIEW_CHANGED | PASS | rollback-audit |
| M-05 | Owner · DB-RB | Jobs twice: follow-up reminder, birthday | One message each; opted-out skipped | simulated:1; opted-out «skipped»; birthday 1/0; one attempt per message | PASS | rollback-audit |
| M-06 | Owner · L | Offer UI create, mock campaign send, reminders button | Mock log only | As expected | PASS | clinic.e2e (offer/campaign section) |
| M-07 | STATIC | External providers | None | No WhatsApp/SMS/email integration in `src/` or functions; outbox statuses simulated/skipped only | PASS (WhatsApp not implemented) | grep |
| M-08 | Visitor · L | Public survey one-time link | Submit once; repeat shows received | As expected | PASS | clinic.e2e |

## Platform, security, performance

| ID | Env | Check | Result | Status | Evidence |
|---|---|---|---|---|---|
| S-01 | P/L | Secrets in browser bundle | Only publishable key; `sb_secret_` hit is supabase-js prefix check | PASS | prod bundle scan, verify-bundle |
| S-02 | DB-RO | Supabase advisors | 0 ERROR; 3 WARN (intended SECURITY DEFINER intake/union RPCs); leaked-password protection off; 22 unindexed FKs | PARTIAL | advisors.mjs output |
| S-03 | STATIC | Edge Functions | Owner check from DB; input validation; survey origin allowlist includes localhost in production | PASS (Low note) | function sources |
| S-04 | P | Response headers | `nosniff`, referrer policy; no CSP / frame-ancestors | PARTIAL (Low) | curl -I |
| S-05 | P vs L | Same owner-visible data | 0 differences across 11 screens + all-time report | PASS | baseline-prod vs baseline-local-final |
| S-06 | P/L | Load and navigation | Login→Today 8.8 s P / 4.6 s L; `/specialties` 10.1 s P; ≈560 requests, ≈640 KB per walk; slow (>1 s) table reads on P | FAIL (Medium) | evidence/timing-*.json |
| S-07 | STATIC | Paginated full-table loads | `.range()` without `order()` | Risk of skipped/duplicated rows beyond 1000 rows/table | FAIL (Medium, latent) | `src/clinic/api.ts:63` |
| S-08 | STATIC | CI gate | Build + deploy only; no lint/typecheck/tests | FAIL (Medium) | `.github/workflows/cloudflare-pages.yml` |

## Automated suites

| Command | Env | Result | Status |
|---|---|---|---|
| `npm ci` (fresh clone) | L | Clean install from lockfile | PASS |
| `npm run lint` | L | 0 problems | PASS |
| `npm run typecheck` | L | 0 errors | PASS |
| `npm run build` (+ bundle verify) | L | Built; no server credentials in bundle | PASS |
| `npm test` without `.env` (clean clone) | L | 24/26; 2 need `.env` | — |
| `node --test tests/doctor-account.test.mjs` with `.env` | DB-RB | Pass; temporary Auth user deleted | PASS |
| `tests/database.test.mjs` | — | Not run: posts permanent payments/settlements/campaigns, runs jobs globally at future dates, leaves Auth users | BLOCKED |
| Other DB unit tests (expenses, quick service, catalog archive, share revisions, availability, visit additions, follow-up plans) | DB-RB | Pass | PASS |
| `npx playwright test` (all except expenses) | L | 16 pass, 6 fail (5 stale specs + 1 unreproduced label check) | FAIL |
| `scratch/qa-2026-10-20/rollback-audit*.test.mjs` | DB-RB | 2/2 pass | PASS |
| `scratch/qa-2026-10-20/ui-audit.qa.spec.mjs` | L | 4/4 pass | PASS |
| Fresh migrate/seed on an isolated database | — | No Docker / local Supabase on this machine; live reset forbidden | BLOCKED |
