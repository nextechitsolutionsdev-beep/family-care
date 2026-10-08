# Assumptions and owner review

## Prices to confirm

- Seed `اول ساعة` at 3500 جنيه and `ثاني ساعة` at 300 جنيه exactly as provided, both requiring a booking deposit. The second-hour price looks unusual and needs review.
- Keep `النايت جارد` at 1999 جنيه and `نايت جارد للفك` at 1800 جنيه as separate services; do not merge or silently change them.
- Five price lists: أقارب ومعارف، عميل نقدي فاميلي كير، عميل نقدي عيادات مصر، عميل نقدي نقابة، عميل آجل تأمين. Only Family Care is supplied. Copy all five from it initially and mark the other four as awaiting owner review.
- New-price effective date is 07/10/2026. No older prices were supplied; preserve historical price snapshots rather than fabricate historical versions.
- Strip the deposit wording from laser-gum service names. Both laser-gum services and both anesthesia-hour services require deposits. Initial minimum is 500 جنيه per booking containing any such service, capped at the visit total; owner can change it per service. Multiple required services use the maximum minimum, not a sum. Changes do not alter existing booking terms.
- Dental home visit adds 1000 جنيه once per visit, separate from the performed services. Normal services remain selectable and chargeable.
- Scaling/polishing bundle is 599 جنيه. Laser whitening bundle is 1599 جنيه with a separate zero-priced scaling gift. No extra discount on a bundle unless an offer explicitly allows it.

## Financial and doctor rules

- Monetary amounts are integer piastres. Percentages are integer basis points (10000 = 100%). Round half-up once at the final share, then subtract to calculate the other share.
- Doctor categories are dentist, percentage and renting, with Arabic labels exactly requested. Dentists default to no revenue share; optional share configuration works like percentage doctors. Per-service rates override the doctor's default. Renting doctors have configurable calendar-month rent by default, with custom start/end periods supported; no automatic prorating.
- Statements use actual collected funds (patient receipts plus insurer settlements), attributed to lines. Allocate receipts proportionally to unpaid line obligations using largest-remainder piastre allocation, with line ID as the stable tie-breaker. Snapshot doctor rates on each charged line. Rent due/paid is a separate ledger, not deducted silently from service collections.
- A visit snapshots its client type, insurer, co-pay terms, prices and doctor terms. Insurance co-pay is calculated after discounts, with covered amount = total minus co-pay. All eligible services use the company's default co-pay; no unprovided annual caps or exclusions are invented.
- One offer per visit initially. Owner can allow bundle discounts; gifts stay zero and discounts cannot make any line negative. Offer redemption is transactionally validated against validity, specialty, limits and the charged visit.
- Deposits are receipts applied to the patient balance, not additional revenue. A patient whose insurance co-pay is below the deposit threshold must pay their full patient share before confirmation; fully covered insurance has no patient deposit obligation, and the booking records an explicit zero-patient-share exemption. Refund/reversal and void workflows preserve audit history.

## Clients, jobs and consent

- A person has one client type and multiple specialty-specific codes. Dentistry uses `DEN-000001`; other specialties have owner-editable unique prefixes. Offer codes are also specialty-scoped.
- Marketing consent defaults to false. Birthday/campaign messages require consent; follow-up reminders have a separate transactional-message preference. An opt-out is checked again immediately before mock dispatch.
- Birthday job is daily at 09:00 Africa/Cairo, using local dates and unique client/year keys. Run a frequent UTC cron that checks the Cairo clock, so daylight-saving changes are handled. 29 February birthdays are observed on 28 February in non-leap years. Only valid birthday offers are attached; skip and record a non-personal diagnostic if none exists.
- Reminder lead time defaults to one day. Staff lists always show overdue/today/upcoming even without message consent. Rescheduling creates a revision so an old reminder cannot be sent for the new appointment accidentally.
- Mock provider persists a simulated result only. It never sends SMS/WhatsApp and never logs patient names, phones, clinical text or message content to application/console logs. An actual provider needs a chosen vendor/channel, server credentials, approved sender/template setup and webhook verification.
- Test/demo clients use visibly fictional Arabic names and reserved invalid mobile values rather than reachable Egyptian numbers. Production clients must pass Egyptian phone validation. Demo seeding is labelled and isolated; its removal command archives only the identified demo dataset, never existing real records.
- UI acceptance tests may create a specialty and service and then deactivate them; retain the inactive catalog rows and all financial reversal records for audit rather than deleting history. Health checks count the 43 seeded services separately from later custom services.
