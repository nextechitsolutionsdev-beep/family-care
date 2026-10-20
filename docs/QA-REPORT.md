# Family Care QA report — 20/10/2026

Audit of `main` @ `40cdea1` (local) and `https://family-care-4le.pages.dev` (production), database Supabase `xkbyxefvzlcnyefkxwsx` (family care, org `peter`). No code, business rule, migration, deployment or test was changed. Detailed per-case results: [QA-MATRIX.md](QA-MATRIX.md).

## Summary

The core money and permission model is sound and was verified against independent calculations: integer piastres, half-up shares with exact complements, idempotent receipts/settlements/refunds/campaigns, immutable ledgers, completion-based doctor entitlement with the owner-approved audited retroactive revision, and server-side role enforcement (RLS on all 43 tables, no direct write grants, roles from `profiles` only). Local and production run the identical build and show identical owner data.

Not everything is green. The existing browser regression suite fails 6 of 22 tests because several specs were not updated after deliberate product changes, so the suite cannot currently act as a release gate (CI does not run it at all). The test suite itself is unsafe to run against the only database: one database test was blocked, and the main E2E spec leaves active staff accounts behind. Product defects found are moderate: silent duplicate patients, doctor commission terms readable by reception, slow full-table loading, and browser-locale date inputs.

## Verified working (evidence-backed)

- Login/logout, reload, expired-session return to login, route guards for reception and doctor, metadata escalation refused.
- Owner creates reception and doctor accounts from Settings; weak password blocked; duplicate email refused with a clear Arabic message; doctor account sets specialty and percentage atomically; failure paths leave no orphan doctor.
- Reception: Cairo default visit date; doctor list equals database weekday availability on all 7 days; doctor-schedules tab; all reception screens usable at 390 px.
- Phone entry: local `01…`, 10-digit, `20…`, `+20…`, `0020…`, Arabic/Persian digits and bidi marks normalize to `+20`; invalid numbers rejected with no write; search by local number finds the `+20` record.
- Visits/payments: overpayment refused; partial payments and remaining balance consistent across visit, client file and Today; double-click and lost-response retries create exactly one receipt; `recorded_by` correct for owner and reception; refunds are reversal rows, net exact, ledgers immutable even for the database owner; void shows zero outstanding while keeping price snapshots; extra services after payment keep earlier lines and receipts; receipts/invoices print.
- Bundles with gift lines, deposit gate before arrival, home-visit fee once.
- Follow-ups: continuation without double charge, payment-gated admission, separately priced follow-up, insured paid follow-up at 20.5 %, rescheduling chains with increasing revisions, future dates not overdue.
- Insurance/unions: patient share half-up, organisation share by subtraction, line shares sum to the visit split, terms snapshotted against later payer edits, over-settlement refused, settlement retry idempotent, reversal restores balance exactly once.
- Doctor earnings: 33.33 %, 0 %, 100 % and the 0.5 % half-up edge (999.5 → 1000 piastres) match an independent BigInt oracle; entitlement independent of receipts; service-specific percentage overrides default; retroactive revision is audited and leaves the line snapshot and receipt untouched; UI statement, Reports total and independent SQL agree; rent due/paid exact.
- Offers/messaging: discount half-up; repeat/expired/inactive codes refused; campaigns reach consenting patients only, retry-safe, stale preview refused; reminders and birthdays queue once across repeated job runs; opted-out reminders recorded as skipped; outbox only `simulated`/`skipped` — no external provider exists.
- Expenses database rules (retry, conflict, validation, reception isolation, audited void).
- Feedback survey: one-time public link, owner-only results.
- Security: only the publishable key in the production bundle; RLS enabled everywhere; advisors show 0 errors.

## Confirmed issues, ranked

### High

**H1 — Regression suite cannot gate releases (6/22 E2E fail on current `main`, CI runs no tests).**
Repro: `npx playwright test` (expenses excluded, see H2). Failures:
1. `clinic.e2e` and `audit.e2e` reschedule test wait for a «تمت» follow-up button that commit `902cc6c` replaced with open → admit after payment → «إنهاء المتابعة».
2. `audit.e2e` catalog test fills «بادئة كود العميل», now behind «تخصيص الكود والترتيب».
3. `insurance-doctor.e2e` selects a doctor before changing the date; the weekday filter (`f728b49`) correctly disables the list for today. Its later 99.99 assertion would also be stale after the 19/10 retroactive-revision decision (expected 150.00).
4. `audit.e2e` cash test compares Reports with SQL that ignores `doctor_share_revisions` (expected 324999, UI 639999; independent revision-aware SQL gives 639999 — UI correct).
5. `audit-ui.e2e` once found one unlabeled control on `/patients`; not reproduced at 768/1920/320 px in a separate run.
Impact: AGENTS.md "done" requires the full E2E pass; regressions in the failing journeys (refund UI, settlement reversal UI, payer phone layout, CSV after refund) are currently unguarded. `.github/workflows/cloudflare-pages.yml` builds and deploys without lint, typecheck or tests.

