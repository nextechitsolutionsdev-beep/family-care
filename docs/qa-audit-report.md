# Clinic QA audit — 13 October 2026

## Scope and baseline

Existing architecture and business rules are retained. Initial Git working tree was clean. Target verified read-only: `xkbyxefvzlcnyefkxwsx`, `family care`, organization `peter` (`pmltjypbnnmrtggkwqwx`). Initial aggregate counts: zero patients, zero active doctors, one active profile. Existing PLAN records prior database authorization. No provisioning, deployment, deletion, reset or migration application is part of the baseline.

## System inventory and prioritized plan

React 18 / TypeScript / Vite 7; npm lockfile. React Router routes below. Supabase Auth, PostgREST and PostgreSQL transactional RPCs; two Deno Edge Functions. Custom Arabic RTL CSS, native dialogs and reusable forms/tables; no UI kit. Three profile roles: owner, reception, doctor. Database is authoritative; ClinicProvider reads role-permitted tables, reloads after writes and on explicit refresh. Automatic multi-tab realtime is not implemented or documented as a requirement.

| Module/routes | Roles | Operations / authoritative entities | Existing coverage |
|---|---|---|---|
| Login, protected shell | All authorized staff | Auth + active profiles; role guards | login, roles, database |
| Today `/`, `/appointments`, `/doctor-portal` | All, doctor scoped | appointments/status, visits, follow_ups, payments | clinic, roles |
| Clients `/patients`, `/patients/:id` | owner/reception write; doctor scoped read | clinic_patient_intake, patient_save; patients, consent_events, patient_specialty_codes | intake, clinic, database |
| Visit `/visits/:id` | staff; money restricted server-side | clinic_visit_intake, clinic_command: lines, offers, receipts/reversals, clinical completion, follow-ups; visits, visit_lines, allocations | clinic, intake, insurance-doctor, database |
| Follow-ups `/follow-ups` | staff scoped | follow_up_save/status, rescheduling/revisions, jobs | clinic, database |
| Catalog `/specialties` | staff read; owner write | specialties, services, bundles, effective prices | screens, database; UI CRUD gaps |
| Doctors `/doctors` | owner, own doctor | doctors, doctor_service_terms, doctor_statement, rent contracts/dues/payments | roles, insurance-doctor, database |
| Payers `/insurance` | owner | insurers/unions, pending visit shares, issued invoices, settlements/reversals | intake, insurance-doctor, clinic, database |
| Offers/messages `/messages` | owner/reception; owner edits/jobs | offers, campaigns, consent, outbox/attempts, mock dispatch | clinic, database |
| Feedback `/experience`, public `#experience/:token` | owner results; anonymous one-time response | experience-feedback function, private invitation hashes, experience_feedback | clinic, database |
| Reports `/reports` | owner | real receipts/refunds, settlements, rents, completed doctor entitlement, audit_log; CSV/print | screens; cross-view assertion gaps |
| Expenses `/expenses` (added concurrently) | owner all; reception own | clinic_expense; expenses and audited cancellation; report deductions | separate change `6af2ae0`; its existing browser/database tests included in final regression, deeper inventory/propagation review not completed here |
| Settings `/settings` | owner | prices, templates, clinic settings, profiles; manage-users function | screens, database; UI CRUD gaps |

No dedicated prescriptions, laboratory module or file uploads discovered. Clinical notes are visit diagnosis/instructions. Messages are mock database logs only. GitHub Actions builds and publishes to Cloudflare Pages; it does not execute the database/browser regression suite.

Concurrent workspace change: the Expenses feature and its forward migration were implemented/applied/committed by a separate task during final validation (`6af2ae0`). This audit did not author or apply that migration. Earlier 18-checksum and ten-page observations describe the baseline before this addition; expense-specific implementation evidence is in `docs/expenses.md`. Concurrent Playwright output cleanup caused a trace ENOENT, and another test stopped at login before catalog assertions: that shared run ended 16 PASS / 2 FAIL. A copied production build on port 3003 then ran 18 PASS / 1 FAIL: the public survey was blocked by the correctly restrictive origin policy. The corrected isolated runner uses the already allowed port 3001 and a separate output directory through `scratch/qa-final.config.mjs`, without retries or relaxed assertions. No function CORS changes were made.

