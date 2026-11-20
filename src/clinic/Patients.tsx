import {paymentMethodOptions} from './paymentMethods';
import {useState,useMemo} from 'react';
import {patientSearchIndex,specialtyCodes} from './search';
import {Link,useNavigate,useParams} from 'react-router-dom';
import {command,patientIntake,visitIntake,text,date,label,today,percentLabel,type Row} from './api';
import {useClinic,patientPaid,patientRemaining} from './store';
import {Badge,Dialog,Form,Heading,Table,type Field} from './ui';
import {money,minor,percent,roundShare} from '../domain/money';
import ExtraServices,{type SelectedService} from './ExtraServices';
import {doctorAvailable,outsideDoctorHours,scheduleLabel,visitWeekday} from './doctorAvailability';
import {normalizeEgyptianPhone} from '../domain/phone';
// Other active patients already using the typed number (owner decision 21/10/2026: warn, open, or confirm).
// Test placeholders and an unchanged number on edit are not checked, as on the server.
export function sharedPhonePatients(patients:Row[],phone:unknown,self?:Row|null):Row[]{
 const value=normalizeEgyptianPhone(phone);
 if(!/^\+201[0125][0-9]{8}$/.test(value)||(self&&value===self.phone_e164))return [];
 return patients.filter(row=>row.phone_e164===value&&row.id!==self?.id&&row.active!==false);
}
function SharedPhoneNotice({matches,open}:{matches:Row[];open:(id:string)=>void}){
 if(!matches.length)return null;
 return <div className="notice wide" aria-live="polite"><strong>الرقم مسجل بالفعل باسم:</strong> {matches.map(row=><button type="button" key={row.id} onClick={()=>open(row.id)}>فتح ملف {text(row.name)}</button>)}<br/>افتح الملف الموجود، أو لو ده فرد آخر من نفس الأسرة علّم «ملف منفصل لنفس الرقم».</div>;
}
const sharedPhoneConfirm:Field={key:'confirm_shared_phone',label:'ملف منفصل لنفس الرقم (فرد آخر من الأسرة)',type:'checkbox'};
const requireSharedPhoneConfirmation=(matches:Row[],values:Record<string,unknown>)=>{
 if(matches.length&&!values.confirm_shared_phone)throw new Error('الرقم مسجل لعميل آخر. افتح الملف الموجود، أو علّم «ملف منفصل لنفس الرقم».');
};
function DoctorAvailabilityNotice({day}:{day:unknown}){
 const {rows}=useClinic();
 if(visitWeekday(day)===null||rows('doctors').some(row=>doctorAvailable(row,day)&&rows('specialties').some(s=>s.id===row.specialty_id)))return null;
 return <p className="notice wide" role="status">مفيش طبيب شغال في التاريخ ده حسب جدول المواعيد. تقدر تحجز بعد تأكيد الحجز خارج مواعيد الطبيب، أو تختار يوم تاني.</p>;
}
function visitDateField():Field{
 return {key:'visit_date',label:'تاريخ الزيارة',type:'date',required:true,hint:'اليوم تلقائيًا بتوقيت القاهرة. مواعيد الطبيب بتظهر تحت الاختيار.'};
}
const visitTimeField:Field={key:'visit_time',label:'الوقت',type:'time',required:true,hint:'الدكتور ما ينفعش يكون عنده حجزين في نفس الوقت.'};
/** Every active doctor of the visit specialty; doctors outside their days or hours stay selectable (owner decision 19/11/2026). */
function doctorOptions(doctors:Row[],specialties:Row[],values:Record<string,unknown>,withSpecialty?:(doctor:Row)=>string){
 return doctors.filter(row=>row.active&&inVisitSpecialty(row,values)&&specialties.some(s=>s.id===row.specialty_id)).map(row=>{
  const away=outsideDoctorHours(row,values.visit_date,values.visit_time)!==null;
  return {value:row.id,label:`${text(row.name)}${withSpecialty?` — ${withSpecialty(row)}`:''}${away?' (خارج مواعيده)':''}`};
 });
}
const outsideConfirmField=(doctors:Row[]):Field=>({key:'confirm_outside_hours',label:'تأكيد الحجز خارج مواعيد الطبيب',type:'checkbox',
 when:values=>outsideDoctorHours(doctors.find(row=>row.id===values.doctor_id),values.visit_date,values.visit_time)!==null});
