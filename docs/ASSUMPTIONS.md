# Assumptions and owner review

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