Priority: (1) transaction/role/payment baseline, (2) actual intake→visit→client→today→payer→doctor→report propagation, (3) failed writes/retries and direct unauthorized calls, (4) all routes and critical dialogs at desk/phone/tablet/desktop, keyboard/accessibility, (5) measured network/bundle observations. Add regression tests for verified defects and run the complete final suite.

## Cross-module consistency matrix

| Entity/source | Writes | Dependent views / expected propagation | Result |
|---|---|---|---|
| patients + codes + consent_events | intake/edit | client list/detail, global search, Today, visit, follow-ups, consent-aware jobs; after mutation refresh / reload | PASS: real UI create/edit, direct DB comparison, code visibility, rejected invalid phone leaves no patient; explicit two-tab refresh and reload agree |
| visits + appointments + visit_lines | booking, service changes, completion/void | Today, client balances, visit, payers, doctor entitlement, reports; exact price/term snapshots | PASS: original intake/payer journeys, cash journey, persisted void status with retained price snapshots and corrected zero balances in all three desk views |
| payments + payment_allocations | receipt/retry/refund | visit, client, Today, reports; exact net sums and one idempotent receipt | PASS: UI 300 charge → 100 receipt → 200 remaining; DB exactly one receipt; 301 rejected without writes; refund → net zero; database retry/concurrency tests |
| invoices + settlements + allocations | completion, settlement/reversal | payers, visit, reports; open share becomes issued debt; paid debt decreases | PASS: original real payer E2E + database exact splits, atomic intake and settlement allocation/reversal. No realtime promise |
| doctor terms + completed lines | term edit/completion | service snapshots, doctor statement, financial reports; entitlement independent of collections | PASS: 33.33% of 300 = 99.99 due despite collecting 100; API statement compared with UI; report compared against SQL sum of completed line shares |
| follow_ups + revisions + outbox | create/reschedule/status/jobs | Today, client, follow-ups, mock logs; consent and unique jobs enforced | PASS: UI reschedule retains predecessor, one scheduled successor and incremented revision; Today/client agree; done removes pending reminder; existing jobs/consent tests |
| prices + versions | publish | new charges use effective version; old lines unchanged | PASS: existing immutable-price/offer/insurance database and browser tests; catalog create/edit checked; new price publication through UI NOT TESTED in this audit |
| invitations + feedback | completion/public submit | one-time public confirmation; owner-only feedback; no patient identity | PASS: real anonymous survey submission/reload rejects repeats; owner can read; reception/doctor/anonymous cannot; demo feedback hidden from owner screen |

## Test execution ledger

