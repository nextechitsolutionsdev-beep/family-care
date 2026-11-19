# Assumptions and owner review

## Desk changes — 19/11/2026

Owner answers (19/11/2026, ClickUp list «familycare»):
- Payment above the remaining balance (e.g. 3000 for 2999) is accepted; the difference is extra revenue («إيراد زيادة»), not returned and not a patient credit.
- One booking per doctor per exact minute; same time is allowed for another doctor or specialty. No booking duration.
- Doctors have working days and per-day hours. Booking on a day off or outside the hours is a warning that reception confirms, not a refusal.
- The owner sets a price per service for each insurance company and each union; reception sees it as soon as the service is chosen. «تأمين نقدي» is not a separate client type.
- Label «إجمالي حصة الشركة» renamed to «إجمالي حصة التأمين»; Today shows the visit specialty; every active specialty is offered when booking, with a notice when it has no doctor or service.

Routine decisions:
- payments.amount_minor stays «applied to the visit» (≤ remaining); the excess is payments.excess_minor. Allocations, doctor shares, insurer shares, receipts' remaining balance and the patient balance ignore it. A reversal repeats the excess on the refund row so revenue nets to zero. The owner report shows it as its own line and adds it to the net. A visit with nothing due still refuses any amount.
- The booking time is required in every booking form; bookings saved earlier without a time, and server callers that send none, are not compared. A cancelled or voided booking frees its minute. The rule is a unique index, so simultaneous saves cannot both succeed.
- Hours are optional per working day ({"0":{"from":"15:00","to":"17:00"}}, end exclusive: 17:00 is outside). A day without hours has no hour limit; an empty schedule still means every day. A confirmed out-of-hours booking is audited as «حجز خارج مواعيد الطبيب». Follow-up dates are not checked against hours (unchanged).
- Doctors outside their days/hours stay in the doctor list, marked «(خارج مواعيده)»; the form shows the selected doctor's schedule.
- Payer prices apply to lines added to a covered visit whose payer (insurer or union) has a price for that service; otherwise the Family Care price applies as before. Not applied to gifts, bundle components or follow-up fee lines. Changing a payer price never changes lines already on a visit. Each change is audited.
- Database changes to private.command are applied in place (only the exact statements are replaced), so other changes to that function are kept; a statement that is not found stops the migration.

## Catalogue request — 05/11/2026

Owner answers (05/11/2026):
- Prices: none were given; services are added without prices. For such a service reception types the charged price at the visit, records what was paid, and the rest stays as the remaining balance («الاستقبال الفلوس اللي خدها يقيدها ويكتب المتبقي»).
- Lab tests: not imported from the 2026 lab sheet; the owner adds, prices and removes tests. The «معمل تحاليل» specialty is created empty.
- Emergency and general services (طوارئ أسنان، تخدير، ايكو، رسم قلب، سونار …): the owner creates an emergency clinic and its services.
- «معاد الزيارة القادمة» with a client reminder: postponed by the owner; nothing changed.

Routine decisions:
- A desk-priced service is marked `open_price`; it has no price-list rows. The typed unit price (more than 0) is snapshotted on the line, flagged `manual_price` and audited; quantity, gifts, co-pay, offers, collection and remaining balance work as for list prices. A fixed-price service refuses a typed price, so a list price cannot be overridden at the desk.
- Price versions cover fixed-price services only. «تحديد سعر ثابت» gives an open service one price in every list (current and future versions), after which it is edited through price versions. Published prices stay immutable.
- A follow-up opened as «زيارة جديدة لنفس الخدمة» re-adds the service at its list price, so for a desk-priced service reception uses «متابعة بسعر مستقل» or «استكمال الحساب».
- Names follow the owner's message (spelling kept, hamza normalised where clear). «باطنه» becomes «باطنة وكلى» and «جلدية» becomes «جلدية وتجميل» (rename only). Sub-items become separate services (حجامة جافة، حجامة تشريطية عادية/بريميام، إبر صينية، حقن ويجوفي/مونجارو). Packages are plain desk-priced services until their session counts are known. «كشف تخصص كذا» in home visits is one service «كشف منزلي (حسب التخصص)». Specialties without a service list get «كشف». Prefixes come from the Family Care presets. The existing service «عايز ماوس ليزر» is unchanged.

