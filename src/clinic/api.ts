import { createClient } from '@supabase/supabase-js';
import {normalizeEgyptianPhone} from '../domain/phone';
import {readTable} from './tables';
export type Row = { id: string; [key: string]: unknown };
export type Profile = { id: string; display_name: string; role: 'owner' | 'reception' | 'doctor'; doctor_id: string | null; active: boolean };
// A request that never answers must surface as an error with a retry, not an endless loading screen.
const REQUEST_TIMEOUT_MS=20000;
const timedFetch:typeof fetch=(input,init={})=>{
 const timeout=AbortSignal.timeout(REQUEST_TIMEOUT_MS);
 return fetch(input,{...init,signal:init.signal?AbortSignal.any([init.signal,timeout]):timeout});
};
export const db = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY,{global:{fetch:timedFetch}});
const messages: Record<string,string> = {
 SPECIALTY_INACTIVE:'التخصص محذوف من الاستخدام. استعد التخصص أولًا ثم الخدمة.',
 CATALOG_INACTIVE:'الخدمة محذوفة من الاستخدام. اختار خدمة متاحة أو حدّث الصفحة.',
 SERVICE_IN_ACTIVE_BUNDLE:'الخدمة ضمن باقة فعالة. احذف الباقة من الاستخدام أولًا، ثم احذف الخدمة أو التخصص.',
 BUNDLE_COMPONENT_INACTIVE:'الباقة فيها خدمة محذوفة. استعد الخدمات المكوّنة للباقة أولًا.',
 AUTH_REQUIRED:'سجّل الدخول من جديد.',SESSION_EXPIRED:'انتهت الجلسة. سجّل الدخول من جديد.',ACCESS_DENIED:'حسابك غير مسموح له بتنفيذ الإجراء.',
 INVALID_EGYPTIAN_PHONE:'اكتب رقم موبايل مصري صحيحاً.',INVALID_BIRTH_DATE:'راجع تاريخ الميلاد.',BILLING_LOCKED:'الفاتورة اتسجل عليها تحصيل؛ التصحيح يحتاج إلغاء مالي مسجل.',
 DEPOSIT_REQUIRED:'سجّل الديبوزيت المطلوب أولاً.',VISIT_NOT_CONFIRMED:'أضف الخدمات وسجّل الديبوزيت المطلوب أولاً.',
 INVALID_PAYMENT_AMOUNT:'المبلغ لازم يكون أكبر من صفر ولا يزيد عن المتبقي.',INVALID_SETTLEMENT_AMOUNT:'المبلغ يزيد عن رصيد شركة التأمين.',
 INVALID_RENT_PAYMENT:'المبلغ يزيد عن الإيجار المتبقي.',OFFER_EXPIRED:'العرض خارج فترة الصلاحية.',OFFER_ALREADY_APPLIED:'الزيارة عليها عرض بالفعل.',
 OFFER_NOT_FOUND:'كود العرض غير موجود لهذا التخصص. راجع الكود.',OFFER_INACTIVE:'العرض موقوف حالياً ولا يمكن استخدامه.',OFFER_ALREADY_USED_BY_PATIENT:'العميل استخدم هذا العرض من قبل، والعرض مسموح مرة واحدة لكل عميل.',
 PHONE_EXISTS:'الرقم مسجل لعميل آخر. افتح الملف الموجود، أو أكّد تسجيل ملف منفصل بنفس الرقم.',
 NO_ELIGIBLE_SERVICES:'لا توجد خدمات ينطبق عليها العرض.',OFFER_LIMIT_REACHED:'العرض وصل للحد المسموح.',PREVIEW_CHANGED:'عدد المستلمين اتغير. اعمل معاينة جديدة.',
 DOCTOR_UNAVAILABLE:'الطبيب غير متاح في اليوم المختار.',SERVICES_BEFORE_OFFER:'أضف الخدمات قبل تطبيق العرض.',HOME_FEE_ONCE:'رسم الزيارة المنزلية مضاف بالفعل.',
 REVERSE_FINANCIAL_RECORDS_FIRST:'اعكس التحصيل والتسويات أولاً للحفاظ على الحسابات.',PRICE_LIST_INCOMPLETE:'القائمة لازم تشمل كل الخدمات النشطة.',
 IDEMPOTENCY_CONFLICT:'الطلب اتغير. افتح النموذج من جديد.',
 PRICE_REQUIRED:'اكتب سعر الخدمة بالجنيه؛ الخدمة دي سعرها بيتحدد وقت الزيارة.',PRICE_FIXED:'الخدمة دي ليها سعر ثابت في قائمة الأسعار.',PRICE_OPEN_SERVICE:'الخدمات اللي سعرها بيحدده الاستقبال مش بتدخل قائمة الأسعار.',PRICE_ALREADY_FIXED:'الخدمة دي سعرها ثابت بالفعل.',CAMPAIGN_SPECIALTY_REQUIRED:'اختار تخصص العرض في فلاتر الحملة.',
 UNION_REQUIRED:'اختار النقابة.',UNION_INACTIVE:'النقابة غير نشطة. اختار نقابة أخرى.',UNION_NOT_APPLICABLE:'النقابة متاحة لعميل النقابة فقط.',
 INVALID_EXPENSE:'راجع المبلغ والسبب والتاريخ؛ لا يمكن تسجيل مصروف بتاريخ مستقبلي.',
 SERVICE_REQUIRED:'اختار الخدمة.',
 VISIT_NOT_OPEN:'الزيارة انتهت أو اتلغت. افتح زيارة متابعة بخدمة جديدة لو فيه خدمة إضافية.',
 INVALID_FOLLOWUP_FEE:'اكتب سعر متابعة أكبر من صفر وبحد أقصى منزلتين عشريتين.',
 FOLLOWUP_PAYMENT_REQUIRED:'حصّل المتبقي من الحساب القديم وحساب المتابعة أولاً، ثم سجّل الدخول بعد السداد.',
 FOLLOWUP_ACCOUNT_REQUIRED:'افتح حساب المتابعة أولاً قبل تسجيل الدخول.',
 FOLLOWUP_PLAN_LOCKED:'نوع وسعر المتابعة محفوظان مع الحجز ولا يمكن تغييرهما عند التحصيل.',
 FOLLOWUP_FEE_LOCKED:'حساب رسوم المتابعة مستقل وثابت بالسعر المحجوز. أضف أي خدمة أخرى في زيارة منفصلة من ملف العميل.',
 INVALID_PERIOD:'تاريخ البداية لازم يكون قبل تاريخ النهاية أو نفس اليوم.',
 COPAY_REQUIRED:'اكتب نسبة تحمّل العميل من الكارنيه قبل فتح الزيارة.',INVALID_COPAY:'النسبة لازم تكون من 0 إلى 100%.',COPAY_NOT_APPLICABLE:'نسبة التحمل متاحة للنقابة أو التأمين فقط.',
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
 if(action==='patient_save'||action==='doctor_save')payload={...payload,phone_e164:normalizeEgyptianPhone(payload.phone_e164)};
 const {data,error}=await db.rpc('clinic_command',{action,payload});
 if(error) throw error;
 return data as Record<string,unknown>;
}
export async function visitOperation(operation:'clinic_append_service'|'clinic_open_followup'|'clinic_schedule_followup'|'clinic_admit_followup',payload:Record<string,unknown>):Promise<Record<string,unknown>> {
 const {data,error}=await db.rpc(operation,{payload});if(error)throw error;return data as Record<string,unknown>;
}
export async function patientIntake(payload: Record<string,unknown>): Promise<Record<string,unknown>> {
 const patient=payload.patient as Record<string,unknown>;
 payload={...payload,patient:{...patient,phone_e164:normalizeEgyptianPhone(patient.phone_e164)}};
 const {data,error}=await db.rpc('clinic_patient_intake',{payload});
 if(error) throw error;
 return data as Record<string,unknown>;
}
export async function visitIntake(payload: Record<string,unknown>): Promise<Record<string,unknown>> {
 const {data,error}=await db.rpc('clinic_visit_intake',{payload});
 if(error) throw error;
 return data as Record<string,unknown>;
}
export {tableColumns} from './tables';
const timedOut=(error:unknown)=>/timeout|timed out|abort/i.test(`${(error as {name?:string})?.name??''} ${(error as {message?:string})?.message??''}`);
/** Reads are idempotent: one stalled request is retried once before the screen shows an error with a retry button. */
export async function all(table: string,pageSize=1000): Promise<Row[]> {
 try{return await readTable<Row>(db,table,pageSize);}
 catch(error){if(!timedOut(error))throw error;return readTable<Row>(db,table,pageSize);}
}
export const text=(value: unknown)=>String(value??'');
export const today=()=>{
 const parts=new Intl.DateTimeFormat('en',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit',numberingSystem:'latn'}).formatToParts(new Date());
 const value=(type:string)=>parts.find(part=>part.type===type)?.value;
 return `${value('year')}-${value('month')}-${value('day')}`;
};
export const date=(value: unknown)=>{
 const raw=text(value);
 if(/^\d{4}-\d\d-\d\d$/.test(raw))return raw.split('-').reverse().join('/');
 const instant=new Date(raw);
 return raw&&!Number.isNaN(instant.getTime())
  ?new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Cairo',day:'2-digit',month:'2-digit',year:'numeric'}).format(instant)
  :'—';
};
export const labels: Record<string,string>={owner:'المالك',reception:'الاستقبال',doctor:'الطبيب',dentist:'أطباء التخصص',percentage:'أطباء نسبة',renting:'أطباء مستأجرين',open:'مفتوحة',completed:'مكتملة',void:'ملغاة',pending:'بانتظار الديبوزيت',confirmed:'مؤكدة',arrived:'حضر',cancelled:'ملغي',scheduled:'محددة',done:'تمت',rescheduled:'اتغير موعدها',missed:'لم يحضر',simulated:'مسجلة تجريبياً',queued:'في الانتظار',skipped:'لم تُرسل',failed:'تعذرت',payment:'تحصيل',deposit:'ديبوزيت',refund:'رد مبلغ',cash:'نقدي',card:'بطاقة',transfer:'تحويل',birthday:'عيد ميلاد',campaign:'حملة',follow_up:'متابعة',experience_survey:'تقييم تجربة',clinic:'العيادة',home:'منزلية'};
export const label=(value:unknown)=>labels[text(value)]??text(value);
export const percentLabel=(basisPoints:unknown)=>{
 if(basisPoints===null||basisPoints===undefined||basisPoints==='')return '—';
 const value=Number(basisPoints);
 if(!Number.isFinite(value))return '—';
 const fraction=value%100;
 return `${Math.trunc(value/100)}${fraction?'.'+String(fraction).padStart(2,'0').replace(/0+$/,''):''}%`;
};