| Command/check | Result |
|---|---|
| `git status --short`, `rg --files` | PASS: clean baseline, repository mapped |
| Read-only project and aggregate count preflight | PASS: authorized target, no patient records |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm run build` | PASS; JS 510.61 kB / gzip 145.20 kB, CSS 18.71 kB / gzip 4.79 kB; Vite chunk-size advisory |
| `npm test` baseline | PASS: 16 tests, zero failures/skips |
| `npm run test:e2e` baseline | BLOCKED: six runner failures before browser launch; matching Chromium headless executable absent, no app assertions ran |
| `npx playwright install chromium` | PASS: matching browser installed; no npm dependency added |

Supabase/Postgres, token-saver and Playwright skills read. `web-design-guidelines` unavailable; use existing design system and actual browser checks. User explicitly requests automated test additions, so reuse existing @playwright/test infrastructure. Current Supabase changelog and RLS docs fetched; upcoming legacy TLS-cipher removal does not require an app change.

## Confirmed defects, UI review, changes and readiness

### Confirmed during investigation

- **High — void visit balances:** Create an unpaid 300 جنيه visit, void it through the owner UI, then inspect the visit summary. The database retains `status=void`, `co_pay_minor=30000`, `total_minor=30000` as historical snapshots; the UI incorrectly shows 300 جنيه outstanding. Client aggregate totals already exclude void visits. Root cause: remaining-balance rendering subtracts receipts from the historical co-pay without considering status. Regression failed on actual persisted synthetic data; investigate all three dependent desk views.
- **Medium — unnamed dialogs:** Open Clients → client only. The dialog displays its heading but `getByRole('dialog', {name:'عميل جديد'})` finds nothing. Root cause: the shared native dialog has no `aria-labelledby`/accessible name. Regression failed; keyboard focus restoration will also be verified.
- **Medium — tab keyboard interaction:** Focus the Services tab on `/specialties`, press ArrowLeft in RTL. The Specialties tab does not gain focus/selection. The custom tablist implements mouse clicks only. Regression failed; add roving tabindex and arrow/Home/End behavior.
- **Medium — malformed API body:** POST JSON `null` to `experience-feedback` using the public key and allowed local origin returns HTTP 500; `[]` and malformed JSON return 400. Actual handler regression tests reproduce null dereferences in both Edge Functions (reading `token` / `action`). Narrow object-type guards added; two handler tests now PASS over null, arrays, primitives and malformed JSON. Database/Auth clients are mocked only in these handler unit tests; deployed status tracked separately.

Original browser regression after browser installation: **6 PASS / 0 FAIL**, 2.2 minutes. Baseline audit browser run: **1 PASS / 4 FAIL**; two failures are confirmed application defects (dialog naming, void balance), two stopped at overly strict selectors before reaching app assertions. Those selectors were corrected without weakening business assertions. Read failure/retry passed. Doctor filter behavior remains unconfirmed pending corrected execution. Production dependency audit: zero reported vulnerabilities in installed production dependencies (`npm audit --omit=dev --json`), not a penetration-test guarantee.

Generated baseline screenshots copied to `output/playwright/regression-baseline/`; original tracked `docs/review` images restored. Regression screenshot paths now use `output/playwright/regression/` (ignored); no assertions removed. Additional baseline captures: `output/playwright/audit-dialog-baseline.png`, `audit-void-baseline.png`. Release readiness is not established.

### Fixes and additional evidence

| Defect | Reproduction / root cause | Fix / targeted result |
|---|---|---|
| High: voided visit falsely owes money | Unpaid 300 visit → owner void → DB status void, historical co-pay 300 retained → UI still 300 outstanding | Shared `patientRemaining` returns zero for void and is used in Visit, Patients history and Today. Real three-view/reload regression PASS |
| Medium: dialog naming and focus loss | Client-only dialog has no accessible name; Escape returns focus to body instead of opening control | React `useId` binds heading to native dialog; record opener and restore focus during cleanup; cancel default handled explicitly. Naming/Escape/focus regression PASS |
| Medium: RTL tabs lack keyboard behavior | Focus Services, ArrowLeft does not reach Specialties | Named tablist, associated panel, roving tabindex, RTL arrows plus Home/End. Regression PASS |
| Medium: tablet horizontal overflow | At 768 px, doctor statement filters force document width to 805 px; action/sidebar clipped | Allow filter bars to wrap. All ten modules interacted with at 320, 768 and 1920 px; overflow/labels/console checks PASS |
| Medium: stale doctor period statement | Load a statement, change start to 01/01/2027; old summary remains despite changed/reversed period (isolated regression found 1 summary, expected 0) | Clear statement when either date changes; disable filters during retrieval; map invalid-period error into Arabic. Regression PASS |
| Medium: malformed JSON crashes functions | Public `null` request returned 500; both actual handlers dereference null | Object guards in both functions, 12 invalid-body cases across two PASS handler tests. User explicitly approved deployment of these two guards; `npm run deploy` passed, and all 12 deployed invalid-body requests returned 400 / INVALID_INPUT |
| Medium: owned demo union leaks after archival | Create/tag a union payer to a demo batch, run batch archive, reload payer list: union still appears (expected 0 rows, actual 1) | Archive deactivates unions through explicit payer batch ownership; store hides those union IDs; intake/database tests tag their union payer ownership. Actual archive/UI/retained-record/selector regression PASS |

Baseline failures and intermediate corrections remain recorded above. One mixed rerun was affected by Vite hot reload during fixes and a SQL aggregate string/number comparison in the new test; rerun on frozen sources verified the actual financial behavior. The date defect was confirmed separately on frozen sources before its fix. A subsequent catalog test used a nonexistent `service_prices.id`; corrected to the actual composite-key field `service_id`, preserving the no-price-write assertion. An intermediate date-edit syntax error was immediately corrected and lint/typecheck rerun before further validation.

## UI/UX review by page

All ten owner pages captured and visually inspected at 1366×768 and 390×844. Additional automated interaction pass covers 320×667, 768×900 and 1920×900. Existing login also covers 1024×768. Screenshots use synthetic test records only. Native date inputs follow browser locale; rendered record dates use dd/mm/yyyy and western digits.

| Page | Findings and verified interactions |
|---|---|
| Login | Consistent brand/form hierarchy, desktop/phone proportions, labelled inputs; visibility toggle, invalid credentials, protected direct URL and logout/reload verified |
| Today | Dense queue and reminder tables, readable RTL headers, phone scroll hint/sticky actions; exact balances checked against source and corrected after void |
| Patients list/detail | Search/code/name/phone, edit, create, booking, financial summaries, notes and consent; horizontal table scrolling is intentional on phones; dialog names/focus corrected |
| Visit/receipt/intake | Actual service/quantity/bundle/discount/deposit, invalid payment, receipt, completion, follow-up and refund paths executed; scrollable phone forms; historical prices retained |
| Follow-ups | Empty and populated states, filter/reschedule/done actions, predecessor/successor history and Today/client propagation; no arbitrary reminder deletion |
| Catalog | Long service names and mobile sticky actions reviewed; keyboard tabs corrected; actual specialty/service create/edit and inactive service persistence exercised; publication intentionally does not alter existing prices |
| Doctors | Categories, schedules and service percentages in original tests; report compared with API; date state and tablet wrapping corrected; rent exercised in real database tests |
| Payers | Open visit details → invoice → settlement, insurer/union selection and balances reviewed. Wide tables stay in scroll containers; entity debt calculations verified in original E2E/database suite |
| Offers/messages | Mock-only explanation, campaign controls, consent exclusions, birthday/follow-up jobs and logs reviewed; no external messages sent |
| Feedback/survey | Owner empty state and one-time public survey reviewed at both sizes; identity absent from public form; role isolation and retry prevention verified |
| Reports | Real ledger rows, net totals and doctor entitlement; CSV downloaded and checked for headers/currency/records; no fabricated chart; date filters reviewed |
| Settings | Prices/history, phone price editor width, account password visibility and tabs reviewed; visible text inputs have labels; keyboard tabs/panel association corrected |

Native dialogs provide modal focus containment; explicit Escape/focus-return regression now covers close behavior. Automated label, heading presence, document overflow, console-error and selected keyboard checks were used; no axe dependency was installed. This is not a complete WCAG or screen-reader certification. No screenshot pixel-diff percentage is claimed: dynamic synthetic counts/dates differ, and comparison was visual plus layout assertions. Print controls exist; physical printer/PDF pagination NOT TESTED.

## Security, database and reliability observations

- Read-only live catalog: zero public tables without RLS; anonymous execute denied on privileged public functions. Authorization uses active database profiles and live session checks, not user-editable metadata. Existing tests verify cross-doctor isolation, metadata tampering, denied direct ledger writes, revoked reception access and owner-only functions.
- All 18 local migration checksums match the applied database checksums. No migration authored/applied, no schema reset, no ledger/history deletion. Financial writes and jobs are exercised against the actual authorized database, not mocked.
- React rendering has no `dangerouslySetInnerHTML` or dynamic eval in active source; no app console logging of patient data found. Browser bundle check passes; browser-facing env uses public connection settings. Auth tokens are handled by Supabase; no custom password hashing/storage added. Raw Playwright traces/error contexts may contain auth material and remain local/gitignored; they are not report attachments for sharing.
- Network outage: both Supabase main-site and project Auth probes timed out (8/10-second bounds). Corrected functional runs resumed after independent connectivity probe succeeded. These interrupted runs are BLOCKED, not evidence of an app defect.
- A database run overlapped the browser logout test and failed at `doctor_save` with `SESSION_EXPIRED` (five local tests passed, one fixture failed before its database subtests). The existing logout revokes owner sessions, and the database intentionally checks session validity. Final database/browser runs are serialized; no security behavior was weakened.
- Production `npm audit --omit=dev --json`: zero reported vulnerabilities. This scan does not establish complete supply-chain or application security. Existing CI publishes builds but does not run live DB/E2E acceptance checks.
- Current read-only `db advisors --linked --project-ref xkbyxefvzlcnyefkxwsx --type all --level info --fail-on none`: **0 ERROR, 4 WARN, 35 INFO**. Three warnings are the intentionally authenticated security-definer intake/union APIs with explicit role checks and anonymous execute revoked; fourth is disabled leaked-password protection (remaining account-hardening risk, not enabled during this audit). Five no-policy INFO tables are deliberately inaccessible private/internal tables: direct privilege checks found **0/5** readable by anon/authenticated. Fifteen unindexed-FK and fifteen unused-index INFO advisories remain; no slow-query/load evidence supports changing schema purely to remove these messages.

## Changes and remaining verification

- Frontend: shared remaining-balance helper and its three consumers; shared dialog naming/focus; Settings keyboard tabs/panel; Doctors date invalidation and disabled filters; Arabic period error; filter wrapping CSS.
- Backend: two small malformed-object validation guards. No database schema changes or packages introduced.
- Archival: existing script now deactivates explicitly demo-owned unions and the provider filters their operational view. Four older union payers created by this audit's original tests were tagged once, requiring explicit test labels plus exclusively demo-owned patient/visit relationships; no real records or ledger history were deleted.
- Tests: new browser audit workflows, responsive/keyboard/download/failed-login checks and actual Edge Function handler unit tests; `npm test` includes handler regressions. Existing screenshot paths changed only, with historical tracked images preserved. Runtime artifacts ignored.
- Documentation: this report, PLAN checklist and ASSUMPTIONS routine decisions. README already documents install/connect/migrate/seed/start, authorized target, demo archival and mock provider restrictions; fresh provisioning/reseed was not needed for this audit and was not executed.

Remaining broader risks: no production traffic/load test or >1000-row UI dataset; store loads all permitted rows and its pagination has no explicit order; no full concurrency/OCC guarantee for ordinary clinical edits; no browser-engine matrix beyond Chromium; no exhaustive maximum-length/contrast/screen-reader/print certification; price publication and every account-edit form combination were not re-executed through UI. Existing backend coverage addresses price immutability and user management but does not eliminate these gaps. Routine copied-price business assumptions remain in ASSUMPTIONS; actual messaging provider still needs owner choice/credentials.

## Completed checkpoints and production scope

- Full regression before the additional archive correction: `npm test` **18 PASS**, `npm run test:e2e` **17 PASS** (3.9 minutes), no skipped tests. Targeted archive test first FAIL (one leaked row), then PASS (17.6 seconds including real archive command). An expanded final pass includes it.
- `npm run deploy`: PASS, only the two approved Edge Functions. `node scripts/verify-function-inputs.mjs`: PASS, **12/12** actual deployed malformed-body cases across public feedback and authenticated management, all 400 with INVALID_INPUT. This reusable command does not mutate clinic records and asserts the authorized API hostname. Original valid user-management and anonymous survey workflows remain in regression.
- Pre-expenses build checkpoint: JS **511.65 kB**, gzip **145.56 kB**; CSS **18.72 kB**, gzip **4.79 kB**. Chunk advisory retained, no warning threshold suppression or speculative caching introduced. Thirty cached SPA navigations under local Vite, Chromium and synthetic QA data: **55–496 ms**, median **116 ms**, p95 **257 ms** (previous checkpoint: median 119/p95 200 ms). These are script-observed navigation timings including assertions, not cold-load measurements or production capacity claims.
- Read-only consistency SQL found **0** invalid visit totals, **0** split mismatches, **0** receipt allocation mismatches, **0** settlement allocation mismatches, and **0** negative/overpaid patient balances. No patient identity or credentials included in evidence.
- Frontend hosting was not deployed or pushed: authorization covered only the two function guards. Local frontend fixes are tested and prepared for review; hosted frontend retains its prior build until a separate frontend release.
- Expanded rerun with accumulated fixtures: **17 PASS / 1 FAIL**; insurer viewport assertion found its unique fixture below the scroll container's visible rows. Screenshot and DOM inspection confirmed normal vertical scrolling, not document overflow. Added `scrollIntoViewIfNeeded` before the unchanged viewport/overflow assertions. Targeted insurer and doctor-period tests then both PASS (36.1 s); period test also holds an actual RPC response to verify that both date and row doctor-selection controls are disabled in flight. Old fixture batches archived before the final clean rerun: 39 batches / 49 synthetic patients, no history deletion.

## Final results and readiness — 13/10/2026

| Executed command/check | Actual final result |
|---|---|
| `npx playwright test --config scratch/qa-final.config.mjs` on allowed port 3001 | **PASS: 19/19**, 3.5 minutes, no retries/skips; all original and added tests, including the separately implemented expense test |
| `npm test` after browser suite | **PASS: 19/19**, 70.4 seconds, zero failures/skips; real database transactions/roles/jobs, money, function guards and expense transaction test |
| `npm run lint`, `npm run typecheck`, `npm run build` | **PASS**; final bundle JS 517.20 kB / gzip 148.15 kB, CSS 18.72 kB / gzip 4.79 kB; bundle secret check passed; chunk advisory remains |
| `node scripts/verify-function-inputs.mjs` | **PASS: 12/12** actual deployed function rejection cases |
| `npm run archive:demo` | **PASS**: archived 41 remaining synthetic batches / 45 patients, retained history |
| `npm run verify` after archive | **PASS**: 43 seeded services, 50 total including inactive custom audit services, five price lists, one owner, one active scheduler; zero active test doctors/insurers/offers and unrecovered job failures |
| Read-only post-archive patient/union counts | **PASS**: zero active demo patients and zero active unions owned by archived demo payers |
| `npx playwright test --config scratch/qa-final.config.mjs tests/screens.e2e.spec.mjs` after archive, with latest build | **PASS: 1/1**, 26.7 seconds; desk/phone screens render after fixture removal |
| `git diff --check` | **PASS** |

The temporary isolated configuration extends the existing Playwright config, changes only baseURL/server to allowed `http://127.0.0.1:3001`, serves the copied `output/playwright/qa-build` through Vite preview, and writes to `output/playwright/qa-final`. It changes no timeout, retry, selector, assertion or production configuration. Normal sequential local runs remain `npm test` then `npm run test:e2e` as documented in README. The final browser suite ran against a fixed production copy; the latest build additionally passed post-archive screen checks. Final 30 cached navigation samples: 48–183 ms, median 75 ms, p95 134 ms; raw non-personal values in `output/playwright/responsive-navigation-metrics.json`.

One optional post-archive aggregate query initially referenced a nonexistent expense `status` column and was rejected without writes. The corrected patient/union query passed; this does not establish additional expense coverage. Existing valid expense browser and transaction tests above are the expense evidence.

Seven verified defect groups are fixed, with meaningful regression coverage. No unresolved release-blocking defect was reproduced in the audited original workflows. **Local tested frontend changes are ready for review; the hosted frontend still requires a separate release of these fixes.** Only the two user-approved function validation guards were deployed by this audit. Leaked-password protection remains disabled, and the coverage limitations above remain open; this is not complete certification. Price approval and external messaging credentials/business selection remain owner inputs. No dependencies or migrations were introduced by this audit; the concurrent expense migration belongs to its separate commit. Local implementation commits: `77d4b27` (function validation) and `507c9d8` (UI/data consistency and regressions). No push or frontend hosting deployment was performed by this audit.