**H2 — Tests mutate the only (production) database unsafely.**
- `clinic.e2e` creates reception and doctor Auth users and calls `admin.auth.admin.deleteUser()` in `finally` without checking the result; the delete fails because `profiles.id → auth.users` is `ON DELETE NO ACTION`, so **two active staff accounts** are left in production every run. This run left two (`feedback-…@familycare.example.com`); `roles.e2e` left one active doctor login. All three were deleted by exact ID (zero references).
- `clinic.e2e` and `database.test.mjs` call `private.run_jobs()` with a date one year ahead. `run_jobs` → `generate_rent(as_of)` creates monthly dues up to that date for **every active rent contract**, real tenants included. Proven on archived test tenants: 16 future-dated dues up to 2027-02. No real contract exists today, so no real data is affected yet.
- `database.test.mjs` posts permanent payments, settlements, rent, campaigns to all consenting patients, and Auth users without cleanup → BLOCKED in this audit.
- `expenses.e2e` writes an untagged expense (voided, but permanently visible) into the real ledger → BLOCKED.

### Medium

**M1 — Duplicate patients are created silently.** Repro (owner or reception): register a client with `01500000017`, then «عميل فقط» with the same number → second file opens, no warning (2 patients with `+201500000017`). Expected: warn and offer the existing file (business rule to confirm: block vs warn).

**M2 — Reception can read doctors' commission terms.** With a reception session, `doctors.default_share_bps` (33 rows), `visit_lines.doctor_share_bps` and `payment_allocations.doctor_share_minor` are readable, while `doctor_service_terms` and statements are owner-only. Owner decision needed; if owner-only, expose a reduced doctors view to reception.

**M3 — Performance: every navigation reloads ~40 whole tables.** Measured walk of 11 owner screens: ≈560 Supabase requests / ≈640 KB; production login→Today 8.8 s (local 4.6 s), `/specialties` 10.1 s, several single-table reads 1.2–1.7 s; Reports totals are computed in the browser from all rows. Grows linearly with clinic history.

**M4 — Paginated loads have no stable order** (`src/clinic/api.ts:63`, `.range()` without `.order()`). Once any table exceeds 1000 rows, pages can skip or duplicate rows, silently corrupting client-side totals (Reports, balances). Latent today (largest table: audit log ≈350 rows).

**M5 — Date inputs ignore the dd/mm/yyyy rule.** Native `<input type="date">` renders in the browser locale; the intake dialog showed `10/26/2026` (month first) while the header shows `20/10/2026`. Risk of day/month confusion at the desk.

### Low

- **L1** Archived test operations stay visible in Reports' financial audit log: `hideArchivedDemo` does not map `follow_ups`, `services`, `profiles` or removed lines (this run added 15 visible rows). The page warns about it.
- **L2** Applying an inactive offer code returns raw «query returned no rows» instead of a coded error.
- **L3** Follow-ups can be created with a past due date.
- **L4** The owner's patient form shows an empty «مجموعة تجريبية (اختياري)» selector whenever any archived batch exists.
- **L5** Auth: leaked-password protection disabled; password reset does not revoke existing sessions; deactivation does not ban the Auth user (database access is still blocked by `current_role()`).
- **L6** `experience-feedback` accepts `localhost` origins in production; no CSP/frame-ancestors headers on the site.
- **L7** One owner login stalled >15 s on «جارٍ فتح العيادة…»; retry fine, not reproduced.
- **L8** `scripts/archive-demo.mjs` sometimes prints «Archived 0 demo batches» although it archived the batch (verified in the database).

### Business questions (not defects)
- Same promo code can be redeemed again by the same patient on another visit (`max_redemptions` empty). Confirm the intended limit.
- Duplicate-patient policy (M1) and reception visibility of commissions (M2).

## Financial and security risk summary

No incorrect amount was found in any verified calculation; no cross-role leak of financial ledgers, audit, rent, invoices, settlements, feedback or staff profiles. Risks are: commission terms visible to reception (M2), latent pagination order (M4), and test tooling that can post future rent dues to real tenants and leave active staff logins (H2).

