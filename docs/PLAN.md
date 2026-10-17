# Delivery checklist

## QA audit — 13/10/2026

- [x] Map existing routes, roles, RPCs and dependencies; verify authorized target and clean Git baseline.
- [x] Establish lint/typecheck/build and real database baseline (16 tests passed).
- [x] Run existing browser regression after installing its missing Chromium executable.
- [x] Verify cross-page financial and patient propagation, error handling, role security and responsive interactions.
- [x] Reproduce/fix confirmed defects, add regression tests, and complete final validation and audit report (`docs/qa-audit-report.md`); retain its explicitly documented coverage limits.

- [x] Perform owner's explicitly requested data cleanup, retain only the admin login and preserve catalog/pricing/settings with a private local backup.
- [x] Clarify doctor/reception account creation with email, owner-entered password and visibility toggle; verify without creating data after cleanup.
- [x] Publish the account form improvements and verify the live build `index-CYQ2a7eH.js`.

- [x] Allow additional services and quantities in both quick intake and returning-patient visit forms, with live totals and draft cancellation.
- [x] Verify multi-service atomicity, idempotency, cancellation and desktop/phone E2E; 16 money/database tests and all six browser journeys passed after updating the doctor field selector.
- [x] Publish the multi-service change and verify the live build `index-B9zO23lt.js`.

- [x] Calculate doctor entitlement from completed service prices after discount independently of collections; preserve stored rates and prevent double counting receipts.
- [x] Verify full E2E and desktop/phone screens for doctor entitlement; 16 database/money tests and all six browser journeys passed (role label assertion updated and rerun).
- [x] Publish the doctor entitlement change and verify the live build `index-zO3aOl_A.js`.

- [x] Default new visit forms to today's Cairo date while allowing manual changes; verify without creating records.

- [x] Show pending payer visits with customer, services and payer shares before invoice issuance; verify transition on completion.

## Payer account visibility

- [x] Show each insurer and union's total share prominently, including covered open visits and outstanding invoices.
- [x] Separate open-visit share from invoiced debt and settlements; keep settlement limited to issued invoices.
- [x] Verify the existing insurer's real balance, desktop/phone rendering, and browser accounting flow.
- [x] Publish the verified screen and check the live build.

## Card percentage at reception

- [x] Move patient share entry from insurer administration to each covered visit, and keep old financial snapshots.
- [x] Track syndicate share as a payer receivable with owner-only settlement.
- [x] Show a price and share preview, optional immediate receipt, and visit balances in reception views.
- [x] Keep a booking-only path for returning patients and record payer contact details for the owner.
- [x] Verify database and desktop/phone E2E, lint, typecheck, build and migration checksum.
- [x] Publish the tested change and verify the deployed build.

## Reception intake with service

- [x] Add a specialty-filtered service selector to quick customer intake while keeping the detailed flows.
- [x] Save customer, visit and selected service atomically with the existing idempotency key.
- [x] Apply the forward-only migration and test successful and rejected intake against the development database.
- [x] Verify desktop and phone screens, lint, typecheck and build.
- [x] Publish the tested change and verify the deployed build.

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
- [x] Anonymous one-time service-experience survey links with database-enforced owner-only results; survey requests use transactional-message consent and mock delivery.
- [x] Mock message provider, status logs and server-side opt-out recheck.
- [x] Daily Cairo birthday job and configurable follow-up job with retries/idempotency.
- [x] Audit money edits/voids; ensure no personal data in application logs.
- [x] Verify RLS for anonymous/reception/each doctor/owner, tampering and cross-doctor access.
- [x] Run database security/performance advisors and resolve applicable findings; leaked-password protection needs Pro.
- [x] Label demo seed and implement a command that archives only demo-owned records.

## Screens — run and review each at 1366x768 and phone width

- [x] Desk layout, role navigation and global name/phone/specialty-code search with keyboard support.
- [x] Secure login and loading/error/session expiry states.
- [x] Polish the login screen for desktop and phone; review screenshots and password visibility control.
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
- [x] Re-review all owner routes and key dialogs at desktop, phone and narrow-phone widths; expose hidden table columns and keep price inputs visible.
- [x] Review the customer survey and owner-only feedback screen at 1366×768 and 390×844.

## Acceptance

- [x] Test doctor percentage, per-service override, cash/insurance collections and working-day refusal/acceptance against the development database.
- [x] Use Family Care prices for new insurance charges and show the insurer/patient percentages; verify exact split and historical snapshots.
- [x] Put union administration next to insurance companies in one owner page while preserving union selection in reception.

