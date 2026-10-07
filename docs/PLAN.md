# Delivery checklist

## Read and prepare

- [x] Read all application source, manifests, schema, config and env example.
- [x] Run the existing app; inspect login, reception list and booking form without database writes.
- [x] Record baseline, gaps and stack decisions in STATE.md.
- [x] Create root AGENTS.md and protect env/build/runtime artifacts with .gitignore.
- [x] Record ambiguous prices and routine decisions in ASSUMPTIONS.md.
- [x] Prepare the schema/security/transaction design in DATABASE.md.
- [x] Prepare the exact 43-item Family Care catalog with deposit/bundle/gift metadata.
- [x] Request database authentication once; user authorized agent to connect with full access.
- [x] Authenticate Supabase CLI through the existing signed-in browser and verify peter.
- [x] Owner created `family care` (`xkbyxefvzlcnyefkxwsx`) in peter, resolving provisioning.
- [x] Authenticate the project-scoped Supabase MCP with OAuth; verify CLI reports OAuth.

## Database and server

- [x] Verify the user-created `family care` inside `peter`; preserve previous remote projects.
- [x] Pin Supabase CLI 2.120.0; verify healthy PostgreSQL and zero application tables.
- [x] Create forward-only migrations, seed commands, indexes, constraints and access rules.
- [x] Supabase Auth with owner/reception/doctor profiles; securely bootstrap owner; owner user management.
- [x] Server-side input/role validation, phone normalization and Cairo date handling.
- [x] Patients with client types, birthday, consent and per-specialty code allocation.
- [x] Specialties and service catalog; five versioned price lists; immutable charged-price snapshots.
- [x] Atomic visits/lines, gifts, bundles, home fee, diagnosis and visit completion.
- [x] Partial payments, deposits, allocation history, receipts, client balances and audited reversals.
- [x] Insurers, covered/co-pay split, invoiced/settled/outstanding receivables and settlements.
- [x] Doctor categories, default/per-service percentages, rent due/paid and period statements.
- [x] Follow-ups with scheduled/done/rescheduled/missed states and revision history.
- [x] Offers with specialty codes, validity, fixed/percent discounts and atomic redemption.
- [x] Editable Arabic templates, consent-aware recipient filtering, count preview and campaign snapshots.
- [x] Mock message provider, status logs and server-side opt-out recheck.
- [x] Daily Cairo birthday job and configurable follow-up job with retries/idempotency.
- [x] Audit money edits/voids; ensure no personal data in application logs.
- [x] Verify RLS for anonymous/reception/each doctor/owner, tampering and cross-doctor access.
- [x] Run database security/performance advisors and resolve applicable findings; leaked-password protection needs Pro.
- [x] Label demo seed and implement a command that archives only demo-owned records.

## Screens — run and review each at 1366x768 and phone width

- [x] Desk layout, role navigation and global name/phone/specialty-code search with keyboard support.
- [x] Secure login and loading/error/session expiry states.
- [x] Today/reception: client search, queue, overdue/today/upcoming reminders, no fake KPIs.
- [x] Client file: details, specialty codes, consent, visits, payments and balances.
- [x] Visit/billing: service selection, charged prices, gifts/bundles, home fee, offer, deposit, payment/receipt.
- [x] Follow-ups: purpose/date/optional time, reminders and state/reschedule actions.
- [x] Doctors: categories, schedules, percentages/rent, availability and date-range statements.
- [x] Insurance companies: coverage terms, invoices, settlements and receivables.
- [x] Offers/messages: offers, templates, campaign preview/send, birthdays and mock delivery logs.
- [x] Settings: effective-date price lists, review flags, deposit defaults, templates and users.
- [x] Owner financial reports based solely on real ledger values, with CSV exports and print layouts.
- [x] Arabic microcopy, logical RTL CSS, western digits, dd/mm/yyyy output, `جنيه`, Saturday-first schedule controls. Native date inputs follow the browser locale.
- [x] Labels/contrast/focus, sticky filters/table headers, keyboard actions and confirmed destructive actions.

## Acceptance

- [x] Fresh-clone `install → connect → migrate → seed → deploy → start` documented in README; only env filling is manual. Idempotent connection/migration/seed path rerun against the target.
- [x] Lint, typecheck and build pass without suppression; browser bundle contains no configured server credentials.
- [x] Money tests: totals/partial payments/co-pay/discount limits/offer redemption/bundles/gifts/deposits/home fee.
- [x] Doctor statement and rent tests, settlement allocation, refunds, rounding and concurrent payments.
- [x] Job tests: Cairo local dates, birthdays/leap days, follow-ups/rescheduling, consent and idempotency. Cron uses Cairo timezone rules through PostgreSQL.
- [x] E2E: create client → visit → services → partial payment → follow-up → reminder.
- [x] E2E: insurance split → ledger/settlement; birthday message; campaign preview and mock send.
- [x] E2E: doctor sees assigned client and statement, owner-only route denied; owner screens captured at desk and phone sizes.
- [x] Validate features in the running app against the new real development database.
- [x] No TODO stubs, dead buttons, silent offline writes, public patient access or unlabelled active fake data.
- [ ] Final short report: working features, run commands, assumptions to review and provider/pricing input.
