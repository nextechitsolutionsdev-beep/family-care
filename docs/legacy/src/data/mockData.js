// تخصصات فاميلي كير المستخرجة بدقة من هوية المركز الرسمية (Since 2019)
export const specialties = [
  { id: 1, name: "أسنان", nameEn: "Dentistry", icon: "fa-tooth", color: "#2ecc71", bg: "#eafaf1", doctors: 4, today: 16, desc: "علاج وجراحة الأسنان، زراعة، تقويم، طوارئ 24 ساعة وتخدير كلي" },
  { id: 2, name: "جلدية", nameEn: "Dermatology", icon: "fa-hand-dots", color: "#9b59b6", bg: "#f5eef8", doctors: 3, today: 11, desc: "أمراض الجلد والشعر والأظافر والفحص الدقيق" },
  { id: 3, name: "تجميل", nameEn: "Aesthetics & Cosmetic", icon: "fa-wand-magic-sparkles", color: "#e91e8c", bg: "#fce4ec", doctors: 2, today: 8, desc: "جلسات نضارة، فيلر، بوتوكس، خيوط، وتنسيق القوام" },
  { id: 4, name: "تغذية", nameEn: "Clinical Nutrition", icon: "fa-apple-whole", color: "#e67e22", bg: "#fef5e7", doctors: 2, today: 7, desc: "أنظمة علاج السمنة والنحافة وجلسات التخسيس وإنبادي InBody" },
  { id: 5, name: "نفسيه وعصبيه", nameEn: "Psychiatry & Neurology", icon: "fa-brain", color: "#8e44ad", bg: "#f4ecf7", doctors: 2, today: 5, desc: "علاج الاضطرابات النفسية وأمراض الجهاز العصبي والصداع المزمن" },
  { id: 6, name: "علاج طبيعي وحجامة", nameEn: "Physiotherapy & Cupping", icon: "fa-person-walking", color: "#00b894", bg: "#e6f9f5", doctors: 3, today: 14, desc: "تأهيل إصابات العظام والعمود الفقري، حجامة طبية، وإبر صينية" },
  { id: 7, name: "معمل تحاليل", nameEn: "Medical Laboratory", icon: "fa-flask-vial", color: "#d63031", bg: "#fdeaea", doctors: 2, today: 22, desc: "سحب عينات منزلي وداخل المركز، تحاليل شاملة وفورية بأحدث الأجهزة" },
  { id: 8, name: "أطفال وحديثي الولادة", nameEn: "Pediatrics & Neonatology", icon: "fa-baby", color: "#fd79a8", bg: "#fef0f5", doctors: 3, today: 18, desc: "متابعة النمو والتطعيمات ورعاية حديثي الولادة والمبتسرين" },
  { id: 9, name: "جراحة أطفال", nameEn: "Pediatric Surgery", icon: "fa-heart-circle-bolt", color: "#e74c3c", bg: "#fadbd8", doctors: 2, today: 4, desc: "جراحات الفتق، الطهارة، الخصية المعلقة، وجراحات الأطفال الدقيقة" },
  { id: 10, name: "جراحة أورام", nameEn: "Surgical Oncology", icon: "fa-ribbon", color: "#d35400", bg: "#fdf2e9", doctors: 1, today: 3, desc: "استئصال الأورام، جراحات الثدي والغدد، والمتابعة الدورية" },
  { id: 11, name: "نساء وتوليد وتاخر انجاب", nameEn: "Obstetrics, Gynecology & Fertility", icon: "fa-venus", color: "#e91e63", bg: "#fce4ec", doctors: 3, today: 15, desc: "متابعة الحمل بالسونار، الولادة، علاج تأخر الإنجاب وعمليات الحقن المجهري" },
  { id: 12, name: "قلب أطفال", nameEn: "Pediatric Cardiology", icon: "fa-heart-pulse", color: "#c0392b", bg: "#f9ebea", doctors: 2, today: 6, desc: "عيوب القلب الخلقية، إيكو قلب للأطفال، ورسم القلب" },
  { id: 13, name: "غدد صماء وسكر", nameEn: "Endocrinology & Diabetes", icon: "fa-droplet", color: "#0984e3", bg: "#ebf5fb", doctors: 2, today: 9, desc: "علاج السكر النوع الأول والثاني، اضطرابات الغدة الدرقية وهرمونات النمو" },
  { id: 14, name: "باطنه", nameEn: "Internal Medicine", icon: "fa-stethoscope", color: "#16a085", bg: "#e8f8f5", doctors: 3, today: 19, desc: "أمراض الجهاز الهضمي والكبد، الضغط، الكلى، والفحص الشامل" },
];

