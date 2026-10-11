import {useState} from 'react';
import {Link,useNavigate,useParams} from 'react-router-dom';
import {command,patientIntake,text,date,label,today,percentLabel,type Row} from './api';
import {useClinic,patientPaid} from './store';
import {Badge,Dialog,Form,Heading,Table,type Field} from './ui';
import {money} from '../domain/money';
export function patientFields(types:Row[],insurers:Row[],unions:Row[],specialties:Row[],demo:Row[]):Field[]{return [
 {key:'name',label:'اسم العميل',required:true},{key:'phone_e164',label:'رقم الموبايل',required:true,hint:'01xxxxxxxxx أو +20. أرقام التجربة +200000000001 لسجل تجريبي فقط.'},
 {key:'birth_date',label:'تاريخ الميلاد',type:'date'},
 {key:'client_type_code',label:'نوع العميل',type:'select',required:true,options:types.map(row=>({value:text(row.code),label:text(row.name)}))},
 {key:'insurer_id',label:'شركة التأمين',type:'select',required:true,when:values=>values.client_type_code==='insurance_credit',options:insurers.filter(row=>row.active).map(row=>({value:row.id,label:`${text(row.name)} — العميل ${percentLabel(row.co_pay_bps)} · الشركة ${percentLabel(10000-Number(row.co_pay_bps))}`}))},
 {key:'union_id',label:'النقابة',type:'select',required:true,when:values=>values.client_type_code==='syndicate_cash',options:unions.filter(row=>row.active).map(row=>({value:row.id,label:text(row.name)}))},
 {key:'specialty_id',label:'التخصص وكود العميل',type:'select',options:specialties.filter(row=>row.active).map(row=>({value:row.id,label:text(row.name)}))},
 {key:'marketing_consent',label:'وافق على رسائل العروض وأعياد الميلاد',type:'checkbox'},
 {key:'transactional_consent',label:'وافق على رسائل مواعيد المتابعة',type:'checkbox'},
 {key:'notes',label:'ملاحظات الملف',type:'textarea'},
 ...(demo.length?[{key:'demo_batch_id',label:'مجموعة تجريبية (اختياري)',type:'select' as const,options:demo.filter(row=>!row.archived_at).map(row=>({value:row.id,label:text(row.name)}))}]:[])
];}
export function VisitBooking({patient,close}:{patient:Row;close:()=>void}) {
 const {rows,refresh}=useClinic();const navigate=useNavigate();
 return <Dialog title={`زيارة جديدة — ${text(patient.name)}`} close={close}><Form initial={{visit_date:today(),location:'clinic'}} fields={[
 {key:'doctor_id',label:'الطبيب',required:true,type:'select',options:rows('doctors').filter(row=>row.active).map(row=>({value:row.id,label:text(row.name)}))},
 {key:'visit_date',label:'تاريخ الزيارة',type:'date',required:true},{key:'visit_time',label:'الوقت',type:'time'},
 {key:'location',label:'مكان الزيارة',type:'select',required:true,options:[{value:'clinic',label:'العيادة'},{value:'home',label:'منزلية (+ 1,000 جنيه)'}]}
 ]} submit={async values=>{const result=await command('visit_create',{...values,patient_id:patient.id});await refresh();close();navigate(`/visits/${text(result.id)}`);}} label="فتح الزيارة"/></Dialog>;
}
export default function Patients() {
 const {id}=useParams();const navigate=useNavigate();const {data,rows,name,profile,refresh}=useClinic();
 const [search,setSearch]=useState('');const [editing,setEditing]=useState<Row|null|undefined>();const [booking,setBooking]=useState<Row|null>(null);
 const [quickKey,setQuickKey]=useState<string|null>(null);const [editKey,setEditKey]=useState<string|null>(null);
 const patient=rows('patients').find(row=>row.id===id);
 const fields=patientFields(rows('client_types'),rows('insurance_companies'),rows('unions'),rows('specialties'),rows('demo_batches'));
 const quickFields:Field[]=[...fields.filter(field=>['name','phone_e164','client_type_code','insurer_id','union_id'].includes(field.key)),
  {key:'doctor_id',label:'الطبيب والتخصص',type:'select',required:true,clearOnChange:['service_id'],options:rows('doctors').filter(row=>row.active).map(row=>({value:row.id,label:`${text(row.name)} — ${name('specialties',row.specialty_id)}`}))},
  {key:'service_id',label:'الخدمة',type:'select',required:true,when:values=>Boolean(values.doctor_id),options:values=>{
   const doctor=rows('doctors').find(row=>row.id===values.doctor_id);
   return rows('services').filter(row=>row.active&&row.specialty_id===doctor?.specialty_id&&row.pricing_kind!=='home').map(row=>({value:row.id,label:text(row.name)}));
  }},
  {key:'visit_date',label:'تاريخ الزيارة',type:'date',required:true},
  ...(profile.role==='owner'?fields.filter(field=>field.key==='demo_batch_id'&&rows('demo_batches').some(row=>!row.archived_at)):[])];
 const codes=(patientId:string)=>rows('patient_specialty_codes').filter(row=>row.patient_id===patientId).map(row=>text(row.code)).join(' · ');
 const filtered=rows('patients').filter(row=>row.active&&(text(row.name)+' '+text(row.phone_e164)+' '+codes(row.id)).toLowerCase().includes(search.toLowerCase()));
 const visits=rows('visits').filter(row=>row.patient_id===id).sort((a,b)=>text(b.visit_date).localeCompare(text(a.visit_date)));
 const payments=rows('payments').filter(row=>row.patient_id===id);
 const totals=visits.filter(row=>row.status!=='void').reduce((sum,row)=>sum+BigInt(text(row.co_pay_minor||0)),0n);
 const paid=visits.reduce((sum,row)=>sum+patientPaid(data,row.id),0n);
 return <>
 <Heading title={patient?text(patient.name):'ملفات العملاء'} detail={patient?`${text(patient.phone_e164)} · ${name('client_types',patient.client_type_code)}`:'بحث بالاسم أو رقم الموبايل أو كود التخصص'}>
   {id&&<Link className="button" to="/patients">كل العملاء</Link>}
   {patient&&profile.role!=='doctor'&&<button className="primary" onClick={()=>{setEditKey(crypto.randomUUID());setEditing(patient);}}>تعديل البيانات</button>}
   {!patient&&profile.role!=='doctor'&&<><button className="primary" onClick={()=>setQuickKey(crypto.randomUUID())}>تسجيل عميل وخدمة</button><button onClick={()=>{setEditKey(crypto.randomUUID());setEditing(null);}}>عميل فقط</button></>}
   {patient&&profile.role!=='doctor'&&<button onClick={()=>setBooking(patient)}>زيارة جديدة</button>}
 </Heading>
 {id&&!patient?<p className="empty">الملف غير موجود أو غير متاح لحسابك.</p>:patient?<>
   {patient.demo_batch_id&&<p className="notice">ملف تجريبي — بيانات اختبار.</p>}
   <div className="file-details"><p><strong>الأكواد:</strong> <bdi>{codes(patient.id)||'لم يُخصص كود بعد'}</bdi></p><p>الميلاد: <bdi>{date(patient.birth_date)}</bdi></p>{patient.client_type_code==='syndicate_cash'&&<p>النقابة: {name('unions',patient.union_id)}</p>}<p>العروض: {patient.marketing_consent?'وافق':'لم يوافق'} · المتابعات: {patient.transactional_consent?'وافق':'لم يوافق'}</p><p>{text(patient.notes)||'لا توجد ملاحظات.'}</p></div>
   {profile.role!=='doctor'&&<div className="ledger-summary"><span>حصة العميل <strong>{money(totals)}</strong></span><span>المحصّل <strong>{money(paid)}</strong></span><span>المتبقي <strong>{money(totals-paid)}</strong></span></div>}
   <h2>الزيارات</h2><Table rows={visits} columns={[
    {label:'التاريخ',render:row=>date(row.visit_date)},{label:'الطبيب',render:row=>name('doctors',row.doctor_id)},
    {label:'الحالة',render:row=><Badge>{label(row.status)}</Badge>},
    ...(profile.role==='doctor'?[]:[{label:'إجمالي الزيارة',numeric:true,render:(row:Row)=>money(row.total_minor)},{label:'المتبقي على العميل',numeric:true,render:(row:Row)=>money(BigInt(text(row.co_pay_minor))-patientPaid(data,row.id))}]),
    {label:'فتح',render:row=><Link to={`/visits/${row.id}`}>فتح الزيارة</Link>}
   ]}/>
   <h2>المتابعات</h2><Table rows={rows('follow_ups').filter(row=>row.patient_id===id)} columns={[{label:'الموعد',render:row=>date(row.due_date)},{label:'الغرض',render:row=>text(row.purpose)},{label:'الحالة',render:row=>label(row.status)}]}/>
   {profile.role!=='doctor'&&<><h2>سجل التحصيل</h2><Table rows={payments} columns={[{label:'الإيصال',render:row=><bdi>{text(row.receipt_number)}</bdi>},{label:'التاريخ',render:row=>date(row.paid_at)},{label:'النوع',render:row=>label(row.kind)},{label:'المبلغ',numeric:true,render:row=>money(row.amount_minor)},{label:'الطريقة',render:row=>label(row.method)}]}/></>}
 </>:<><div className="filters"><label>بحث العميل<input value={search} onChange={event=>setSearch(event.target.value)} type="search"/></label><span>{filtered.length} عميل</span></div><Table rows={filtered} columns={[
   {label:'الاسم',render:row=><Link to={`/patients/${row.id}`}>{text(row.name)} {row.demo_batch_id?<Badge tone="warning">تجريبي</Badge>:null}</Link>},
   {label:'الموبايل',render:row=><bdi>{text(row.phone_e164)}</bdi>},{label:'الكود',render:row=><bdi>{codes(row.id)||'—'}</bdi>},
   {label:'النوع',render:row=>name('client_types',row.client_type_code)},
   {label:'الإجراء',render:row=>profile.role==='doctor'?<Link to={`/patients/${row.id}`}>الملف</Link>:<button onClick={()=>setBooking(row)}>زيارة جديدة</button>}
 ]}/></>}
 {editing!==undefined&&<Dialog title={editing?'تعديل بيانات العميل':'عميل جديد'} close={()=>setEditing(undefined)}><Form fields={fields} initial={editing??{client_type_code:'family_care_cash'}} submit={async values=>{
   if(values.client_type_code!=='insurance_credit')values.insurer_id=null;
   if(values.client_type_code!=='syndicate_cash')values.union_id=null;
   if(!values.specialty_id)delete values.specialty_id;
   const result=await patientIntake({idempotency_key:editKey,patient:{...values,...(editing?{id:editing.id}:{})}});await refresh();setEditing(undefined);setEditKey(null);navigate(`/patients/${text(result.patient_id)}`);
 }}/></Dialog>}
 {quickKey&&<Dialog title="تسجيل عميل وزيارة وخدمة" close={()=>setQuickKey(null)}><div className="quick-intake"><Form fields={quickFields} initial={{client_type_code:'family_care_cash',visit_date:today()}} label="تسجيل العميل والخدمة" submit={async values=>{
   const doctor=rows('doctors').find(row=>row.id===values.doctor_id);
   if(!doctor)throw new Error('اختار طبيباً نشطاً.');
   const patient:Record<string,unknown>={...values,specialty_id:doctor.specialty_id,insurer_id:values.client_type_code==='insurance_credit'?values.insurer_id:null,union_id:values.client_type_code==='syndicate_cash'?values.union_id:null};
   for(const key of ['doctor_id','service_id','visit_date'])delete patient[key];
   const result=await patientIntake({idempotency_key:quickKey,patient,visit:{doctor_id:values.doctor_id,visit_date:values.visit_date,location:'clinic'},service:{service_id:values.service_id}});
   await refresh();setQuickKey(null);navigate(`/visits/${text(result.visit_id)}`);
 }}/></div></Dialog>}
 {booking&&<VisitBooking patient={booking} close={()=>setBooking(null)}/>}
 </>;
}