- Built on `main` (19/11/2026, owner request). The desk-priced services and catalogue work of 05/11 stays on branch `codex/qa-remediation` and is not part of this change.

## Remediation decisions — 21/10/2026

Owner answers (21/10/2026):
- Testing: no separate project; tests may use the live project but must clean up after themselves. Integration and browser suites therefore require FAMILY_CARE_TEST_TARGET=xkbyxefvzlcnyefkxwsx and FAMILY_CARE_ALLOW_PRODUCTION_FIXTURES=tracked-cleanup, track every fixture and fail on any teardown problem. Rows with financial history cannot be deleted; they stay archived and hidden (retained, not removed).
- Shared phone numbers: warn, offer to open the existing file, and allow a separate patient only after explicit confirmation (family members). Enforced by the database for every entry point; test placeholders (+200000…) and an unchanged number on edit are not checked.
- Doctor commission terms: owner sees all, a doctor sees only their own terms; reception keeps prices, balances and collection but no doctor percentages or shares. Enforced with column privileges plus clinic_commission_terms().
- Offers: per-offer «once per patient» setting; existing offers stay repeat-use. A redemption is consumed when applied, also if the visit is later voided.

- Permanent patient code (owner requirement 21/10/2026): every patient has one code FC-000123 for all specialties, assigned once by a database sequence (atomic under concurrent registration; an intake retry reuses its patient; edits keep the code; the code cannot be changed). Existing patients were numbered once, clinic patients before test fixtures, by registration time. Specialty codes (DEN-000382…) stay as searchable legacy aliases; no new ones are issued. Specialty membership for campaigns and birthday offers moved to patient_specialties (from legacy codes and visits; owner/reception only, so a doctor cannot see which other specialties a patient attends). Specialty and doctor are chosen per visit. Patients are never merged automatically.
Routine decisions:
- Follow-ups dated before Cairo today are allowed (historical entry) but need an explicit confirmation in the form.
- Dates are typed and shown as dd/mm/yyyy (Arabic digits and pasted ISO accepted); APIs keep ISO yyyy-mm-dd.
- Scheduled jobs and specialty-wide campaigns are never advanced or sent from tests against the live project; their rules are tested in rolled-back transactions. A campaign test sends only when every recipient belongs to its own fixture batch.
- Requests time out after 20 seconds and offer a retry instead of an endless loading screen.
- The survey Edge Function accepts only the production origin unless EXPERIENCE_ALLOWED_ORIGINS adds development origins.
- Doctor categories: the first category is named after the doctor's selected specialty («أطباء الباطنة», «أطباء التخاطب»; «ال» is added to a single-word name that lacks it, longer names are kept as typed). It is a display label only: the stored value stays `dentist`, and renting/percentage and every financial rule are unchanged. Without a specialty the label reads «أطباء التخصص».
- Release compatibility: the new frontend detects what the server supports. If commission terms cannot be read (function not yet created, old column already restricted, or the schema cache not yet reloaded) the percentage shows «—» and doctor/percentage editing is disabled; a percentage is never assumed to be 0. The once-per-patient setting and patient codes appear only when their columns exist.
- Applied-migration integrity: a file whose bytes differ from the recorded checksum is accepted only if the SQL recorded at apply time still hashes to that checksum and equals the file after CRLF→LF normalisation. Anything else stops `npm run migrate`. Applied history is never rewritten.
- Two accounts (one owner, one reception) were added by the clinic on 21/10/2026 and are real. Tests that need an owner use the earliest-created active owner, so a test never signs in as another person's account; teardown never touches accounts outside its ledger.
- The PDF guide is generated from docs/USER_GUIDE.md by Chromium with the Windows Tahoma font embedded; regenerate it with `npm run guide:pdf` after editing the guide. Screenshots in docs/guide are empty-form crops with example values only.