// خدمات داخل المركز
export const insideServices = [
  { id: "in-1", icon: "fa-tooth", label: "طوارئ أسنان 24 ساعة", color: "#2ecc71", fee: "250 ج.م" },
  { id: "in-2", icon: "fa-syringe", label: "تخدير كامل للأطفال والكبار لعمليات الأسنان", color: "#9b59b6", fee: "حسب العملية" },
  { id: "in-3", icon: "fa-dumbbell", label: "جلسات تخسيس وتفتيت دهون", color: "#e67e22", fee: "200 ج.م" },
  { id: "in-4", icon: "fa-circle-dot", label: "حجامة طبية وقائية وعلاجية", color: "#d63031", fee: "200 ج.م" },
  { id: "in-5", icon: "fa-arrows-to-dot", label: "إبر صينية صينية معتمدة", color: "#f39c12", fee: "180 ج.م" },
  { id: "in-6", icon: "fa-heart-pulse", label: "إيكو قلب دقيق (Echo)", color: "#e74c3c", fee: "350 ج.م" },
  { id: "in-7", icon: "fa-wave-square", label: "رسم قلب متقدم (ECG)", color: "#3498db", fee: "120 ج.م" },
  { id: "in-8", icon: "fa-radiation", label: "سونار بطن وحوض وحمل", color: "#fd79a8", fee: "250 ج.م" },
  { id: "in-9", icon: "fa-person-circle-check", label: "تحليل إنبادي InBody شامل لكتلة الجسم", color: "#00b894", fee: "100 ج.م" },
];

// خدمات خارج المركز (الرعاية والزيارات المنزلية)
export const outsideServices = [
  { id: "out-1", icon: "fa-house-medical", label: "زيارات منزلية لاستشاريين في كل التخصصات", color: "#2ecc71", fee: "من 400 ج.م" },
  { id: "out-2", icon: "fa-droplet", label: "سحب عينات دم من المنزل", color: "#e74c3c", fee: "100 ج.م" },
  { id: "out-3", icon: "fa-syringe", label: "تركيب كانيولا ومحاليل وريدية", color: "#9b59b6", fee: "120 ج.م" },
  { id: "out-4", icon: "fa-gauge-high", label: "قياس ضغط الدم ومتابعة العلامات الحيوية", color: "#3498db", fee: "80 ج.م" },
  { id: "out-5", icon: "fa-cubes-stacked", label: "قياس سكر تراكمي وعشوائي بالمنزل", color: "#f39c12", fee: "80 ج.م" },
  { id: "out-6", icon: "fa-hand-holding-medical", label: "إعطاء حقن عضل ووريد تحت إشراف طبي", color: "#1abc9c", fee: "60 ج.م" },
  { id: "out-7", icon: "fa-person-walking-with-cane", label: "جلسات علاج طبيعي وتأهيل منزلي", color: "#fd79a8", fee: "300 ج.م" },
  { id: "out-8", icon: "fa-house-user", label: "حجامة طبية منزلية معقمة", color: "#d63031", fee: "250 ج.م" },
  { id: "out-9", icon: "fa-wave-square", label: "رسم قلب منزلي متنقل (ECG)", color: "#667eea", fee: "250 ج.م" },
  { id: "out-10", icon: "fa-tooth", label: "أطباء أسنان متنقلين لعلاج كبار السن بالمنزل", color: "#00b894", fee: "من 450 ج.م" },
];

