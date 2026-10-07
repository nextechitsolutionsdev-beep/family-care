# Database design — ready for authentication

Target: user-created Supabase PostgreSQL project `family care` (`xkbyxefvzlcnyefkxwsx`) in organization `peter` (`pmltjypbnnmrtggkwqwx`). Preserve the original project and its data. Keep useful existing entity names so page refactoring is incremental; old schema/seed is a historical reference, not the setup command for the new application.

## Shared conventions

UUID primary keys for application entities; bigint generated identities for append-only ledgers. Foreign keys, check constraints and not-null constraints enforce required relationships. All monetary columns use bigint piastres with nonnegative checks; percentages use integer basis points constrained to 0..10000. Limit amounts to JavaScript's safe integer range at the server boundary; calculations/tests use BigInt. Quantities are positive integers initially. Timestamps are timestamptz, birthdays/effective dates are date, appointment date/time are local Cairo values with an explicitly derived instant. ISO input/storage, western dd/mm/yyyy display.

No public anonymous data access. Enable RLS on every exposed table and explicitly grant only needed privileges. Financial rows cannot be directly rewritten by browser clients. Mutations go through validated server operations in one transaction. Derive authorization from the authenticated user's immutable ID and server-owned profile; never user_metadata or localStorage. Private privileged helper routines use fixed search_path, explicit identity/role checks and revoked default EXECUTE. Exposed wrappers remain SECURITY INVOKER, authenticate the caller and delegate only to narrowly granted helpers. Scheduled routines live in a private schema, inaccessible to client roles.

## Tables and relationships