## QA audit decisions — 20/10/2026

- Tests that leave permanent visible records or touch real patients/tenants on the only database (`tests/database.test.mjs`, `tests/expenses.e2e.spec.mjs`) are not run against it; their rules are re-checked in rolled-back transactions.
- Reception write permissions are verified with a reception identity inside a rolled-back transaction, because any UI write would make a temporary staff account undeletable (all `profiles` foreign keys are NO ACTION).
- QA fixtures are tracked by row-ID snapshot/diff and cleaned by exact ID: archive the batch, delete unreferenced test logins. Immutable price rows of test catalog items stay inactive.
- Full clinic loads read server capabilities and permitted doctor commission terms alongside table data; reception never requests commission terms, and partial operational refreshes skip both lookups.

## QA decisions — 13/10/2026

- A financially void visit keeps its original charged-price/co-pay snapshots for audit but has zero outstanding patient balance in the visit, client history and Today. Cancelling an appointment alone does not void its financial visit or erase debt.
- Changing a doctor statement's period clears the previously displayed/exportable statement; fetch again with the explicit account button. Filters are disabled during retrieval so a response cannot be shown under a different selected period.
- QA uses synthetic records in the previously authorized development project only. Generated screenshots/traces are local artifacts; preserve the tracked user-guide screenshots. No automatic realtime guarantee is introduced: mutations and explicit refresh/reload are the supported synchronization points.

## Prices to confirm

- Seed `اول ساعة` at 3500 جنيه and `ثاني ساعة` at 300 جنيه exactly as provided, both requiring a booking deposit. The second-hour price looks unusual and needs review.
- Keep `النايت جارد` at 1999 جنيه and `نايت جارد للفك` at 1800 جنيه as separate services; do not merge or silently change them.
- Five price lists were seeded originally: أقارب ومعارف، عميل نقدي فاميلي كير، عميل نقدي عيادات مصر، عميل نقدي نقابة، عميل آجل تأمين. Only Family Care was supplied. The other four were copied initially. The insurance and syndicate copies remain for historical records; new insurance and syndicate charges use the Family Care list. The Egypt Clinics and relatives copies still need owner review.
- New-price effective date is 07/10/2026. No older prices were supplied; preserve historical price snapshots rather than fabricate historical versions.
- Strip the deposit wording from laser-gum service names. Both laser-gum services and both anesthesia-hour services require deposits. Initial minimum is 500 جنيه per booking containing any such service, capped at the visit total; owner can change it per service. Multiple required services use the maximum minimum, not a sum. Changes do not alter existing booking terms.
- Dental home visit adds 1000 جنيه once per visit, separate from the performed services. Normal services remain selectable and chargeable.
- Scaling/polishing bundle is 599 جنيه. Laser whitening bundle is 1599 جنيه with a separate zero-priced scaling gift. No extra discount on a bundle unless an offer explicitly allows it.

## Financial and doctor rules

- Quick intake and returning-patient visits accept a primary service and up to 29 additional service rows with quantities, saved atomically before the optional receipt. Additional rows use the selected visit doctor. Removing a draft service recalculates the visit; bundled lines are removed as one bundle. Posted/paid/completed visits retain their financial records and require the owner's existing audited full-visit reversal/correction flow rather than deleting a charged service.