export const doctors = [
  { id: 1, name: "د. أحمد كمال الدين", specialty: "باطنه", specId: 14, phone: "01001234501", email: "dr.ahmed@fcmc.com", experience: 14, available: true, rating: 4.9, patients: 450, appointments: 32, fee: 200, schedule: ["السبت", "الاثنين", "الأربعاء"] },
  { id: 2, name: "د. مريم حسام حسن", specialty: "أسنان", specId: 1, phone: "01112345602", email: "dr.mariam@fcmc.com", experience: 9, available: true, rating: 4.95, patients: 380, appointments: 40, fee: 250, schedule: ["الأحد", "الثلاثاء", "الخميس"] },
  { id: 3, name: "د. نورهان سعيد الشريف", specialty: "جلدية", specId: 2, phone: "01223456703", email: "dr.nourhan@fcmc.com", experience: 8, available: true, rating: 4.8, patients: 290, appointments: 26, fee: 220, schedule: ["السبت", "الاثنين", "الخميس"] },
  { id: 4, name: "د. ريم مصطفى خليل", specialty: "تجميل", specId: 3, phone: "01098765404", email: "dr.reem@fcmc.com", experience: 11, available: true, rating: 4.9, patients: 310, appointments: 24, fee: 350, schedule: ["الأحد", "الأربعاء"] },
  { id: 5, name: "د. كريم سامح الجزار", specialty: "تغذية", specId: 4, phone: "01554321005", email: "dr.karim@fcmc.com", experience: 7, available: true, rating: 4.7, patients: 220, appointments: 19, fee: 180, schedule: ["السبت", "الثلاثاء"] },
  { id: 6, name: "د. محمود عبد العزيز", specialty: "نفسيه وعصبيه", specId: 5, phone: "01023456706", email: "dr.mahmoud@fcmc.com", experience: 15, available: false, rating: 4.85, patients: 275, appointments: 15, fee: 300, schedule: ["الاثنين", "الأربعاء"] },
  { id: 7, name: "د. هبة طارق البنا", specialty: "علاج طبيعي وحجامة", specId: 6, phone: "01123456707", email: "dr.heba@fcmc.com", experience: 10, available: true, rating: 4.9, patients: 340, appointments: 35, fee: 200, schedule: ["السبت", "الأحد", "الثلاثاء", "الخميس"] },
  { id: 8, name: "د. سارة عادل فؤاد", specialty: "أطفال وحديثي الولادة", specId: 8, phone: "01234567808", email: "dr.sara@fcmc.com", experience: 12, available: true, rating: 5.0, patients: 520, appointments: 48, fee: 200, schedule: ["السبت", "الأحد", "الاثنين", "الأربعاء"] },
  { id: 9, name: "د. ماجد وفيق رستم", specialty: "جراحة أطفال", specId: 9, phone: "01011122309", email: "dr.maged@fcmc.com", experience: 16, available: true, rating: 4.9, patients: 180, appointments: 12, fee: 350, schedule: ["الثلاثاء", "الخميس"] },
  { id: 10, name: "د. طارق جلال الدين", specialty: "جراحة أورام", specId: 10, phone: "01022233410", email: "dr.tarek@fcmc.com", experience: 18, available: true, rating: 4.95, patients: 150, appointments: 10, fee: 400, schedule: ["الأحد", "الأربعاء"] },
  { id: 11, name: "د. شيرين محمد رضوان", specialty: "نساء وتوليد وتاخر انجاب", specId: 11, phone: "01133344511", email: "dr.shireen@fcmc.com", experience: 13, available: true, rating: 4.9, patients: 410, appointments: 38, fee: 250, schedule: ["السبت", "الاثنين", "الخميس"] },
  { id: 12, name: "د. باهر وجيه يوسف", specialty: "قلب أطفال", specId: 12, phone: "01244455612", email: "dr.baher@fcmc.com", experience: 14, available: true, rating: 4.85, patients: 190, appointments: 16, fee: 350, schedule: ["الأحد", "الثلاثاء"] },
  { id: 13, name: "د. منال إبراهيم شكري", specialty: "غدد صماء وسكر", specId: 13, phone: "01055566713", email: "dr.manal@fcmc.com", experience: 12, available: true, rating: 4.8, patients: 260, appointments: 22, fee: 250, schedule: ["الاثنين", "الأربعاء"] },
  { id: 14, name: "د. سامح وجدي", specialty: "معمل تحاليل", specId: 7, phone: "01166677814", email: "lab@fcmc.com", experience: 11, available: true, rating: 4.9, patients: 600, appointments: 55, fee: 100, schedule: ["يومياً"] },
];