## Blocked / not tested

| Area | Reason |
|---|---|
| Fresh migrate + seed on an isolated database | No Docker/local Supabase here; resetting or reseeding the live project is forbidden |
| `tests/database.test.mjs` | Unsafe on the only database (H2); its scope was re-covered by two rolled-back audit tests |
| Expense UI save/void | Would leave a permanent visible test expense in the empty real ledger; rules covered by `expenses.test` |
| Price-version publishing UI | Price versions are immutable in production; no isolated database |
| Refund and settlement-reversal UI clicks, payer screen at phone width, CSV after refund | Reached only by stale specs; behaviour verified at RPC level |
| Reception performing writes in the UI | Any write makes the temporary account undeletable (all `profiles` FKs are NO ACTION); verified with a reception identity in a rolled-back transaction |
| Supabase MCP | Configured locally (read-only, project-scoped); OAuth needs the owner in a browser — run `/mcp` in a new session and authorize. All database inspection used read-only transactions through the existing Supabase CLI login instead |
| Load/stress | Not authorized |

## Local vs production

Identical build hashes; identical owner-visible data on 11 screens plus an all-time report. Production is roughly 2× slower to log in and navigate (network + Cloudflare), see M3.

## Commands and outcomes

| Command | Outcome |
|---|---|
| `git clone` + `npm ci` | PASS |
| `npm run lint` / `npm run typecheck` / `npm run build` | PASS / PASS / PASS (bundle verified) |
| `npm test` (clean clone, no `.env`) | 24 pass, 2 need `.env`; `doctor-account.test` then PASS with `.env` |
| `npx playwright test` (all but expenses) | 16 pass, 6 fail (H1) |
| `node --test scratch/qa-2026-10-20/rollback-audit.test.mjs` | PASS (money, earnings, offers, messaging, roles) |
| `node --test scratch/qa-2026-10-20/rollback-audit-2.test.mjs` | PASS (bundles, deposit, home fee, refunds, reversals, rent, follow-up chain) |
| `npx playwright test -c scratch/qa-2026-10-20/qa.config.mjs ui-audit` | 4/4 PASS |
| Baseline (read-only) local before / after / production | Totals identical |
| `supabase db advisors` (read-only) | 0 ERROR, 4 WARN, 35 INFO |

QA scripts live in gitignored `scratch/qa-2026-10-20/` (not part of the product test suite).

## Cleanup verification

- Every test entity was tracked by snapshot/diff of row IDs; **no pre-existing row was deleted or modified** (diff: only additions).
- 14 test batches were created (13 by the E2E specs, 1 by the UI audit). 3 were archived by the specs themselves; the other 11 were archived by exact ID with the owner-approved script; financial history retained and hidden. 0 open batches; 0 active test patients, doctors, payers or offers.
- 5 temporary Auth users/profiles deleted by exact ID (2 left by `clinic.e2e`, 1 by `roles.e2e`, 2 from the UI audit). Auth users and profiles back to the original 3 (one owner, one reception, one doctor).
- Real data unchanged: 2 clients, 2 visits (2 completed), 2 payments, 1 follow-up, 0 messages, 0 rent dues, 0 expenses.
- Must remain: archived test financial history (by policy); 1 inactive test specialty and 1 inactive test service with 5 immutable price rows from `quick-catalog.e2e` (price rows cannot be deleted); 15 archived-test rows in the Reports audit log (L1).

## Recommended fixes, in order

1. Make tests safe for a single database (H2): check `deleteUser` errors and delete the profile first; never call `run_jobs` with future dates against shared data (or scope rent/birthday jobs to test contracts); tag expenses/campaigns to demo batches; better, provision a separate development project or local stack for destructive suites.
2. Update the 5 stale specs to the current follow-up, specialty, weekday-filter and revision rules (H1); add lint, typecheck, unit tests and E2E to CI before deploy.
3. Add stable ordering (`order('id')`) to paginated loads (M4).
4. Decide and implement duplicate-patient handling (M1) and reception visibility of commissions (M2).
5. Move heavy reads to scoped queries/RPCs (date-bounded reports, per-screen data) to cut load time (M3).
6. Replace native date inputs with a dd/mm/yyyy entry or display (M5).
7. Low items: audit-log archive mapping, coded offer errors, past-date follow-up validation, hidden empty test-batch selector, leaked-password protection, session revocation on password reset/deactivation, production origin list and security headers.
