import { createClient } from '@supabase/supabase-js';
export type Row = { id: string; [key: string]: unknown };
export type Profile = { id: string; display_name: string; role: 'owner' | 'reception' | 'doctor'; doctor_id: string | null; active: boolean };
export const db = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);
const messages: Record<string,string> = {
 AUTH_REQUIRED:'سجّل الدخول من جديد.',SESSION_EXPIRED:'انتهت الجلسة. سجّل الدخول من جديد.',ACCESS_DENIED:'حسابك غير مسموح له بتنفيذ الإجراء.',
 INVALID_EGYPTIAN_PHONE:'اكتب رقم موبايل مصري صحيحاً.',INVALID_BIRTH_DATE:'راجع تاريخ الميلاد.',BILLING_LOCKED:'الفاتورة اتسجل عليها تحصيل؛ التصحيح يحتاج إلغاء مالي مسجل.',
 DEPOSIT_REQUIRED:'سجّل الديبوزيت المطلوب أولاً.',VISIT_NOT_CONFIRMED:'أضف الخدمات وسجّل الديبوزيت المطلوب أولاً.',
 INVALID_PAYMENT_AMOUNT:'المبلغ لازم يكون أكبر من صفر ولا يزيد عن المتبقي.',INVALID_SETTLEMENT_AMOUNT:'المبلغ يزيد عن رصيد شركة التأمين.',
 INVALID_RENT_PAYMENT:'المبلغ يزيد عن الإيجار المتبقي.',OFFER_EXPIRED:'العرض خارج فترة الصلاحية.',OFFER_ALREADY_APPLIED:'الزيارة عليها عرض بالفعل.',
 NO_ELIGIBLE_SERVICES:'لا توجد خدمات ينطبق عليها العرض.',OFFER_LIMIT_REACHED:'العرض وصل للحد المسموح.',PREVIEW_CHANGED:'عدد المستلمين اتغير. اعمل معاينة جديدة.',
 DOCTOR_UNAVAILABLE:'الطبيب غير متاح في اليوم المختار.',SERVICES_BEFORE_OFFER:'أضف الخدمات قبل تطبيق العرض.',HOME_FEE_ONCE:'رسم الزيارة المنزلية مضاف بالفعل.',
 REVERSE_FINANCIAL_RECORDS_FIRST:'اعكس التحصيل والتسويات أولاً للحفاظ على الحسابات.',PRICE_LIST_INCOMPLETE:'القائمة لازم تشمل كل الخدمات النشطة.',
 IDEMPOTENCY_CONFLICT:'الطلب اتغير. افتح النموذج من جديد.',CAMPAIGN_SPECIALTY_REQUIRED:'اختار تخصص العرض في فلاتر الحملة.',
 UNION_REQUIRED:'اختار النقابة.',UNION_INACTIVE:'النقابة غير نشطة. اختار نقابة أخرى.',UNION_NOT_APPLICABLE:'النقابة متاحة لعميل النقابة فقط.',
 };
export function readableError(error: unknown): string {
 if (error instanceof Error && !('code' in error)) return error.message;
 const value=error as {message?:string;code?:string};
 const key=Object.keys(messages).find(key=>value?.message?.includes(key));
 if(key) return messages[key];
 if(value?.code==='23505') return 'القيمة دي موجودة بالفعل. راجع الكود أو الاسم أو تاريخ الأسعار.';
 if(value?.code==='P0002') return 'السجل غير موجود أو غير متاح. حدّث البيانات وراجع الاختيار.';
 if(value?.code==='23514'||value?.code==='23502'||value?.code==='22P02') return 'راجع الحقول المطلوبة والقيم المدخلة.';
 return 'تعذر تنفيذ الإجراء. راجع اتصال الإنترنت ثم حاول مرة أخرى.';
}
export async function command(action: string,payload: Record<string,unknown>): Promise<Record<string,unknown>> {
 const {data,error}=await db.rpc('clinic_command',{action,payload});
 if(error) throw error;
 return data as Record<string,unknown>;
}
export async function patientIntake(payload: Record<string,unknown>): Promise<Record<string,unknown>> {
 const {data,error}=await db.rpc('clinic_patient_intake',{payload});
 if(error) throw error;
 return data as Record<string,unknown>;
}
export async function all(table: string): Promise<Row[]> {
 const result: Row[]=[];
 for(let offset=0;;offset+=1000) {
   const {data,error}=await db.from(table).select('*').range(offset,offset+999);
   if(error) throw error;
   result.push(...(data as Row[]));
   if(data.length<1000) return result;
 }
}
export const text=(value: unknown)=>String(value??'');
export const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo'}).format(new Date());
export const date=(value: unknown)=>{
 const raw=text(value);
 if(/^\d{4}-\d\d-\d\d$/.test(raw))return raw.split('-').reverse().join('/');
 const instant=new Date(raw);
 return raw&&!Number.isNaN(instant.getTime())
  ?new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Cairo',day:'2-digit',month:'2-digit',year:'numeric'}).format(instant)
  :'—';
};
export const labels: Record<string,string>={owner:'المالك',reception:'الاستقبال',doctor:'الطبيب',dentist:'أطباء الأسنان',percentage:'أطباء النسبة',renting:'الأطباء المستأجرين',open:'مفتوحة',completed:'مكتملة',void:'ملغاة',pending:'بانتظار الديبوزيت',confirmed:'مؤكدة',arrived:'حضر',cancelled:'ملغي',scheduled:'محددة',done:'تمت',rescheduled:'اتغير موعدها',missed:'لم يحضر',simulated:'مسجلة تجريبياً',queued:'في الانتظار',skipped:'لم تُرسل',failed:'تعذرت',payment:'تحصيل',deposit:'ديبوزيت',refund:'رد مبلغ',cash:'نقدي',card:'بطاقة',transfer:'تحويل',birthday:'عيد ميلاد',campaign:'حملة',follow_up:'متابعة',experience_survey:'تقييم تجربة',clinic:'العيادة',home:'منزلية'};
export const label=(value:unknown)=>labels[text(value)]??text(value);
export const percentLabel=(basisPoints:unknown)=>{
 const value=Number(basisPoints);
 const fraction=value%100;
 return `${Math.trunc(value/100)}${fraction?'.'+String(fraction).padStart(2,'0').replace(/0+$/,''):''}%`;
};
