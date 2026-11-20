# Family Care working rules

- Continue the existing React/Vite application. Read docs/STATE.md, docs/PLAN.md and docs/ASSUMPTIONS.md before changes; keep the checklist current. Do not rewrite working code for taste.
- Work autonomously. Ask only for database authentication, missing credentials or a business decision that cannot be resolved reasonably. Record routine decisions in docs/ASSUMPTIONS.md.
- New development database belongs to the Supabase organization `peter` (`pmltjypbnnmrtggkwqwx`). The previous configured project is not an authorized development target. Stop once when the schema design is ready to request database authentication; wait for confirmation before provisioning or applying migrations.
- Never drop, truncate or reset existing data. Use forward-only migrations and verify against the new development database. Read the Supabase and Postgres skills before SQL/security work.
- Keep secrets in gitignored .env files, never print them. Browser variables may contain only public connection details. Supabase Auth handles password hashing. Server operations validate input and roles; do not authorize using localStorage or user-editable metadata.
- Store money as integer piastres, percentages as integer basis points. Round nonnegative shares half-up to a piastre, derive the complementary share by subtraction, and keep totals exact. Charged prices and financial terms are snapshots. Financial corrections use audited reversals, not deletion.
- Arabic-first RTL desk software: Cairo timezone, Egyptian phones normalized to +20, western digits, dd/mm/yyyy, currency label `جنيه`, Saturday-first weeks. Dense tables, restrained green/neutrals, logical CSS, visible focus and labelled fields. No fake charts, decorative gradients or demo data mixed with real records.
- Default messaging provider is mock: database log only, no external sends. Marketing requires consent and excludes opted-out clients. Jobs and payment writes must be idempotent; logs must exclude personal data.
- Done means fresh install/migrate/seed/start documented; lint, typecheck and build pass. Automated test suites were removed by owner decision (21/11/2026); do not add test data to the production database. Review each screen at 1366x768 and phone width. Do not leave TODO stubs/dead controls.
- Use focused commits when Git is available. Report what works, how to run, assumptions and remaining credentials/business input. Do not report unfinished work as done.