- [x] تسجيل عميل وفتح زيارة في خطوة استقبال واحدة، مع حفظ ذري وتجربة كمبيوتر وهاتف.
- [x] إدارة النقابات من حساب المالك واختيار النقابة المشروط بنوع العميل؛ حفظ الانتساب في الملف والزيارة دون حذف البيانات القديمة.

- [x] إعداد دليل استخدام عربي يشرح الشاشات والصلاحيات ومسارات العمل والقيود الحالية.
- [x] تجهيز نسخة PDF عربية مصورة وجاهزة للطباعة، ومراجعة صفحاتها الثماني بصرياً.

- [x] Push Cloudflare Pages workflow to `main` and verify a successful automatic deployment of the existing `family-care` Pages project.

- [x] Fresh-clone `install → connect → migrate → seed → deploy → start` documented in README; only env filling is manual. Idempotent connection/migration/seed path rerun against the target.
- [x] Lint, typecheck and build pass without suppression; browser bundle contains no configured server credentials.
- [x] Money tests: totals/partial payments/co-pay/discount limits/offer redemption/bundles/gifts/deposits/home fee.
- [x] Doctor statement and rent tests, settlement allocation, refunds, rounding and concurrent payments.
- [x] Job tests: Cairo local dates, birthdays/leap days, follow-ups/rescheduling, consent and idempotency. Cron uses Cairo timezone rules through PostgreSQL.
- [x] E2E: create client → visit → services → partial payment → follow-up → reminder.
- [x] E2E: insurance split → ledger/settlement; birthday message; campaign preview and mock send.
- [x] E2E: doctor sees assigned client and statement, owner-only route denied; owner screens captured at desk and phone sizes.
- [x] Validate features in the running app against the new real development database.
- [x] Enter test data through the UI for catalog, doctor categories and rent, staff account, patient edit, follow-up actions, and audited payment/settlement reversals; archive demo batches after verification.
- [x] No TODO stubs, dead buttons, silent offline writes, public patient access or unlabelled active fake data.
- [x] Final short report: working features, run commands, assumptions to review and provider/pricing input.

## المصروفات — 13/10/2026
- [x] تسجيل مبلغ وسبب وبند ومستلم وطريقة وتاريخ للاستقبال.
- [x] إجمالي وتفصيل الفترة والبنود والتصدير والطباعة للمالك فقط.
- [x] إلغاء مسجل للمالك وصلاحيات قاعدة البيانات ومنع التكرار.
- [x] اختبار قاعدة متراجع واختبار واجهة حقيقي على الكمبيوتر والهاتف؛ الفحوص والبناء.

## الحساب المحصّل — 14/10/2026
- [x] عرض اسم مسجل التحصيل للأدمن في التقرير والزيارة وتصدير CSV باستخدام recorded_by.
- [x] التحقق من إيصال حقيقي على الموقع المنشور والكمبيوتر والهاتف.


## تسهيل التخصص والخدمة — 15/10/2026
- [x] أزرار واضحة وإضافة تخصص بالاسم وكود تلقائي وخيارات تخصيص.
- [x] حفظ الخدمة والسعر ذريًا في قوائم العملاء مع بقاء الخيارات المتقدمة.
- [x] منع تكرار الطلب وحماية الأسعار القديمة وصلاحية المالك واختبار قاعدة متراجع.
- [x] تجربة الواجهة على الكمبيوتر والهاتف والتحقق من النشر.


## اقتراحات التخصصات — 15/10/2026
- [x] بحث أسماء التخصصات وتجهيز قائمة وأكواد داخلية دون تسجيل تلقائي.
- [x] تعبئة الاسم والكود بالاختيار، بحث عربي وبالكود، منع التكرار والإدخال اليدوي.
- [x] تحقق تفرد وصلاحية 100 بادئة، وفحص متصفح على الكمبيوتر والهاتف بلا زيادة عدد التخصصات.
- [x] التحقق من نشر القائمة.


## تخصصات إعلان فاميلي كير — 15/10/2026
- [x] 14 اختيارًا من الصورة و«أخرى» لإضافة تخصص يدويًا دون تسجيل تلقائي.
- [x] التحقق من الكمبيوتر والهاتف والإدخال اليدوي والنشر.


## اختبار حمل محدود — 16/10/2026
- [x] اكتشاف البيئة والتحقق من حساب الاستقبال والمراقبة وتحديد النطاق وموافقة المالك.
- [x] تجهيز أداة محدودة بالوقت والمعدل والطلبات والإيقاف الطارئ؛ بلا كتابات بيانات.
- [x] تشغيل المراحل المسموح بها ومقارنة الموارد وصحة الخدمة وإصدار التقرير، مع توثيق عدم اكتمال التعافي وفقد عينة المراقبة.