- Monetary amounts are integer piastres. Percentages are integer basis points (10000 = 100%). Round half-up once at the final share, then subtract to calculate the other share.
- Doctor categories are dentist, percentage and renting, with Arabic labels exactly requested. Dentists default to no revenue share; optional share configuration works like percentage doctors. Per-service rates override the doctor's default. Renting doctors have configurable calendar-month rent by default, with custom start/end periods supported; no automatic prorating.
- Starting 12/10/2026, the owner explicitly chose doctor entitlement on visit completion, based on each line's price after discounts and its stored percentage, independent of patient receipts and payer settlements. Round each line half-up to a piastre. Open and void visits contribute no entitlement. Completion time determines the statement period; old completed visits with no completion timestamp use their service date. Existing receipt/settlement allocations remain untouched as historical collection records. Rent due/paid stays separate. No doctor payout is implied by showing entitlement.
- A visit snapshots its client type, payer, co-pay terms, prices and doctor terms. Insurance and syndicate co-pay is calculated after discounts, with covered amount = total minus co-pay. Reception enters the card percentage on every new covered visit; there is no payer default. No unprovided annual caps or exclusions are invented.
- The payer screen's total share includes the current covered share of open visits so the owner can see the amount before visit completion. It separates this provisional share from issued invoices; only an issued invoice can be settled, and the total decreases after settlement. A voided visit and voided invoice contribute nothing.
- Starting 12/10/2026, new insurance and syndicate service lines use the published Family Care cash price effective on the visit date. The first service line pins the price-list version for further lines in the same visit. Existing charged lines and historical price versions stay unchanged. Reception enters patient co-pay per visit from the card; payer coverage is the exact complementary percentage and becomes a receivable settled later by the owner. For 300 جنيه with 20% co-pay, the patient owes 60 and the payer 240. Split nonnegative piastres half-up once and derive payer amount by subtraction.
- One offer per visit initially. Owner can allow bundle discounts; gifts stay zero and discounts cannot make any line negative. Offer redemption is transactionally validated against validity, specialty, limits and the charged visit.
- Deposits are receipts applied to the patient balance, not additional revenue. A patient whose insurance co-pay is below the deposit threshold must pay their full patient share before confirmation; fully covered insurance has no patient deposit obligation, and the booking records an explicit zero-patient-share exemption. Refund/reversal and void workflows preserve audit history.

## Clients, jobs and consent

- لكل عميل من نوع «نقابة» نقابة واحدة يختارها الاستقبال من قائمة يديرها المالك. الانتماء يُحفظ في الملف وتُلتقط نسخة منه عند فتح الزيارة. الزيارات الجديدة تستخدم سعر فاميلي كير ونسبة تحمّل يقرأها الاستقبال من الكارنيه في كل زيارة؛ الباقي مديونية على النقابة في سجل الفواتير والتسويات. القوائم والأسعار القديمة والسجلات غير محددة النقابة محفوظة للتاريخ.
- زر «تسجيل عميل وخدمة» هو المسار الرئيسي ويأخذ بيانات الحد الأدنى، ويضيف خدمة واحدة من تخصص الطبيب بكمية واحدة إلى زيارة عيادة. تُفتح الزيارة بعد الحفظ لاستكمال التحصيل أو إضافة خدمات أخرى. زر «عميل فقط» يبقي المسار المفصل، والوقت والزيارة المنزلية وموافقات الرسائل وبقية بيانات الملف تبقى في نماذجها المعتادة. لو فشل الحجز أو إضافة الخدمة لا يُحفظ ملف عميل ناقص.