function requireOutsideConfirmation(doctors:Row[],values:Record<string,unknown>){
 if(outsideDoctorHours(doctors.find(row=>row.id===values.doctor_id),values.visit_date,values.visit_time)!==null&&!values.confirm_outside_hours)
  throw new Error('الحجز خارج مواعيد الطبيب. علّم «تأكيد الحجز خارج مواعيد الطبيب» لو متأكد، أو غيّر اليوم أو الوقت.');
}
/** The selected doctor's working days and hours, the out-of-hours warning and a booking already at that minute. */
function DoctorHoursNotice({values}:{values:Record<string,unknown>}){
 const {rows}=useClinic();
 const doctor=rows('doctors').find(row=>row.id===values.doctor_id);
 if(!doctor)return null;
 const away=outsideDoctorHours(doctor,values.visit_date,values.visit_time);
 const time=String(values.visit_time??'').slice(0,5);
 const taken=time&&rows('appointments').some(row=>row.doctor_id===doctor.id&&row.appointment_date===values.visit_date&&text(row.appointment_time).slice(0,5)===time&&row.status!=='cancelled');
 return <div className={away||taken?'error wide':'notice wide'} role="status" aria-live="polite">
  <strong>مواعيد {text(doctor.name)}:</strong> {scheduleLabel(doctor)}
  {away&&<><br/>⚠ {away} علّم التأكيد لو الحجز مقصود.</>}
  {taken&&<><br/>⚠ الدكتور عنده حجز الساعة <bdi>{time}</bdi> في اليوم ده. اختار وقت تاني.</>}
 </div>;
}
/** The insurer or union payer of a covered client (unions bill through their own payer row). */
function payerId(insurers:Row[],clientType:unknown,insurerId:unknown,unionId:unknown):string|null{
 if(clientType==='insurance_credit')return insurerId?text(insurerId):null;
 if(clientType==='syndicate_cash')return text(insurers.find(row=>row.union_id===unionId)?.id)||null;
 return null;
}
/** The owner's price for this payer and service (piastres), or null when the Family Care price applies. */
export function payerPrice(prices:Row[],payer:string|null,serviceId:unknown):number|null{
 if(!payer)return null;
 const row=prices.find(price=>price.payer_id===payer&&price.service_id===serviceId);
 return row?Number(row.price_minor):null;
}
// The server applies the payer price itself; the desk sends only the service and quantity.
const extraPayload=(extras:SelectedService[])=>extras.map(item=>({service_id:item.service_id,quantity:item.quantity}));
const covered=(type:unknown)=>type==='insurance_credit'||type==='syndicate_cash';
const copayField:Field={key:'co_pay_bps',label:'نسبة تحمّل العميل من الكارنيه (%)',type:'percent',required:true,blankInitially:true,
 when:values=>covered(values.client_type_code),hint:'اكتب النسبة المكتوبة على الكارنيه لكل زيارة. مثال: 20 يعني العميل 20% والجهة 80%.'};