| Entity | Main fields and constraints |
| --- | --- |
| profiles | id FK auth.users, role owner/reception/doctor, doctor_id unique nullable, display_name, active. Owner-only role edits; no last-owner removal. |
| specialties | id, Arabic name unique, English label, unique client_prefix, active, sort_order. Seed existing specialties; dentistry first. |
| doctors | id, name, specialty_id FK, category dentist/percentage/renting, default_share_bps, phone_e164, availability, weekday schedule, active. Rent is separate. |
| doctor_service_terms | doctor_id + service_id, share_bps, effective_from, effective_until; no overlapping applicable terms. |
| client_types | stable code + supplied Arabic name, default_price_list_id. Five seeded rows. |
| patients | id, name, normalized phone, birth_date, client_type_id, insurer_id nullable, marketing_consent, transactional_consent, consent timestamps, active, demo_batch_id nullable. Insurance type requires insurer. No invented clinical defaults. |
| consent_events | patient_id, purpose, consent value, recorded_by, recorded_at; append-only. |
| specialty_sequences | specialty_id PK, next_number; locked atomic increments. |
| patient_specialty_codes | patient_id + specialty_id unique, allocated_number, code globally unique; prefix-number allocation under row lock. |
| services | stable seed_code unique, specialty_id, name, category general/children/anesthesia/home, requires_deposit, default_deposit_minor, pricing_kind service/bundle/home, active. Preserve suspicious entries exactly. |
| bundle_components | bundle_service_id, component_service_id, gift boolean, allocation weight; validated against cycles. Every invoiced component has a doctor and a price snapshot. |
| price_lists | id, client_type_id unique, name, review_required. |
| price_list_versions | list_id, effective_from, published_at, created_by; unique list/date; published versions immutable. Applicable version = latest effective date not after Cairo visit date. |
| service_prices | version_id + service_id PK, price_minor; historical rows immutable after publish. |
| insurance_companies | id, name unique, co_pay_bps, active, contact fields. Owner-editable terms. |
| appointments | patient_id, doctor_id, specialty_id, Cairo date/time, scheduled status, visit_id nullable, deposit_required_minor snapshot, deposit_exemption_reason nullable, notes. Server blocks confirmation without required applied deposit. |
| visits | patient_id, appointment_id nullable, specialty_id, local visit date, status draft/open/completed/void, location clinic/home, type/insurer/co_pay snapshots, diagnosis/instructions, total_minor, co_pay_minor, covered_minor, offer_redemption_id nullable, version number. |
| visit_lines | visit_id, service_id, doctor_id required, quantity, unit_price_minor snapshot, list_version_id, discount_minor, line_total_minor, is_gift, bundle_group_id nullable, doctor_share_bps snapshot, sequence. Zero gift price is enforced. No edits after financial posting; add audited adjustment/reversal. |
| payments | patient_id, visit_id, amount_minor > 0, method cash/card/transfer, kind payment/deposit/refund, receipt_number unique, idempotency_key unique, recorded_by, paid_at, reverses_payment_id nullable. Append-only; reject overpayments beyond the obligation unless explicitly recorded as client credit. |
| payment_allocations | payment_id + visit_line_id, amount_minor, doctor_share_minor snapshot; exact sum = payment; unique and immutable. |
| insurance_invoices | insurer_id, visit_id unique, billed_minor, invoice_date, status; amount matches visit covered share; balance from settlements. |
| insurance_settlements | insurer_id, amount_minor, received_at, idempotency_key unique, reference, reversal reference; append-only. |
| settlement_allocations | settlement_id, invoice_id, visit_line_id, covered allocation_minor, doctor_share_minor; no excess settlement and exact sum. |
| rent_contracts | doctor_id, amount_minor, period monthly/custom, start/end dates, room label, active. |
| rent_dues | contract_id, period_start/end unique, due_date, amount_minor snapshot; generation idempotent. |
| rent_payments | doctor_id, amount_minor, paid_at, receipt number/idempotency key; allocations to rent_dues, append-only reversal path. |
| follow_ups | patient_id, source_visit_id, doctor_id, Cairo date, optional time, purpose, status scheduled/done/rescheduled/missed, lead_days default 1, revision, successor_id nullable. Preserve old rescheduled row. |
| offers | specialty_id, title, code, discount_kind percent/amount, discount_bps or amount_minor, validity dates, allow_bundles, birthday boolean, limits, active. Unique normalized specialty/code. |
| offer_redemptions | offer_id, visit_id unique, patient_id, amount_minor, redeemed_at; concurrent limits enforced under lock. |
| message_templates | kind birthday/campaign/follow_up, Arabic template, permitted placeholders, active; owner-editable and server-validated. |
| campaigns | filters specialty/type/last-visit interval, offer_id, template_id, created_by, preview_count, status, idempotency_key. |
| campaign_recipients | campaign_id + patient_id unique, resolved template/offer snapshot, message_id nullable; selection materialized on send and revalidated for consent. |
| message_outbox | patient_id, kind, template_id, offer_id nullable, campaign/follow-up IDs, unique dedupe_key, provider mock/whatsapp/sms, status queued/simulated/skipped/failed, attempts, next_attempt_at, sanitized error code. Private content storage; no PII console logs. |
| message_attempts | outbox_id, status, provider_reference, timestamp, sanitized error; append-only. Mock records simulated delivery without network transmission. |
| scheduler_runs | job + Cairo local date unique, status/start/completion. Birthday dedupe additionally unique patient/year. |
| audit_log | actor_id, action, entity, entity_id, changed financial values, timestamp and request ID; no password/contact/clinical content. Immutable; owner-only read. |
| clinic_settings | timezone fixed Africa/Cairo, reminder lead, birthday time, default deposit, clinic identity, provider mock; owner edit. |
| demo_batches | named test batch identifier; all demo/test rows tagged or traceable; dedicated archival command only. |

## Atomic server operations