- A person has one client type and multiple specialty-specific codes. Dentistry uses `DEN-000001`; other specialties have owner-editable unique prefixes. Offer codes are also specialty-scoped.
- Marketing consent defaults to false. Birthday/campaign messages require consent; follow-up reminders have a separate transactional-message preference. An opt-out is checked again immediately before mock dispatch.
- Experience surveys are service follow-ups, not marketing: create one unique link after visit completion only when transactional-message consent is active, and recheck consent at mock dispatch. Links expire after 30 days, accept one response per visit, and contain a random token whose hash alone is stored. The public form collects a 1–5 rating and optional comment; it never shows patient identity or submitted results. Only the owner role can read ratings through the app or Data API. Demo-batch responses stay hidden from the owner screen.
- Birthday job is daily at 09:00 Africa/Cairo, using local dates and unique client/year keys. Run a frequent UTC cron that checks the Cairo clock, so daylight-saving changes are handled. 29 February birthdays are observed on 28 February in non-leap years. Only valid birthday offers are attached; skip and record a non-personal diagnostic if none exists.
- Reminder lead time defaults to one day. Staff lists always show overdue/today/upcoming even without message consent. Rescheduling creates a revision so an old reminder cannot be sent for the new appointment accidentally.
- Mock provider persists a simulated result only. It never sends SMS/WhatsApp and never logs patient names, phones, clinical text or message content to application/console logs. An actual provider needs a chosen vendor/channel, server credentials, approved sender/template setup and webhook verification.
- Test/demo clients use visibly fictional Arabic names and reserved invalid mobile values rather than reachable Egyptian numbers. Production clients must pass Egyptian phone validation. Demo seeding is labelled and isolated; its removal command archives only the identified demo dataset, never existing real records.
- UI acceptance tests may create a specialty and service and then deactivate them; retain the inactive catalog rows and all financial reversal records for audit rather than deleting history. Health checks count the 43 seeded services separately from later custom services.
- QA fixtures explicitly tag a union's insurance payer with its demo batch; archive follows that ownership and retains all financial history. CSV acceptance creates its own receipt and does not depend on existing operational records.
- Concurrent workspace development requires an isolated copied build and separate Playwright artifact directory. Use an already permitted local origin (127.0.0.1:3001), without expanding Edge Function CORS merely for a test runner.

- المصروفات مبالغ مدفوعة فعلياً وليست التزامات مستقبلية: الاستقبال يسجل ويرى عملياته فقط، المالك يرى الإجمالي والتفصيل ويلغي بسبب محفوظ. لا تؤثر المصروفات على مستحق الطبيب؛ تخصم مستقلة في التقرير. لا يسمح بتاريخ مستقبلي، والمبلغ بالقروش، وإعادة المحاولة لا تكرر السجل.

- اسم الحساب المحصّل يُعرض من payments.recorded_by المرتبط بملف الموظف الموثوق، وليس الحساب المفتوح حالياً؛ في إيصال الرد يظهر منفذ الرد نفسه.


- الإضافة السريعة للتخصص تطلب الاسم فقط وتولد بادئة آمنة تلقائيًا؛ تخصيص الكود والترتيب اختياري. إضافة الخدمة تطلب الاسم والتخصص والسعر وتنسخ السعر لكل قوائم العملاء الحالية والمستقبلية، وتتيح بقية الخيارات دون حذفها. استثناء ضيق لإضافة أسعار خدمة جديدة تمامًا إلى نسخة منشورة داخل معاملة إنشائها؛ لا يغير أي سعر سابق أو نسخة مالية لزيارة، ولا يسمح بتعديل السعر المنشور. لإعادة المحاولة مفتاح ثابت مرتبط بمالك الطلب ومحتواه.


- قائمة اقتراحات التخصصات محلية بالواجهة (100 اختيار رئيسي وفرعي وأقسام عيادات)، لا تُزرع بقاعدة البيانات ولا تُفعّل أي تخصص؛ يحفظ المالك اختياره عند توفره. الأكواد داخلية أصلية للمشروع وليست أكواد رسمية أو تشخيصية. يتاح البحث والإدخال اليدوي وتخصيص الكود، ويحظر تكرار الاسم المطبّع أو البادئة. المصادر والتفصيل في docs/SPECIALTY_PRESETS.md.


- بطلب المالك واعتمادًا على صورة إعلان فاميلي كير، تقتصر القائمة الأساسية على 14 تخصصًا بالمسمّيات المجمعة كما ظهرت بالصورة، مع «أخرى» للإدخال اليدوي. المائة اقتراح السابقة تبقى مرجعًا للأكواد فقط، دون تفعيل أو إعادة تسمية التخصصات المسجلة. خدمات الإعلان الأخرى كالأشعة والحقن خدمات وليست تخصصات في هذه القائمة.


