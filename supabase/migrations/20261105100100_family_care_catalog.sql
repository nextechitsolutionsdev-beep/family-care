-- Owner's catalogue request (05/11/2026): Family Care specialties and their services. No prices were given, so every new
-- service is priced at the desk (open_price) until the owner fixes a price. Lab tests and emergency/general services are
-- left for the owner to add. Two existing specialties are renamed only; their patients, doctors, visits and prices stay.
-- Idempotent: an existing specialty (same name or prefix) or service (same seed code) is reused, never changed; services
-- of a specialty the owner has retired are not added.
update public.specialties set name='باطنة وكلى' where client_prefix='AA' and name='باطنه'
 and not exists(select 1 from public.specialties where name='باطنة وكلى');
update public.specialties set name='جلدية وتجميل' where client_prefix='DERM' and name='جلدية'
 and not exists(select 1 from public.specialties where name='جلدية وتجميل');

insert into public.specialties(name,client_prefix,sort_order)
select v.name,v.prefix,(select coalesce(max(sort_order),0) from public.specialties)+v.n
from (values
 (1,'PHYS','علاج طبيعي'),(2,'PSY','نفسية'),(3,'NUT','تغذية'),(4,'HOME','زيارات منزلية'),(5,'LAB','معمل تحاليل'),
 (6,'PED','أطفال وحديثي الولادة'),(7,'ENDO','غدد صماء وسكر'),(8,'PSURG','جراحة أطفال'),(9,'ONCSURG','جراحة أورام'),
 (10,'OBG','نساء وتوليد وتأخر إنجاب'),(11,'PCARD','قلب أطفال')
) v(n,prefix,name)
where not exists(select 1 from public.specialties s where s.name=v.name or s.client_prefix=v.prefix)
order by v.n;

insert into public.services(seed_code,specialty_id,name,open_price)
select v.code,s.id,v.name,true
from (values
 ('CAT-PHYS-01','علاج طبيعي','كشف'),('CAT-PHYS-02','علاج طبيعي','جلسة علاج طبيعي'),('CAT-PHYS-03','علاج طبيعي','باكدج جلسات العلاج الطبيعي'),
 ('CAT-PHYS-04','علاج طبيعي','حجامة جافة'),('CAT-PHYS-05','علاج طبيعي','حجامة تشريطية عادية'),('CAT-PHYS-06','علاج طبيعي','حجامة تشريطية بريميام'),
 ('CAT-PHYS-07','علاج طبيعي','إبر صينية'),
 ('CAT-DERM-01','جلدية وتجميل','كشف'),('CAT-DERM-02','جلدية وتجميل','بوتوكس'),('CAT-DERM-03','جلدية وتجميل','فيلر'),
 ('CAT-DERM-04','جلدية وتجميل','سكين بوستر'),('CAT-DERM-05','جلدية وتجميل','إزالة زوائد جلدية'),('CAT-DERM-06','جلدية وتجميل','ديرمابن'),
 ('CAT-DERM-07','جلدية وتجميل','اكسچينو'),('CAT-DERM-08','جلدية وتجميل','بلازما'),('CAT-DERM-09','جلدية وتجميل','توريد شفايف'),
 ('CAT-DERM-10','جلدية وتجميل','اوليديا'),('CAT-DERM-11','جلدية وتجميل','حقن ميزوثيرابي تخسيس'),
 ('CAT-DERM-12','جلدية وتجميل','حقن ميزوثيرابي شد ترهلات'),('CAT-DERM-13','جلدية وتجميل','حقن ميزوثيرابي بشرة أو شفايف'),
 ('CAT-PSY-01','نفسية','الجلسة'),('CAT-PSY-02','نفسية','عرض الباكدج'),
 ('CAT-NUT-01','تغذية','كشف'),('CAT-NUT-02','تغذية','انبادي'),('CAT-NUT-03','تغذية','متابعة'),('CAT-NUT-04','تغذية','باكدج المتابعات'),
 ('CAT-NUT-05','تغذية','حقن ويجوفي'),('CAT-NUT-06','تغذية','حقن مونجارو'),
 ('CAT-HOME-01','زيارات منزلية','كشف منزلي (حسب التخصص)'),('CAT-HOME-02','زيارات منزلية','تحاليل منزلية'),
 ('CAT-HOME-03','زيارات منزلية','تركيب كانيولا'),('CAT-HOME-04','زيارات منزلية','قياس ضغط'),('CAT-HOME-05','زيارات منزلية','قياس سكر'),
 ('CAT-HOME-06','زيارات منزلية','إعطاء حقن وريد أو عضل'),('CAT-HOME-07','زيارات منزلية','تعليق محاليل'),
 ('CAT-HOME-08','زيارات منزلية','جلسات علاج طبيعي منزلي'),('CAT-HOME-09','زيارات منزلية','حجامة منزلية'),
 ('CAT-HOME-10','زيارات منزلية','رسم قلب منزلي'),('CAT-HOME-11','زيارات منزلية','كشف أسنان منزلي'),('CAT-HOME-12','زيارات منزلية','خدمة أسنان منزلية'),
 ('CAT-IM-01','باطنة وكلى','كشف'),('CAT-PED-01','أطفال وحديثي الولادة','كشف'),('CAT-ENDO-01','غدد صماء وسكر','كشف'),
 ('CAT-PSURG-01','جراحة أطفال','كشف'),('CAT-ONCSURG-01','جراحة أورام','كشف'),('CAT-OBG-01','نساء وتوليد وتأخر إنجاب','كشف'),
 ('CAT-PCARD-01','قلب أطفال','كشف')
) v(code,specialty,name)
join public.specialties s on s.name=v.specialty and s.active
on conflict(seed_code) do nothing;

notify pgrst,'reload schema';