## قياس سقف الأداء — 16/10/2026
- [x] فحص وجود بيئة مستقلة: الموجود مشروع الموقع الحالي فقط.
- [x] تجهيز خطة بيئة منفصلة وميزانية وحدود اختبار دون ادعاء السعة القصوى.
- [x] اعتمد المالك المجانية للبيئة المنفصلة ثم عدّل الهدف صراحة إلى البيئة الحالية؛ لا مشروع جديد أو ترقية.
- [x] اكتملت دورة حتى 100 طلب/ثانية والتعافي وفحص الصحة؛ السقف الحقيقي لم يظهر.
- [x] اعتماد وتنفيذ الدورة الإضافية حتى400 و100000 طلب؛ توقفت آليًا عند أخطاء نقل بمرحلة400، مع فحص التعافي والبيانات وتوثيق الحدود.

## تحسين الأداء — 16/10/2026
- [x] فصل كود الشاشات وتقليل حجم الدخول.
- [x] فهرسة البحث والأسماء وتجميع التحديثات مع دورة لاحقة للحفظ المتزامن.
- [x] lint/typecheck/build واختبارات الأداء والمال وفحص12 شاشة استقبال من البناء.
- [x] استكمال اختبارات المالك والأدوار بعد تحديث بيانات الدخول:24 اختبارًا وشاشات الأدمن على الكمبيوتر والهاتف نجحت.
- [x] نشر تحسينات الأداء والتحقق من22 عرض شاشة أدمن وغياب أخطاء التشغيل على الموقع.

## خدمات بعد التحصيل ومتابعة مدفوعة — 16/10/2026
- [x] اعتماد نوعي المتابعة: استكمال قديم أو خدمة جديدة.
- [x] إضافة ذرية قابلة لإعادة المحاولة بعد التحصيل دون تعديل سطور أو إيصالات سابقة؛ ضبط القرش والتأمين.
- [x] فاتورة محدثة ومتابعة مرتبطة بالحساب القديم أو زيارة جديدة، والتحصيل الجزئي بعد الإنهاء.
- [x] تحقق SQL متراجع وتجربة متصفح للرحلة كاملة على الكمبيوتر والهاتف.
- [x] نجحت25 حالة انحدار وفحوص الأمان والبناء، والنشر والرحلة الكاملة وطباعةPDF على الموقع.

## إخفاء العملاء — 16/10/2026
- [x] اعتماد الإخفاء مع حفظ التاريخ المالي وتنفيذ تعطيل العملاء النشطين مع تدقيق وفحص ثبات16 جدولًا.

## تصفير التشغيل — 17/10/2026
- [x] اعتماد المالك الاحتفاظ بالكتالوج والأسعار والأدمن مع حذف باقي التشغيل.
- [x] حذف البيانات المرتبطة في معاملة وحفظ بصمات الكتالوج، ثم حذف35 هوية والإبقاء على الأدمن.
- [x] تحقق الجداول والحراس ودخول الموقع والقائمة الفارغة دون زرع سجلات اختبار.
## نظام المتبقي والمتابعة بسعر — 17/10/2026
- [x] اعتماد الرسوم المستقلة كمبلغ كامل على العميل دون نسبة كارنيه.
- [x] ربط الاستكمال بالحساب الأصلي، وتثبيت سعر الموعد ونسخة الإيصال، وحماية الدخول قبل السداد على الخادم.
- [x] اختبارات SQL للمبالغ والهوية والتكرار وإعادة الجدولة، وتجربة الواجهة والـPDF والهاتف.
- [x] نجحت27 حالة مال وصلاحيات و4 رحلات متصفح، ثم النشر والتحقق من الرحلة الكاملة على الموقع.

## تنظيف تخصصات الاختبار — 18/10/2026
- [x] إزالة التسعة المحددة بالصورة وخدماتها وأسعارها التجريبية غير المرتبطة ماليًا، مع حفظ التخصصات والخدمات الحقيقية ومقارنة البصمات.
- [x] تحقق قراءة فقط من الكتالوج والقائمة على الموقع؛ الخيارات أسنان وباطنه فقط.

## الموبايل دون كتابة كود مصر — 18/10/2026
- [x] تحويل موحد لكل مسارات إضافة/تعديل الطبيب والعميل والتسجيل السريع، وحفظ حقيقي من الواجهة.
- [x] فحوص الهاتف والمال والأداء وlint/typecheck/build، وأرشفة بيانات التحقق.
- [x] نشر وتحقق من الموقع؛ البناء index-Bpmd4Mr3.js يحوّل الموبايل تلقائيًا قبل الإرسال.