const paymentFields:Field[]=[
 {key:'amount_minor',label:'المدفوع الآن بالجنيه (اختياري)',type:'money',hint:'اكتب صفر لو هتسجل التحصيل بعد فتح الزيارة.'},
 {key:'method',label:'طريقة الدفع',type:'select',required:true,when:values=>Number(values.amount_minor)>0,
  options:()=>paymentMethodOptions()}
];
function IntakePreview({values,clientType,extras=[],payer=null}:{values:Record<string,unknown>;clientType?:string;extras?:SelectedService[];payer?:string|null}){
 const {rows,capabilities}=useClinic();const type=clientType??text(values.client_type_code);
 if(!values.service_id)return null;
 // Since 20261120100000 every client type has its own prices; before it, insurance and unions used Family Care's.
 const listType=covered(type)&&!capabilities.priceMatrix?'family_care_cash':type;
 const list=rows('price_lists').find(row=>row.client_type_code===listType);
 const version=rows('price_list_versions').filter(row=>row.list_id===list?.id&&row.published_at&&text(row.effective_from)<=text(values.visit_date)).sort((a,b)=>text(b.effective_from).localeCompare(text(a.effective_from)))[0];
 // A covered visit uses the owner's price for its insurer or union when one is set (owner decision 19/11/2026).
 const payerPriceOf=(serviceId:unknown)=>covered(type)?payerPrice(rows('payer_service_prices'),payer,serviceId):null;
 const ownPrice=payerPriceOf(values.service_id);
 const price=ownPrice!==null?{price_minor:ownPrice}:rows('service_prices').find(row=>row.version_id===version?.id&&row.service_id===values.service_id);
 if(!price)return <p className="notice wide">سعر الخدمة غير متاح لهذا التاريخ. راجع قائمة الأسعار قبل الحفظ.</p>;
 try {
  const bps=covered(type)?percent(text(values.co_pay_bps)):10000;
  const doctor=rows('doctors').find(row=>row.id===values.doctor_id);
  const homeService=rows('services').find(row=>row.active&&row.specialty_id===doctor?.specialty_id&&row.pricing_kind==='home');
  const homePayer=values.location==='home'?payerPriceOf(homeService?.id):null;
  const homePrice=values.location==='home'?(homePayer!==null?{price_minor:homePayer}:rows('service_prices').find(row=>row.version_id===version?.id&&row.service_id===homeService?.id)):null;
  if(values.location==='home'&&!homePrice)return <p className="notice wide">رسم الزيارة المنزلية غير متاح لهذا التاريخ. راجع قائمة الأسعار.</p>;
  let total=BigInt(text(price.price_minor))+BigInt(text(homePrice?.price_minor||0));
  for(const item of extras){if(!item.service_id)continue;const extraPayer=payerPriceOf(item.service_id);const extraPrice=extraPayer!==null?{price_minor:extraPayer}:rows('service_prices').find(row=>row.version_id===version?.id&&row.service_id===item.service_id);if(!extraPrice)return <p className="notice wide">سعر إحدى الخدمات غير متاح لهذا التاريخ.</p>;total+=BigInt(text(extraPrice.price_minor))*BigInt(item.quantity);}
  const patient=roundShare(total,bps);
  const paid=minor(text(values.amount_minor||'0'));
  const extra=BigInt(paid)>patient?BigInt(paid)-patient:0n;
  return <p className="notice wide">{values.location==='home'?'إجمالي الخدمة والزيارة المنزلية':'سعر الخدمة'} {money(total)}{ownPrice!==null?' (سعر الجهة)':''} · العميل عليه {money(patient)} ({percentLabel(bps)}) · على الجهة {money(total-patient)} · المدفوع الآن {money(paid)} · المتبقي على العميل {money(extra?0n:patient-BigInt(paid))}{extra>0n&&<> · <strong>زيادة {money(extra)} هتتسجل إيراد زيادة</strong></>}</p>;
 }catch{return null;}
}
export function patientFields(types:Row[],insurers:Row[],unions:Row[],specialties:Row[],demo:Row[]):Field[]{return [
 {key:'name',label:'اسم العميل',required:true},{key:'phone_e164',label:'رقم الموبايل',required:true,hint:'اكتب الرقم العادي مثل 01012345678؛ كود مصر بيتضاف تلقائيًا.'},
 {key:'birth_date',label:'تاريخ الميلاد',type:'date'},
 {key:'client_type_code',label:'نوع العميل',type:'select',required:true,options:types.map(row=>({value:text(row.code),label:text(row.name)}))},
 {key:'insurer_id',label:'شركة التأمين',type:'select',required:true,when:values=>values.client_type_code==='insurance_credit',options:insurers.filter(row=>row.active&&row.payer_kind!=='union').map(row=>({value:row.id,label:text(row.name)}))},
 {key:'union_id',label:'النقابة',type:'select',required:true,when:values=>values.client_type_code==='syndicate_cash',options:unions.filter(row=>row.active).map(row=>({value:row.id,label:text(row.name)}))},
 {key:'specialty_id',label:'التخصص (اختياري)',hint:'كود العميل واحد لكل التخصصات ويُنشأ تلقائيًا.',type:'select',options:specialties.filter(row=>row.active).map(row=>({value:row.id,label:text(row.name)}))},
 {key:'marketing_consent',label:'وافق على رسائل العروض وأعياد الميلاد',type:'checkbox'},
 {key:'transactional_consent',label:'وافق على رسائل مواعيد المتابعة',type:'checkbox'},
 {key:'notes',label:'ملاحظات الملف',type:'textarea'},
 ...(demo.some(row=>!row.archived_at)?[{key:'demo_batch_id',label:'مجموعة تجريبية (اختياري)',type:'select' as const,options:demo.filter(row=>!row.archived_at).map(row=>({value:row.id,label:text(row.name)}))}]:[])
];}
/** Per-visit specialty (the patient keeps one code for all specialties); narrows the doctor list. */
export function visitSpecialtyField(specialties:Row[],doctors:Row[]):Field{
 return {key:'visit_specialty_id',label:'تخصص الزيارة',type:'select',clearOnChange:['doctor_id','service_id'],hint:'اختار التخصص ثم الطبيب المتاح في يوم الزيارة.',
  options:specialties.filter(row=>row.active).map(row=>({value:row.id,label:doctors.some(doctor=>doctor.specialty_id===row.id)?text(row.name):`${text(row.name)} (لا يوجد طبيب)`}))};
}
/** Every active specialty is offered; this explains why a chosen one has no doctor or service to pick. */
function SpecialtyNotice({specialtyId,day}:{specialtyId:unknown;day:unknown}){
 const {rows}=useClinic();
 if(!specialtyId)return null;
 const doctors=rows('doctors').filter(row=>row.specialty_id===specialtyId);
 const messages:string[]=[];
 if(!doctors.length)messages.push('لا يوجد طبيب مسجل في هذا التخصص. أضف طبيبًا للتخصص من «الأطباء والحسابات» أولًا.');
 else if(visitWeekday(day)!==null&&!doctors.some(row=>doctorAvailable(row,day)))messages.push('مفيش طبيب من التخصص ده شغال في التاريخ المختار. تقدر تحجز بعد التأكيد أو تختار يوم تاني.');
 if(!rows('services').some(row=>row.active&&row.specialty_id===specialtyId&&row.pricing_kind!=='home'))messages.push('لا توجد خدمات في هذا التخصص. أضف خدمة من «التخصصات والخدمات».');
 return messages.length?<p className="notice wide" role="status">{messages.join(' ')}</p>:null;
}
const inVisitSpecialty=(doctor:Row,values:Record<string,unknown>)=>!values.visit_specialty_id||doctor.specialty_id===values.visit_specialty_id;
export function VisitBooking({patient,close}:{patient:Row;close:()=>void}) {
 const {rows,refresh}=useClinic();const navigate=useNavigate();const [key]=useState(()=>crypto.randomUUID());
 const [extras,setExtras]=useState<SelectedService[]>([]);
 const payer=payerId(rows('insurance_companies'),patient.client_type_code,patient.insurer_id,patient.union_id);
 return <Dialog title={`زيارة وخدمة — ${text(patient.name)}`} close={close}><Form initial={{visit_date:today(),location:'clinic',method:'cash',amount_minor:0}} fields={[
 visitDateField(),visitTimeField,
 visitSpecialtyField(rows('specialties'),rows('doctors')),
 {key:'doctor_id',label:'الطبيب',required:true,type:'select',clearOnChange:['service_id'],options:values=>doctorOptions(rows('doctors'),rows('specialties'),values)},
 outsideConfirmField(rows('doctors')),
 {key:'service_id',label:'الخدمة',type:'select',required:true,when:values=>Boolean(values.doctor_id),options:values=>{
  const doctor=rows('doctors').find(row=>row.id===values.doctor_id);
  return rows('services').filter(row=>row.active&&row.specialty_id===doctor?.specialty_id&&row.pricing_kind!=='home').map(row=>({value:row.id,label:text(row.name)}));
 }},
 {key:'location',label:'مكان الزيارة',type:'select',required:true,options:[{value:'clinic',label:'العيادة'},{value:'home',label:'منزلية (+ 1,000 جنيه)'}]},
 {...copayField,when:()=>covered(patient.client_type_code)},...paymentFields
 ]} submit={async values=>{
  requireOutsideConfirmation(rows('doctors'),values);
  const result=await visitIntake({idempotency_key:key,
   visit:{patient_id:patient.id,doctor_id:values.doctor_id,visit_date:values.visit_date,visit_time:values.visit_time,location:values.location,...(values.confirm_outside_hours?{confirm_outside_hours:true}:{}),...(covered(patient.client_type_code)?{co_pay_bps:values.co_pay_bps}:{})},
   service:{service_id:values.service_id},additional_services:extraPayload(extras),
   ...(Number(values.amount_minor)>0?{payment:{amount_minor:values.amount_minor,method:values.method}}:{})});
  await refresh('operational');close();navigate(`/visits/${text(result.visit_id)}`);
 }} label="تسجيل الزيارة والخدمة">{values=><><DoctorAvailabilityNotice day={values.visit_date}/><SpecialtyNotice specialtyId={values.visit_specialty_id} day={values.visit_date}/><DoctorHoursNotice values={values}/><ExtraServices doctorId={values.doctor_id} items={extras} onChange={setExtras}/><IntakePreview values={values} extras={extras} clientType={text(patient.client_type_code)} payer={payer}/></>}</Form></Dialog>;
}
function BookingOnly({patient,close}:{patient:Row;close:()=>void}){
 const {rows,name,refresh}=useClinic();const navigate=useNavigate();
 return <Dialog title={`حجز بدون خدمة — ${text(patient.name)}`} close={close}><Form initial={{visit_date:today(),location:'clinic'}} fields={[
  visitDateField(),visitTimeField,
  {key:'doctor_id',label:'الطبيب',required:true,type:'select',options:values=>doctorOptions(rows('doctors'),rows('specialties'),values,row=>name('specialties',row.specialty_id))},
  outsideConfirmField(rows('doctors')),
  {key:'location',label:'مكان الزيارة',type:'select',required:true,options:[{value:'clinic',label:'العيادة'},{value:'home',label:'منزلية (+ 1,000 جنيه)'}]},
  {...copayField,when:()=>covered(patient.client_type_code)}
 ]} submit={async values=>{requireOutsideConfirmation(rows('doctors'),values);const result=await command('visit_create',{...values,patient_id:patient.id,confirm_outside_hours:values.confirm_outside_hours?true:undefined,...(!covered(patient.client_type_code)?{co_pay_bps:undefined}:{})});await refresh('operational');close();navigate(`/visits/${text(result.id)}`);}} label="حفظ الحجز">{values=><><DoctorAvailabilityNotice day={values.visit_date}/><DoctorHoursNotice values={values}/></>}</Form></Dialog>;
}
export default function Patients() {
 const {id}=useParams();const navigate=useNavigate();const {data,rows,name,profile,refresh}=useClinic();
 const [search,setSearch]=useState('');const [editing,setEditing]=useState<Row|null|undefined>();const [booking,setBooking]=useState<Row|null>(null);const [bookingOnly,setBookingOnly]=useState<Row|null>(null);
 const [quickKey,setQuickKey]=useState<string|null>(null);const [editKey,setEditKey]=useState<string|null>(null);
 const [extras,setExtras]=useState<SelectedService[]>([]);
 const patient=rows('patients').find(row=>row.id===id);
 const basicFields=patientFields(rows('client_types'),rows('insurance_companies'),rows('unions'),rows('specialties'),rows('demo_batches'));
 const sharedWith=(values:Record<string,unknown>)=>sharedPhonePatients(rows('patients'),values.phone_e164,editing);
 const openExisting=(target:string)=>{setEditing(undefined);setQuickKey(null);navigate(`/patients/${target}`);};
 const fields=basicFields.flatMap(field=>field.key==='phone_e164'?[field,{...sharedPhoneConfirm,when:(values:Record<string,unknown>)=>sharedWith(values).length>0}]:[field]);
 const quickPayer=(values:Record<string,unknown>)=>payerId(rows('insurance_companies'),values.client_type_code,values.insurer_id,values.union_id);
 const quickFields:Field[]=[...fields.filter(field=>['name','phone_e164','confirm_shared_phone','client_type_code','insurer_id','union_id'].includes(field.key)),
  visitDateField(),visitTimeField,
  visitSpecialtyField(rows('specialties'),rows('doctors')),
  {key:'doctor_id',label:'الطبيب والتخصص',type:'select',required:true,clearOnChange:['service_id'],options:values=>doctorOptions(rows('doctors'),rows('specialties'),values,row=>name('specialties',row.specialty_id))},
  outsideConfirmField(rows('doctors')),
  {key:'service_id',label:'الخدمة',type:'select',required:true,when:values=>Boolean(values.doctor_id),options:values=>{
   const doctor=rows('doctors').find(row=>row.id===values.doctor_id);
   return rows('services').filter(row=>row.active&&row.specialty_id===doctor?.specialty_id&&row.pricing_kind!=='home').map(row=>({value:row.id,label:text(row.name)}));
  }},
  copayField,...paymentFields,
  ...(profile.role==='owner'?fields.filter(field=>field.key==='demo_batch_id'&&rows('demo_batches').some(row=>!row.archived_at)):[])];
 const patientRows=rows('patients'),codeRows=rows('patient_specialty_codes');
 const codeIndex=useMemo(()=>specialtyCodes(codeRows),[codeRows]);
 const searchIndex=useMemo(()=>patientSearchIndex(patientRows,codeRows),[patientRows,codeRows]);
 const codes=(patientId:string)=>(codeIndex.get(patientId)??[]).join(' · ');
 const filtered=patientRows.filter(row=>row.active&&searchIndex.get(row.id)?.includes(search.toLowerCase()));
 const visits=rows('visits').filter(row=>row.patient_id===id).sort((a,b)=>text(b.visit_date).localeCompare(text(a.visit_date)));
 const payments=rows('payments').filter(row=>row.patient_id===id);
 const totals=visits.filter(row=>row.status!=='void').reduce((sum,row)=>sum+BigInt(text(row.co_pay_minor||0)),0n);
 // Money kept from cancelled bookings is clinic revenue, not credit on the patient's account (owner decision 19/11/2026).
 const paid=visits.filter(row=>row.status!=='void').reduce((sum,row)=>sum+patientPaid(data,row.id),0n);
 const kept=visits.filter(row=>row.status==='void').reduce((sum,row)=>sum+patientPaid(data,row.id),0n);
 return <>
 <Heading title={patient?text(patient.name):'ملفات العملاء'} detail={patient?[text(patient.patient_code),text(patient.phone_e164),name('client_types',patient.client_type_code)].filter(Boolean).join(' · '):'بحث بالاسم أو رقم الموبايل أو كود العميل'}>
   {id&&<Link className="button" to="/patients">كل العملاء</Link>}
   {patient&&profile.role!=='doctor'&&<button className="primary" onClick={()=>{setEditKey(crypto.randomUUID());setEditing(patient);}}>تعديل البيانات</button>}
   {!patient&&profile.role!=='doctor'&&<><button className="primary" onClick={()=>setQuickKey(crypto.randomUUID())}>تسجيل عميل وخدمة</button><button onClick={()=>{setEditKey(crypto.randomUUID());setEditing(null);}}>عميل فقط</button></>}
   {patient&&profile.role!=='doctor'&&<button onClick={()=>setBooking(patient)}>زيارة جديدة</button>}
   {patient&&profile.role!=='doctor'&&<button onClick={()=>setBookingOnly(patient)}>حجز فقط</button>}
 </Heading>
 {id&&!patient?<p className="empty">الملف غير موجود أو غير متاح لحسابك.</p>:patient?<>
   {patient.demo_batch_id&&<p className="notice">ملف تجريبي — بيانات اختبار.</p>}
   <div className="file-details"><p><strong>الأكواد:</strong> <bdi>{codes(patient.id)||'لم يُخصص كود بعد'}</bdi></p><p>الميلاد: <bdi>{date(patient.birth_date)}</bdi></p>{patient.client_type_code==='syndicate_cash'&&<p>النقابة: {name('unions',patient.union_id)}</p>}<p>العروض: {patient.marketing_consent?'وافق':'لم يوافق'} · المتابعات: {patient.transactional_consent?'وافق':'لم يوافق'}</p><p>{text(patient.notes)||'لا توجد ملاحظات.'}</p></div>
   {profile.role!=='doctor'&&<div className="ledger-summary"><span>حصة العميل <strong>{money(totals)}</strong></span><span>المحصّل <strong>{money(paid)}</strong></span>{kept>0n&&<span>محتفظ به من حجوزات ملغاة <strong>{money(kept)}</strong></span>}<span>المتبقي <strong>{money(totals-paid)}</strong></span></div>}
   <h2>الزيارات</h2><Table rows={visits} columns={[
    {label:'التاريخ',render:row=>date(row.visit_date)},{label:'الطبيب',render:row=>name('doctors',row.doctor_id)},
    {label:'الحالة',render:row=><Badge>{label(row.status)}</Badge>},
    ...(profile.role==='doctor'?[]:[
     {label:'نسبة العميل',render:(row:Row)=>covered(row.client_type_code)?percentLabel(row.co_pay_bps):'—'},
     {label:'إجمالي الزيارة',numeric:true,render:(row:Row)=>money(row.total_minor)},
     {label:'حصة العميل',numeric:true,render:(row:Row)=>money(row.co_pay_minor)},
     {label:'المدفوع',numeric:true,render:(row:Row)=>money(patientPaid(data,row.id))},
     {label:'المتبقي على العميل',numeric:true,render:(row:Row)=>money(patientRemaining(data,row))},
     {label:'على الجهة',numeric:true,render:(row:Row)=>money(row.covered_minor)}]),
    {label:'فتح',render:row=><Link to={`/visits/${row.id}`}>فتح الزيارة</Link>}
   ]}/>
   <h2>المتابعات</h2><Table rows={rows('follow_ups').filter(row=>row.patient_id===id)} columns={[{label:'الموعد',render:row=>date(row.due_date)},{label:'الغرض',render:row=>text(row.purpose)},{label:'الحالة',render:row=>label(row.status)}]}/>
   {profile.role!=='doctor'&&<><h2>سجل التحصيل</h2><Table rows={payments} columns={[{label:'الإيصال',render:row=><bdi>{text(row.receipt_number)}</bdi>},{label:'التاريخ',render:row=>date(row.paid_at)},{label:'النوع',render:row=>label(row.kind)},{label:'المبلغ',numeric:true,render:row=>money(row.amount_minor)},{label:'الطريقة',render:row=>label(row.method)}]}/></>}
 </>:<><div className="filters"><label>بحث العميل<input value={search} onChange={event=>setSearch(event.target.value)} type="search"/></label><span>{filtered.length} عميل</span></div><Table rows={filtered} columns={[
   {label:'الاسم',render:row=><Link to={`/patients/${row.id}`}>{text(row.name)} {row.demo_batch_id?<Badge tone="warning">تجريبي</Badge>:null}</Link>},
   {label:'الموبايل',render:row=><bdi>{text(row.phone_e164)}</bdi>},{label:'الكود',render:row=><><bdi>{text(row.patient_code)||'—'}</bdi>{codes(row.id)&&<small className="legacy-codes"> سابقاً: <bdi>{codes(row.id)}</bdi></small>}</>},
   {label:'النوع',render:row=>name('client_types',row.client_type_code)},
   {label:'الإجراء',render:row=>profile.role==='doctor'?<Link to={`/patients/${row.id}`}>الملف</Link>:<button onClick={()=>setBooking(row)}>زيارة جديدة</button>}
 ]}/></>}
 {editing!==undefined&&<Dialog title={editing?'تعديل بيانات العميل':'عميل جديد'} close={()=>setEditing(undefined)}><Form fields={fields} initial={editing??{client_type_code:'family_care_cash'}} submit={async values=>{
   requireSharedPhoneConfirmation(sharedWith(values),values);
   if(values.client_type_code!=='insurance_credit')values.insurer_id=null;
   if(values.client_type_code!=='syndicate_cash')values.union_id=null;
   if(!values.specialty_id)delete values.specialty_id;
   const result=await patientIntake({idempotency_key:editKey,patient:{...values,...(editing?{id:editing.id}:{})}});await refresh('operational');setEditing(undefined);setEditKey(null);navigate(`/patients/${text(result.patient_id)}`);
 }}>{values=><SharedPhoneNotice matches={sharedWith(values)} open={openExisting}/>}</Form></Dialog>}
 {quickKey&&<Dialog title="تسجيل عميل وزيارة وخدمة" close={()=>setQuickKey(null)}><div className="quick-intake"><Form fields={quickFields} initial={{client_type_code:'family_care_cash',visit_date:today(),amount_minor:0,method:'cash'}} label="تسجيل العميل والخدمة" submit={async values=>{
   requireSharedPhoneConfirmation(sharedWith(values),values);
   requireOutsideConfirmation(rows('doctors'),values);
   const doctor=rows('doctors').find(row=>row.id===values.doctor_id);
   if(!doctor)throw new Error('اختار طبيباً نشطاً.');
   const patient:Record<string,unknown>={...values,specialty_id:doctor.specialty_id,insurer_id:values.client_type_code==='insurance_credit'?values.insurer_id:null,union_id:values.client_type_code==='syndicate_cash'?values.union_id:null};
   for(const key of ['doctor_id','service_id','visit_date','visit_time','confirm_outside_hours','visit_specialty_id','co_pay_bps','amount_minor','method'])delete patient[key];
   const result=await patientIntake({idempotency_key:quickKey,patient,
    visit:{doctor_id:values.doctor_id,visit_date:values.visit_date,visit_time:values.visit_time,location:'clinic',...(values.confirm_outside_hours?{confirm_outside_hours:true}:{}),...(covered(values.client_type_code)?{co_pay_bps:values.co_pay_bps}:{})},
    service:{service_id:values.service_id},additional_services:extraPayload(extras),
    ...(Number(values.amount_minor)>0?{payment:{amount_minor:values.amount_minor,method:values.method}}:{})});
   await refresh('operational');setQuickKey(null);navigate(`/visits/${text(result.visit_id)}`);
 }}>{values=><><SharedPhoneNotice matches={sharedWith(values)} open={openExisting}/><DoctorAvailabilityNotice day={values.visit_date}/><SpecialtyNotice specialtyId={values.visit_specialty_id} day={values.visit_date}/><DoctorHoursNotice values={values}/><ExtraServices doctorId={values.doctor_id} items={extras} onChange={setExtras}/><IntakePreview values={values} extras={extras} payer={quickPayer(values)}/></>}</Form></div></Dialog>}
 {booking&&<VisitBooking patient={booking} close={()=>setBooking(null)}/>}
 {bookingOnly&&<BookingOnly patient={bookingOnly} close={()=>setBookingOnly(null)}/>}
 </>;
}