- اختبار الحمل الموافق عليه في 16/10/2026 محدود بالقراءات والموقع الحالي وSupabase وبسقف 5 طلبات/ثانية، 5 دقائق و600 طلب، وليس اختبار السعة القصوى. موافقة هذه النافذة لا تعني الموافقة على حمل إضافي لاحق. فشل عينة المراقبة يوقف الاختبار ولا يثبت تعطل الخدمة. لا تتحول RPS إلى عدد مستخدمين بلا اختبار رحلة واقعي؛ لا تغييرات إعدادات أو نشر بسبب تقرير الاختبار.

- طلب المالك في16/10/2026 اختبار البيئة الحالية بدل إنشاء staging بعد اختلاف حساب Dashboard. حمل الدورة المعتمد حتى100 طلب/ث و20000 طلب، وليس تصريحًا لتجاوز100 تلقائيًا. التوسعة المقترحة حتى400 و100000 طلب تنتظر اعتمادًا منفصلًا. الاختبارات قراءات في حجم البيانات الحالي؛ لا استنتاج لعدد المستخدمين أو سعة الكتابة أو القدرة القصوى من معدل API وحده.

- اعتمد المالك صراحة دورة125–400 طلب/ث على الحالي،900ث/100000 طلب/80 اتصال، ونُفذت مرة واحدة مع توقف النقل. لا اعتماد تلقائي لدورة أخرى.279.41 طلب/ث أعلى مرحلة دقيقة مكتملة؛ توقف400 لا يثبت تشبع قاعدة البيانات أو أقصى سعة السيرفر.

- تحسينات الأداء الحالية تتجنب تخزين بيانات مالية قديمة: تجميع طلبات refresh المتزامنة مع دورة جديدة إذا وقع طلب أثناء القراءة، وفهارس داخل ذاكرة المزود فقط. لا علاقة سببية مثبتة بينها وبين مهلات اختبار400؛ لا ادعاء رفع سعة API دون قياس جديد.

- المتابعة باختيار الاستقبال: استكمال حساب نفس الخدمة دون تكرار سعرها، أو زيارة جديدة لخدمة مدفوعة تبقى مرتبطة بالمتابعة والأصل. المتبقي القديم مستقل ولا ينتقل أو يتكرر. الإضافة بعد التحصيل متاحة للزيارة المفتوحة قبل إصدار مديونية الجهة، مع تثبيت كل السطور والتوزيعات السابقة؛ الخدمات الجديدة تضاف دون إعادة تطبيق عرض سابق. الفاتورة ملخص محدث والإيصالات الأصلية لا تتغير.

- اعتماد17/10/2026: حذف نهائي لبيانات التشغيل وكل الهويات عدا الأدمن مع حفظ التخصصات والخدمات والأسعار ومراجعها وإعدادات التشغيل الضرورية. الإذن خاص بهذه العملية ويستبدل طلب إخفاء العملاء السابق لهذه البيانات فقط، وليس تفويضًا بحذف مالي تلقائي في المستقبل.
- نظام المتابعة المعتمد17/10/2026: الاستكمال يربط نفس الحساب ولا يكرر سعر الخدمة؛ المتابعة ذات السعر المستقل تحفظ مبلغًا ثابتًا مطلوبًا من العميل بالكامل، حتى للتأمين والنقابة، ولا تطبق نسبة الكارنيه عليه. الفتح ينشئ حساب الرسوم مرة واحدة، والحضور يتطلب سداد حصة العميل القديمة ورسوم المتابعة. نسخة الإيصال تثبت الإجمالي والمدفوع والمتبقي وقت الدفع. حساب الرسوم مستقل ولا تخلط فيه خدمات بقواعد تأمين مختلفة.