- Create/update patient: role check, safe strings, valid birthday, Egyptian E.164 normalization, consent event, insurer requirement; atomically allocate specialty code. Reception/owner can write; doctor reads only patients related to own visits/appointments.
- Create appointment/visit and add services: validate doctor/specialty and availability, use effective price version, snapshot terms, add home fee once, expand bundle/gift lines, enforce line-doctor attribution. Recalculate exact total/co-pay/covered in the same transaction.
- Apply offer: verify dates, specialty, active/limits and bundle rule under lock. Percentage discounts round half-up; fixed discounts clamp to eligible total. Allocate by largest remainder across eligible non-gift lines, then recalculate obligations. No offer on financially posted visit without an audited adjustment path.
- Record payment/deposit: lock visit, validate remaining patient obligation, ensure stable idempotency key, insert receipt/line allocations/audit, update booking confirmation only if deposit requirement met. Duplicate requests return the same receipt. Refund creates linked reversal; original history survives.
- Invoice/settle insurance: covered balance only; lock invoices and validate insurer ownership and remaining amounts. Split settlement across covered line obligations exactly, record doctor earnings and audit.
- Complete visit: require diagnosis fields according to workflow, preserve existing clinical history, create requested follow-up transactionally, increment derived visit counts correctly. Completion and billing records remain distinct.
- Doctor statement: date filters on received payments/settlements; own doctor only, owner all. Show billed work, actual collections, share, rent due/paid/outstanding separately. Financial aggregate queries must not expose other doctors' clients or balances.
- Campaign preview/send: same server filter definition for both; user sees current count. Materialize recipients transactionally using campaign idempotency key. Recheck consent at dispatch; mock provider changes status to simulated only.
- Birthday and follow-up jobs: hourly/minutely pg_cron invokes private server routines; local Cairo clock chooses due daily execution and reminder window. Unique dedupe keys, row locks and retry-safe claiming prevent duplicates. Scheduled follow-up state/revision rechecked before dispatch.
- Owner user administration: Edge Function authenticates current JWT and checks owner profile; Supabase Auth Admin API creates/invites users server-side. Disabled users lose operational access immediately through profile checks. Never include server API secrets in Vite output.

## Query indexes and access checks

Index normalized patient search names/phones and specialty codes; appointments(date, doctor_id, status), visits(patient_id, date), visit_lines(doctor_id, visit_id), payments(visit_id, paid_at), invoices(insurer_id, invoice_date), allocation foreign keys, follow_ups(status, due_date), outbox(status, next_attempt_at), and audit(entity, entity_id, occurred_at). Add FK indexes used by RLS and cascade/lookup checks; do not blindly index every column.

Owner sees all operational/financial entities and edits setup. Reception handles patients/appointments/visits/patient payments/follow-ups and consent-aware campaigns; cannot alter prices, terms, roles, templates or all-doctor financial reports. Doctor sees own assigned appointments/lines/associated patients, own clinical notes and own statement; cannot change billed prices/payments, switch identity or read all patients. Insurer ledgers, rent administration, audit and financial report exports are owner-only. Marketing screen can expose only role-authorized campaign data. Anonymous role has no patient/service/account table access; login is exclusively Supabase Auth.

## Migration and verification sequence

1. Authenticate and create the new empty project in the verified organization; save secrets only in .env.
2. Inspect its existing schemas/tables and record project ref. Generate migration names using the pinned Supabase CLI, then apply forward-only migrations with a history record. Never run the old permissive SQL seed.
3. Create configuration/catalog seeds idempotently: 43 exact Family Care services and five initial price versions. Use clearly labelled optional demo seed separately. Bootstrap owner through the Auth Admin API, not plaintext SQL passwords.
4. Verify constraints, transactions, grants/RLS, anonymous access and separate owner/reception/two-doctor sessions; run advisors. Verify receipts, insurance splits, doctor/rent statements and concurrent/idempotent writes against real PostgreSQL.
5. Deploy server user/provider functions, schedule private jobs and verify Cairo dates, message consent and dedupe. Then integrate screens incrementally and run the full acceptance suite.

Authentication completed: CLI and project-scoped MCP OAuth succeeded. The user-created project is healthy and initially has zero public/private application tables. Credentials are stored in gitignored .env. Already-loaded MCP tools retain the previous session scope until reload; use the pinned CLI with explicit new project ref for all writes in this session.