export const patients = [
  { id: 1, name: "علي محمود حسن", age: 46, phone: "01001112233", email: "ali.hassan@gmail.com", gender: "ذكر", bloodType: "A+", lastVisit: "2026-10-02", totalVisits: 14, specialty: "باطنه", status: "مستمر", notes: "مريض ضغط وسكر، يتابع دورياً" },
  { id: 2, name: "فاطمة أحمد علي", age: 31, phone: "01112223344", email: "fatma.ali@yahoo.com", gender: "أنثى", bloodType: "O+", lastVisit: "2026-10-01", totalVisits: 6, specialty: "نساء وتوليد وتاخر انجاب", status: "جديد", notes: "متابعة حمل بالشهر السادس" },
  { id: 3, name: "يوسف خالد سعيد", age: 7, phone: "01223334455", email: "khaled.parent@gmail.com", gender: "ذكر", bloodType: "B+", lastVisit: "2026-10-02", totalVisits: 9, specialty: "أطفال وحديثي الولادة", status: "مستمر", notes: "حساسية صدرية ومتابعة وقائية" },
  { id: 4, name: "سلوى إبراهيم النجار", age: 58, phone: "01004445566", email: "salwa.n@gmail.com", gender: "أنثى", bloodType: "AB-", lastVisit: "2026-09-29", totalVisits: 24, specialty: "غدد صماء وسكر", status: "مزمن", notes: "سكر نوع ثاني وقدم سكري" },
  { id: 5, name: "كريم عبد الرحمن فهمي", age: 29, phone: "01556667788", email: "karim.fahmy@outlook.com", gender: "ذكر", bloodType: "O-", lastVisit: "2026-10-02", totalVisits: 3, specialty: "أسنان", status: "جديد", notes: "تنظيف جير وتركيب زيركون" },
  { id: 6, name: "هدى مصطفى صادق", age: 38, phone: "01007778899", email: "hoda.sadek@gmail.com", gender: "أنثى", bloodType: "A-", lastVisit: "2026-09-25", totalVisits: 16, specialty: "جلدية", status: "مستمر", notes: "جلسات علاج تساقط شعر وبلازما" },
  { id: 7, name: "عمر فتحي عبد الله", age: 64, phone: "01118889900", email: "omar.fathi@gmail.com", gender: "ذكر", bloodType: "B-", lastVisit: "2026-09-20", totalVisits: 31, specialty: "علاج طبيعي وحجامة", status: "مزمن", notes: "انزلاق غضروفي قطني، علاج طبيعي منزلي" },
  { id: 8, name: "منى سامي زكي", age: 26, phone: "01229990011", email: "mona.sami@gmail.com", gender: "أنثى", bloodType: "A+", lastVisit: "2026-10-02", totalVisits: 4, specialty: "تجميل", status: "جديد", notes: "جلسات هيدرافيشل وديرمابن" },
  { id: 9, name: "يحيى عاطف خيري", age: 39, phone: "01001239876", email: "yahia.atef@gmail.com", gender: "ذكر", bloodType: "O+", lastVisit: "2026-09-30", totalVisits: 8, specialty: "نفسيه وعصبيه", status: "مستمر", notes: "علاج القلق واضطرابات النوم" },
  { id: 10, name: "ريهام سعد العسقلاني", age: 34, phone: "01119876543", email: "reham.saad@gmail.com", gender: "أنثى", bloodType: "AB+", lastVisit: "2026-10-01", totalVisits: 2, specialty: "تغذية", status: "جديد", notes: "تغذية علاجية وجلسات كافيتيشن" },
  { id: 11, name: "حسين كمال بدر", age: 52, phone: "01237894561", email: "hussein.badr@gmail.com", gender: "ذكر", bloodType: "O+", lastVisit: "2026-10-02", totalVisits: 5, specialty: "معمل تحاليل", status: "مستمر", notes: "تحليل سكر تراكمي ووظائف كلى وكبد" },
  { id: 12, name: "الطفل آدم إبراهيم", age: 3, phone: "01006543219", email: "adam.mom@gmail.com", gender: "ذكر", bloodType: "A+", lastVisit: "2026-10-02", totalVisits: 7, specialty: "قلب أطفال", status: "مستمر", notes: "متابعة إيكو دورية لصمامات القلب" },
];