- طلب18/10/2026 إزالة الصورة يعني تخصصات الاختبار التسعة فقط؛ باطنه تخصص حقيقي محفوظ. أُزيلت معها الخدمات والأسعار التجريبية التابعة غير المستخدمة بعد فحص كامل للمراجع، ولا يشمل الإذن بيانات أسنان أو السجلات المالية أو أي تخصص جديد.

- يُكتب الموبايل المصري كما هو محليًا، ويضيف التطبيق كود مصر تلقائيًا قبل الحفظ. تُقبل الصيغ الدولية القائمة والأرقام العربية والفارسية دون تغيير شرط صلاحية الموبايل أو قواعد أرقام التجربة بالخادم.

- صورة خطأ إنشاء حساب بيتر لا تكشف السبب الخام أو كلمة المرور. الحساب الحقيقي لم يُنشأ تلقائيًا بكلمة مرور بديلة؛ يظل اختيار كلمة مروره للمالك. يُعاد طلب إدارة الحساب مرة واحدة فقط بعد401 وتجديد الجلسة الناجح، وتظل صلاحية المالك مفحوصة بالخادم.

- طلب حذف تخصص/خدمة19/10/2026 يعني إزالته من الاستخدام الجديد مع حفظ مراجع الحسابات؛ يتاح الاسترجاع من إظهار المحذوف. التخصص المستعاد لا يعيد خدماته تلقائيًا لتجنب تنشيط خدمة أوقفها المالك سابقًا، وتستعاد الخدمات المطلوبة منفردة. مكون باقة فعالة لا يوقف قبل الباقة، ولا تستعاد باقة قبل مكوناتها.

- قرار المالك19/10/2026 يستبدل قاعدة أن نسبة الطبيب الجديدة للخدمات المستقبلية فقط: تعديلها ينعكس أيضًا على الخدمات الموجودة حتى بعد التحصيل، بواسطة تسوية عمولة مؤرخة مع الحفاظ على السطر والإيصال الأصليين. الاستحقاق يظل عند إنهاء الزيارة ومستقلًا عن التحصيل. النسبة الخاصة بالخدمة مقدمة على الافتراضية. لا تغيير لحصة العميل أو التأمين أو دفعاته؛ التقرير عن فترة إنهاء الخدمة يعرض النصيب المعدل حاليًا.

- عند إضافة حساب طبيب، النمط الافتراضي إنشاء طبيب جديد بتخصص واحد من التخصصات النشطة ونسبة صريحة. يظل الربط بسجل موجود متاحًا؛ لا تغيير تلقائي لتخصص الأطباء الحاليين أو زياراتهم، ولا توسيع وصول الطبيب لعملاء تخصصه دون زيارات مسندة إليه.

- أكد المالك19/10/2026 عدم ترك بقايا التجارب. بعد كل تحقق: إزالة هويات وملفات الاختبار غير المستخدمة، أو أرشفة الدفعة الدقيقة إذا كان لها سجل مالي محفوظ، ومراجعة أن عدد بيانات QA النشطة صفر وعدم خلطها بحسابات المستخدم الحقيقية. لا يُعمم التنظيف على سجلات بمجرد وجود كلمة تجريبي أو على حسابات أضيفت حديثًا.

- إتاحة الطبيب تُحدد بأيام الأسبوع المسجلة، وليس إثبات حضور لحظي أو ساعات أو سعة حجوزات. عدم تحديد أي يوم يظل يعني كل الأسبوع كما يوضحه نموذج الطبيب والخادم؛ الأطباء الظاهرون تابعون لتخصص نشط.

- توضيح المالك19/10/2026: تابة المواعيد تبدأ باختيار التخصص ثم أسماء الدكاترة وأيام العمل. العرض قراءة فقط من جدول العمل الحالي ولا يحجز متابعة أو يضيف ساعات حضور غير مسجلة.

