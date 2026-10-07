-- ========================================================
-- Family Care Medical Center - Database Schema & Seed Data
-- مركز فاميلي كير الطبي المتكامل ~ Since 2019
-- الخط الساخن: 01001695023
-- ========================================================

-- 1. جدول التخصصات الطبية (14 تخصص)
CREATE TABLE IF NOT EXISTS public.specialties (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    name_en TEXT,
    icon TEXT,
    color TEXT,
    bg TEXT,
    doctors_count INT DEFAULT 0,
    today_count INT DEFAULT 0,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. جدول الأطباء والاستشاريين
CREATE TABLE IF NOT EXISTS public.doctors (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    specialty TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    experience INT DEFAULT 5,
    fee NUMERIC DEFAULT 200,
    available BOOLEAN DEFAULT true,
    rating NUMERIC(3,2) DEFAULT 4.85,
    patients_count INT DEFAULT 0,
    appointments_count INT DEFAULT 0,
    schedule JSONB DEFAULT '["السبت", "الاثنين", "الأربعاء"]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. جدول المرضى والملفات الطبية
CREATE TABLE IF NOT EXISTS public.patients (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    age INT,
    phone TEXT NOT NULL,
    email TEXT,
    gender TEXT DEFAULT 'ذكر',
    blood_type TEXT DEFAULT 'O+',
    specialty TEXT,
    status TEXT DEFAULT 'جديد', -- 'جديد' | 'مستمر' | 'مزمن'
    notes TEXT,
    last_visit DATE DEFAULT CURRENT_DATE,
    total_visits INT DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. جدول المواعيد والحجوزات (كشوفات وزيارات منزلية)
CREATE TABLE IF NOT EXISTS public.appointments (
    id SERIAL PRIMARY KEY,
    patient_name TEXT NOT NULL,
    doctor_name TEXT NOT NULL,
    specialty TEXT NOT NULL,
    appointment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    appointment_time TEXT NOT NULL,
    status TEXT DEFAULT 'مؤكد', -- 'مؤكد' | 'جاري' | 'انتظار' | 'مكتمل' | 'ملغي'
    type TEXT DEFAULT 'كشف', -- 'كشف' | 'متابعة' | 'استشارة' | 'جلسة' | 'سونار' | 'تحاليل' | 'منزلي' | 'طوارئ'
    location TEXT DEFAULT 'داخل المركز', -- 'داخل المركز' | 'خدمة منزلية'
    payment_status TEXT DEFAULT 'مدفوع', -- 'مدفوع' | 'مؤجل'
    fee NUMERIC DEFAULT 200,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. جدول الخدمات الداخلية والمنزلية
CREATE TABLE IF NOT EXISTS public.clinic_services (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL, -- 'inside' (داخل المركز) أو 'outside' (زيارات منزلية)
    label TEXT NOT NULL,
    icon TEXT,
    color TEXT,
    fee TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ========================================================
-- تفعيل الحماية وصلاحيات القراءة والكتابة (Row Level Security)
-- ========================================================
ALTER TABLE public.specialties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinic_services ENABLE ROW LEVEL SECURITY;

-- سياسات عامة للوصول (Public Access للـ Anon Key)
DO $$ 
BEGIN
    DROP POLICY IF EXISTS "Public access specialties" ON public.specialties;
    DROP POLICY IF EXISTS "Public access doctors" ON public.doctors;
    DROP POLICY IF EXISTS "Public access patients" ON public.patients;
    DROP POLICY IF EXISTS "Public access appointments" ON public.appointments;
    DROP POLICY IF EXISTS "Public access clinic_services" ON public.clinic_services;
END $$;

CREATE POLICY "Public access specialties" ON public.specialties FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access doctors" ON public.doctors FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access patients" ON public.patients FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access appointments" ON public.appointments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access clinic_services" ON public.clinic_services FOR ALL USING (true) WITH CHECK (true);

-- ========================================================
-- البيانات التأسيسية للمركز (Seed Data)
-- ========================================================

-- إدخال الـ 14 تخصصاً طبياً
INSERT INTO public.specialties (id, name, name_en, icon, color, bg, doctors_count, today_count, description)
VALUES
(1, 'أسنان', 'Dentistry', 'fa-tooth', '#2ecc71', '#eafaf1', 4, 16, 'علاج وجراحة الأسنان، زراعة، تقويم، طوارئ 24 ساعة وتخدير كلي'),
(2, 'جلدية', 'Dermatology', 'fa-hand-dots', '#9b59b6', '#f5eef8', 3, 11, 'أمراض الجلد والشعر والأظافر والفحص الدقيق'),
(3, 'تجميل', 'Aesthetics & Cosmetic', 'fa-wand-magic-sparkles', '#e91e8c', '#fce4ec', 2, 8, 'جلسات نضارة، فيلر، بوتوكس، خيوط، وتنسيق القوام'),
(4, 'تغذية', 'Clinical Nutrition', 'fa-apple-whole', '#e67e22', '#fef5e7', 2, 7, 'أنظمة علاج السمنة والنحافة وجلسات التخسيس وإنبادي InBody'),
(5, 'نفسيه وعصبيه', 'Psychiatry & Neurology', 'fa-brain', '#8e44ad', '#f4ecf7', 2, 5, 'علاج الاضطرابات النفسية وأمراض الجهاز العصبي والصداع المزمن'),
(6, 'علاج طبيعي وحجامة', 'Physiotherapy & Cupping', 'fa-person-walking', '#00b894', '#e6f9f5', 3, 14, 'تأهيل إصابات العظام والعمود الفقري، حجامة طبية، وإبر صينية'),
(7, 'معمل تحاليل', 'Medical Laboratory', 'fa-flask-vial', '#d63031', '#fdeaea', 2, 22, 'سحب عينات منزلي وداخل المركز، تحاليل شاملة وفورية بأحدث الأجهزة'),
(8, 'أطفال وحديثي الولادة', 'Pediatrics & Neonatology', 'fa-baby', '#fd79a8', '#fef0f5', 3, 18, 'متابعة النمو والتطعيمات ورعاية حديثي الولادة والمبتسرين'),
(9, 'جراحة أطفال', 'Pediatric Surgery', 'fa-heart-circle-bolt', '#e74c3c', '#fadbd8', 2, 4, 'جراحات الفتق، الطهارة، الخصية المعلقة، وجراحات الأطفال الدقيقة'),
(10, 'جراحة أورام', 'Surgical Oncology', 'fa-ribbon', '#d35400', '#fdf2e9', 1, 3, 'استئصال الأورام، جراحات الثدي والغدد، والمتابعة الدورية'),
(11, 'نساء وتوليد وتاخر انجاب', 'Obstetrics, Gynecology & Fertility', 'fa-venus', '#e91e63', '#fce4ec', 3, 15, 'متابعة الحمل بالسونار، الولادة، علاج تأخر الإنجاب وعمليات الحقن المجهري'),
(12, 'قلب أطفال', 'Pediatric Cardiology', 'fa-heart-pulse', '#c0392b', '#f9ebea', 2, 6, 'عيوب القلب الخلقية، إيكو قلب للأطفال، ورسم القلب'),
(13, 'غدد صماء وسكر', 'Endocrinology & Diabetes', 'fa-droplet', '#0984e3', '#ebf5fb', 2, 9, 'علاج السكر النوع الأول والثاني، اضطرابات الغدة الدرقية وهرمونات النمو'),
(14, 'باطنه', 'Internal Medicine', 'fa-stethoscope', '#16a085', '#e8f8f5', 3, 19, 'أمراض الجهاز الهضمي والكبد، الضغط، الكلى، والفحص الشامل')
ON CONFLICT (id) DO NOTHING;

-- إدخال الأطباء
INSERT INTO public.doctors (id, name, specialty, phone, email, experience, fee, available, rating, patients_count, appointments_count, schedule)
VALUES
(1, 'د. أحمد كمال الدين', 'باطنه', '01001234501', 'dr.ahmed@fcmc.com', 14, 200, true, 4.90, 450, 32, '["السبت", "الاثنين", "الأربعاء"]'::jsonb),
(2, 'د. مريم حسام حسن', 'أسنان', '01112345602', 'dr.mariam@fcmc.com', 9, 250, true, 4.95, 380, 40, '["الأحد", "الثلاثاء", "الخميس"]'::jsonb),
(3, 'د. نورهان سعيد الشريف', 'جلدية', '01223456703', 'dr.nourhan@fcmc.com', 8, 220, true, 4.80, 290, 26, '["السبت", "الاثنين", "الخميس"]'::jsonb),
(4, 'د. ريم مصطفى خليل', 'تجميل', '01098765404', 'dr.reem@fcmc.com', 11, 350, true, 4.90, 310, 24, '["الأحد", "الأربعاء"]'::jsonb),
(5, 'د. كريم سامح الجزار', 'تغذية', '01554321005', 'dr.karim@fcmc.com', 7, 180, true, 4.70, 220, 19, '["السبت", "الثلاثاء"]'::jsonb),
(6, 'د. محمود عبد العزيز', 'نفسيه وعصبيه', '01023456706', 'dr.mahmoud@fcmc.com', 15, 300, false, 4.85, 275, 15, '["الاثنين", "الأربعاء"]'::jsonb),
(7, 'د. هبة طارق البنا', 'علاج طبيعي وحجامة', '01123456707', 'dr.heba@fcmc.com', 10, 200, true, 4.90, 340, 35, '["السبت", "الأحد", "الثلاثاء", "الخميس"]'::jsonb),
(8, 'د. سارة عادل فؤاد', 'أطفال وحديثي الولادة', '01234567808', 'dr.sara@fcmc.com', 12, 200, true, 5.00, 520, 48, '["السبت", "الأحد", "الاثنين", "الأربعاء"]'::jsonb),
(9, 'د. ماجد وفيق رستم', 'جراحة أطفال', '01011122309', 'dr.maged@fcmc.com', 16, 350, true, 4.90, 180, 12, '["الثلاثاء", "الخميس"]'::jsonb),
(10, 'د. طارق جلال الدين', 'جراحة أورام', '01022233410', 'dr.tarek@fcmc.com', 18, 400, true, 4.95, 150, 10, '["الأحد", "الأربعاء"]'::jsonb),
(11, 'د. شيرين محمد رضوان', 'نساء وتوليد وتاخر انجاب', '01133344511', 'dr.shireen@fcmc.com', 13, 250, true, 4.90, 410, 38, '["السبت", "الاثنين", "الخميس"]'::jsonb),
(12, 'د. باهر وجيه يوسف', 'قلب أطفال', '01244455612', 'dr.baher@fcmc.com', 14, 350, true, 4.85, 190, 16, '["الأحد", "الثلاثاء"]'::jsonb),
(13, 'د. منال إبراهيم شكري', 'غدد صماء وسكر', '01055566713', 'dr.manal@fcmc.com', 12, 250, true, 4.80, 260, 22, '["الاثنين", "الأربعاء"]'::jsonb),
(14, 'د. سامح وجدي', 'معمل تحاليل', '01166677814', 'lab@fcmc.com', 11, 100, true, 4.90, 600, 55, '["يومياً"]'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- إدخال المرضى
INSERT INTO public.patients (id, name, age, phone, email, gender, blood_type, specialty, status, notes, last_visit, total_visits)
VALUES
(1, 'علي محمود حسن', 46, '01001112233', 'ali.hassan@gmail.com', 'ذكر', 'A+', 'باطنه', 'مستمر', 'مريض ضغط وسكر، يتابع دورياً', CURRENT_DATE, 14),
(2, 'فاطمة أحمد علي', 31, '01112223344', 'fatma.ali@yahoo.com', 'أنثى', 'O+', 'نساء وتوليد وتاخر انجاب', 'جديد', 'متابعة حمل بالشهر السادس', CURRENT_DATE, 6),
(3, 'يوسف خالد سعيد', 7, '01223334455', 'khaled.parent@gmail.com', 'ذكر', 'B+', 'أطفال وحديثي الولادة', 'مستمر', 'حساسية صدرية ومتابعة وقائية', CURRENT_DATE, 9),
(4, 'سلوى إبراهيم النجار', 58, '01004445566', 'salwa.n@gmail.com', 'أنثى', 'AB-', 'غدد صماء وسكر', 'مزمن', 'سكر نوع ثاني وقدم سكري', CURRENT_DATE, 24),
(5, 'كريم عبد الرحمن فهمي', 29, '01556667788', 'karim.fahmy@outlook.com', 'ذكر', 'O-', 'أسنان', 'جديد', 'تنظيف جير وتركيب زيركون', CURRENT_DATE, 3),
(6, 'هدى مصطفى صادق', 38, '01007778899', 'hoda.sadek@gmail.com', 'أنثى', 'A-', 'جلدية', 'مستمر', 'جلسات علاج تساقط شعر وبلازما', CURRENT_DATE, 16),
(7, 'عمر فتحي عبد الله', 64, '01118889900', 'omar.fathi@gmail.com', 'ذكر', 'B-', 'علاج طبيعي وحجامة', 'مزمن', 'انزلاق غضروفي قطني، علاج طبيعي منزلي', CURRENT_DATE, 31),
(8, 'منى سامي زكي', 26, '01229990011', 'mona.sami@gmail.com', 'أنثى', 'A+', 'تجميل', 'جديد', 'جلسات هيدرافيشل وديرمابن', CURRENT_DATE, 4)
ON CONFLICT (id) DO NOTHING;

-- إدخال المواعيد
INSERT INTO public.appointments (id, patient_name, doctor_name, specialty, appointment_date, appointment_time, status, type, location, payment_status, fee, notes)
VALUES
(1, 'علي محمود حسن', 'د. أحمد كمال الدين', 'باطنه', CURRENT_DATE, '09:30', 'مؤكد', 'كشف', 'داخل المركز', 'مدفوع', 200, 'فحص ضغط وسكر'),
(2, 'فاطمة أحمد علي', 'د. شيرين محمد رضوان', 'نساء وتوليد وتاخر انجاب', CURRENT_DATE, '10:30', 'جاري', 'سونار', 'داخل المركز', 'مدفوع', 350, 'سونار متابعة حمل'),
(3, 'يوسف خالد سعيد', 'د. سارة عادل فؤاد', 'أطفال وحديثي الولادة', CURRENT_DATE, '11:30', 'مؤكد', 'كشف', 'داخل المركز', 'مدفوع', 200, 'كشف أطفال'),
(4, 'عمر فتحي عبد الله', 'د. هبة طارق البنا', 'علاج طبيعي وحجامة', CURRENT_DATE, '13:00', 'مؤكد', 'منزلي', 'خدمة منزلية', 'مؤجل', 300, 'جلسة علاج طبيعي منزلي'),
(5, 'كريم عبد الرحمن فهمي', 'د. مريم حسام حسن', 'أسنان', CURRENT_DATE, '14:30', 'انتظار', 'علاج', 'داخل المركز', 'مدفوع', 500, 'حشو عصب وتجميل'),
(6, 'سلوى إبراهيم النجار', 'د. منال إبراهيم شكري', 'غدد صماء وسكر', CURRENT_DATE, '16:00', 'انتظار', 'متابعة', 'داخل المركز', 'مؤجل', 180, 'متابعة تحليل السكر')
ON CONFLICT (id) DO NOTHING;

-- إدخال الخدمات داخل وخارج المركز
INSERT INTO public.clinic_services (id, category, label, icon, color, fee)
VALUES
('in-1', 'inside', 'طوارئ أسنان 24 ساعة', 'fa-tooth', '#2ecc71', '250 ج.م'),
('in-2', 'inside', 'تخدير كامل للأطفال والكبار لعمليات الأسنان', 'fa-syringe', '#9b59b6', 'حسب العملية'),
('in-3', 'inside', 'جلسات تخسيس وتفتيت دهون', 'fa-dumbbell', '#e67e22', '200 ج.م'),
('in-4', 'inside', 'حجامة طبية وقائية وعلاجية', 'fa-circle-dot', '#d63031', '200 ج.م'),
('in-5', 'inside', 'إبر صينية صينية معتمدة', 'fa-arrows-to-dot', '#f39c12', '180 ج.م'),
('in-6', 'inside', 'إيكو قلب دقيق (Echo)', 'fa-heart-pulse', '#e74c3c', '350 ج.م'),
('in-7', 'inside', 'رسم قلب متقدم (ECG)', 'fa-wave-square', '#3498db', '120 ج.م'),
('in-8', 'inside', 'سونار بطن وحوض وحمل', 'fa-radiation', '#fd79a8', '250 ج.م'),
('in-9', 'inside', 'تحليل إنبادي InBody شامل لكتلة الجسم', 'fa-person-circle-check', '#00b894', '100 ج.م'),
('out-1', 'outside', 'زيارات منزلية لاستشاريين في كل التخصصات', 'fa-house-medical', '#2ecc71', 'من 400 ج.م'),
('out-2', 'outside', 'سحب عينات دم من المنزل', 'fa-droplet', '#e74c3c', '100 ج.م'),
('out-3', 'outside', 'تركيب كانيولا ومحاليل وريدية', 'fa-syringe', '#9b59b6', '120 ج.م'),
('out-4', 'outside', 'قياس ضغط الدم ومتابعة العلامات الحيوية', 'fa-gauge-high', '#3498db', '80 ج.م'),
('out-5', 'outside', 'قياس سكر تراكمي وعشوائي بالمنزل', 'fa-cubes-stacked', '#f39c12', '80 ج.م'),
('out-6', 'outside', 'إعطاء حقن عضل ووريد تحت إشراف طبي', 'fa-hand-holding-medical', '#1abc9c', '60 ج.م'),
('out-7', 'outside', 'جلسات علاج طبيعي وتأهيل منزلي', 'fa-person-walking-with-cane', '#fd79a8', '300 ج.م'),
('out-8', 'outside', 'حجامة طبية منزلية معقمة', 'fa-house-user', '#d63031', '250 ج.م'),
('out-9', 'outside', 'رسم قلب منزلي متنقل (ECG)', 'fa-wave-square', '#667eea', '250 ج.م'),
('out-10', 'outside', 'أطباء أسنان متنقلين لعلاج كبار السن بالمنزل', 'fa-tooth', '#00b894', 'من 450 ج.م')
ON CONFLICT (id) DO NOTHING;

-- تحديث تسلسل الـ SERIAL ID للجداول
SELECT setval('specialties_id_seq', (SELECT COALESCE(MAX(id), 1) FROM public.specialties));
SELECT setval('doctors_id_seq', (SELECT COALESCE(MAX(id), 1) FROM public.doctors));
SELECT setval('patients_id_seq', (SELECT COALESCE(MAX(id), 1) FROM public.patients));
SELECT setval('appointments_id_seq', (SELECT COALESCE(MAX(id), 1) FROM public.appointments));

-- ========================================================
-- 6. جدول حسابات المستخدمين وصلاحيات الدخول (Users & Roles)
-- ========================================================
CREATE TABLE IF NOT EXISTS public.users (
    id SERIAL PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    role TEXT NOT NULL, -- 'admin' | 'receptionist' | 'doctor'
    name TEXT NOT NULL,
    title TEXT,
    email TEXT,
    doctor_name TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public read users for login" ON public.users;
CREATE POLICY "Allow public read users for login" ON public.users FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow admin modify users" ON public.users;
CREATE POLICY "Allow admin modify users" ON public.users FOR ALL USING (true);

INSERT INTO public.users (username, password, role, name, title, email, doctor_name)
VALUES 
  ('admin', 'admin123', 'admin', 'المدير العام', 'مدير المركز والنظام', 'admin@fcmc.com', NULL),
  ('reception', 'rec123', 'receptionist', 'أحمد علي (استقبال)', 'مسؤول حجز وتسجيل المرضى', 'reception@fcmc.com', NULL),
  ('doctor', 'doc123', 'doctor', 'د. أحمد كمال الدين', 'استشاري الأمراض الباطنة والكبد', 'dr.ahmed@fcmc.com', 'د. أحمد كمال الدين')
ON CONFLICT (username) DO UPDATE 
SET 
  password = EXCLUDED.password,
  role = EXCLUDED.role,
  name = EXCLUDED.name,
  title = EXCLUDED.title,
  email = EXCLUDED.email,
  doctor_name = EXCLUDED.doctor_name;

SELECT setval('users_id_seq', (SELECT COALESCE(MAX(id), 1) FROM public.users));