export const appointments = [
  { id: 1, patient: "علي محمود حسن", doctor: "د. أحمد كمال الدين", specialty: "باطنه", date: "2026-10-03", time: "09:30", status: "مؤكد", type: "كشف", fee: 200, location: "داخل المركز", payment: "مدفوع" },
  { id: 2, patient: "فاطمة أحمد علي", doctor: "د. شيرين محمد رضوان", specialty: "نساء وتوليد وتاخر انجاب", date: "2026-10-03", time: "10:30", status: "جاري", type: "سونار", fee: 350, location: "داخل المركز", payment: "مدفوع" },
  { id: 3, patient: "يوسف خالد سعيد", doctor: "د. سارة عادل فؤاد", specialty: "أطفال وحديثي الولادة", date: "2026-10-03", time: "11:30", status: "مؤكد", type: "كشف", fee: 200, location: "داخل المركز", payment: "مدفوع" },
  { id: 4, patient: "عمر فتحي عبد الله", doctor: "د. هبة طارق البنا", specialty: "علاج طبيعي وحجامة", date: "2026-10-03", time: "13:00", status: "مؤكد", type: "منزلي", fee: 300, location: "خدمة منزلية", payment: "مؤجل" },
  { id: 5, patient: "كريم عبد الرحمن فهمي", doctor: "د. مريم حسام حسن", specialty: "أسنان", date: "2026-10-03", time: "14:30", status: "انتظار", type: "علاج", fee: 500, location: "داخل المركز", payment: "مدفوع" },
  { id: 6, patient: "سلوى إبراهيم النجار", doctor: "د. منال إبراهيم شكري", specialty: "غدد صماء وسكر", date: "2026-10-03", time: "16:00", status: "انتظار", type: "متابعة", fee: 180, location: "داخل المركز", payment: "مؤجل" },
  { id: 7, patient: "هدى مصطفى صادق", doctor: "د. نورهان سعيد الشريف", specialty: "جلدية", date: "2026-10-04", time: "10:00", status: "مؤكد", type: "جلسة", fee: 300, location: "داخل المركز", payment: "مدفوع" },
  { id: 8, patient: "منى سامي زكي", doctor: "د. ريم مصطفى خليل", specialty: "تجميل", date: "2026-10-04", time: "11:30", status: "مؤكد", type: "كشف", fee: 350, location: "داخل المركز", payment: "مدفوع" },
  { id: 9, patient: "يحيى عاطف خيري", doctor: "د. محمود عبد العزيز", specialty: "نفسيه وعصبيه", date: "2026-10-04", time: "13:30", status: "انتظار", type: "استشارة", fee: 300, location: "داخل المركز", payment: "مؤجل" },
  { id: 10, patient: "ريهام سعد العسقلاني", doctor: "د. كريم سامح الجزار", specialty: "تغذية", date: "2026-10-05", time: "11:00", status: "مؤكد", type: "جلسة", fee: 200, location: "داخل المركز", payment: "مدفوع" },
  { id: 11, patient: "الطفل آدم إبراهيم", doctor: "د. باهر وجيه يوسف", specialty: "قلب أطفال", date: "2026-10-05", time: "12:30", status: "مؤكد", type: "إيكو", fee: 400, location: "داخل المركز", payment: "مدفوع" },
  { id: 12, patient: "حسين كمال بدر", doctor: "د. سامح وجدي", specialty: "معمل تحاليل", date: "2026-10-05", time: "09:00", status: "مكتمل", type: "تحاليل", fee: 280, location: "خدمة منزلية", payment: "مدفوع" },
  { id: 13, patient: "علي محمود حسن", doctor: "د. أحمد كمال الدين", specialty: "باطنه", date: "2026-10-06", time: "10:00", status: "ملغي", type: "متابعة", fee: 150, location: "داخل المركز", payment: "مؤجل" },
];

export const monthlyData = [
  { month: "يناير", appointments: 230, revenue: 48000, newPatients: 52 },
  { month: "فبراير", appointments: 215, revenue: 44500, newPatients: 46 },
  { month: "مارس", appointments: 260, revenue: 56000, newPatients: 62 },
  { month: "أبريل", appointments: 240, revenue: 51000, newPatients: 55 },
  { month: "مايو", appointments: 285, revenue: 62500, newPatients: 74 },
  { month: "يونيو", appointments: 270, revenue: 59000, newPatients: 68 },
  { month: "يوليو", appointments: 220, revenue: 47000, newPatients: 49 },
  { month: "أغسطس", appointments: 245, revenue: 53500, newPatients: 58 },
  { month: "سبتمبر", appointments: 295, revenue: 68000, newPatients: 82 },
  { month: "أكتوبر", appointments: 165, revenue: 38500, newPatients: 41 },
];

export const todayTimeline = [
  { time: "09:30", patient: "علي محمود حسن", doctor: "د. أحمد كمال", specialty: "باطنه", status: "مكتمل", fee: 200 },
  { time: "10:30", patient: "فاطمة أحمد علي", doctor: "د. شيرين رضوان", specialty: "نساء وتوليد", status: "جاري", fee: 350 },
  { time: "11:30", patient: "يوسف خالد سعيد", doctor: "د. سارة عادل", specialty: "أطفال", status: "انتظار", fee: 200 },
  { time: "13:00", patient: "عمر فتحي", doctor: "د. هبة طارق", specialty: "علاج طبيعي", status: "انتظار", fee: 300 },
  { time: "14:30", patient: "كريم عبد الرحمن", doctor: "د. مريم حسام", specialty: "أسنان", status: "انتظار", fee: 500 },
  { time: "16:00", patient: "سلوى إبراهيم", doctor: "د. منال إبراهيم", specialty: "غدد وسكر", status: "انتظار", fee: 180 },
];