- قرار المالك 19/11/2026 (تقفيل اليوم): طرق الدفع كاش، انستاباي، فيزا، محفظة؛ التحويل يفضل للسجلات القديمة بس. «يومية النسبة» = أطباء التخصص وأطباء النسبة، «يومية المستأجرين» = أطباء المستأجرين، حسب الطبيب المسجل على الزيارة. الكاش بس هو اللي بيحرّك الدرج: الدرج = متبقي من حساب امس + كاش اليوم (شامل الإيراد الزيادة، ناقص الرد) − مصروفات الكاش. انستاباي وفيزا والمحفظة بتروح حسابات العيادة مباشرة. التقفيل مرة واحدة لكل يوم وبالترتيب؛ اللي ما اتبعتش للمالك يترحل لأول يوم يتقفل بعده. المالك بس يقدر يفتح آخر تقفيل. المرضى بيتعدوا بتاريخ الزيارة، والإيرادات بتاريخ التحصيل بتوقيت القاهرة.

- قرار المالك 19/11/2026 (تعديل التحصيل): التعديل مش بيمسح الإيصال. بيتعمل إيصال رد للإيصال الأصلي بالكامل، وبعده إيصال جديد بالمبلغ والطريقة الصح، في عملية واحدة ومعاها السبب في سجل التدقيق. الاتنين بتاريخ النهارده، فاليوم المتقفل مش بيتغير. المالك يعدّل أي إيصال؛ الاستقبال إيصال النهارده بس وقبل تقفيل اليوم.
- قرار المالك 19/11/2026 (إلغاء الحجز): الاختيارات استرداد كامل / رد جزئي / بدون استرداد، للمالك والاستقبال. الرد بيتعمل بنفس طريقة دفع الإيصال اللي بيترد (من الأحدث للأقدم)، وبتاريخ النهارده. الزيارة بتتلغي (void) والحجز يبقى ملغي، فمفيش رصيد على العميل ومفيش نسبة للدكتور (النسبة على الزيارات المكتملة بس)، ومش بتتحسب في مرضى تقفيل اليوم. المبلغ اللي اتحجز بيفضل إيراد للعيادة في يوم ما اتدفع. الرد الجزئي لازم يكون أقل من المدفوع، والإيراد الزيادة بيرجع بس في الاسترداد الكامل. زيارة مكتملة أو عليها فاتورة تأمين مينفعش تتلغي من هنا.

- قرار المالك 19/11/2026 (حذف حساب): الحساب مش بيتمسح من قاعدة البيانات لأن الإيصالات والمصروفات والسجلات بتشاور عليه. «حذف الحساب» = تعطيل (منع الدخول وقفل الجلسات) + إخفاء من القائمة، وينفع يرجع.
- قرار المالك 19/11/2026 (قوالب جديدة): القوالب الأساسية الأربعة فاضلة واحد لكل نوع رسالة. القوالب الجديدة قوالب إضافية لحملات العروض بمتغيرات {client_name} {offer} {code} بس، والاستقبال بيختار منها وقت الإرسال.
- قرار المالك 19/11/2026 (الموظفين): للمالك بس. المتبقي للموظف في الشهر = المرتب + المكافأة − السلف − الخصومات − اللي اتصرف. السلفة وصرف المرتب بيتسجلوا مصروف «أجور وعمالة» أوتوماتيك بطريقة الدفع المختارة (الكاش بيتخصم من الدرج)؛ الخصم والمكافأة مش فلوس بتخرج. مرتب الشهر = المرتب الحالي إلا لو المالك عدّل مرتب الشهر ده.
- قرار المالك 19/11/2026 (معمل الأسنان): للمالك والاستقبال. السعر = تكلفة المعمل على العيادة. الدفع للمعمل بيسجل مصروف «معمل أسنان»، وبعد الدفع السعر بيتقفل، والمالك بس يلغي الدفع. المريض يتختار من العملاء أو يتكتب اسمه.
