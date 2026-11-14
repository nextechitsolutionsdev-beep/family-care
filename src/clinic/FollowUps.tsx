import {useState} from 'react';
import {Link,useNavigate,useSearchParams} from 'react-router-dom';
import {command,visitOperation,date,label,text,today,type Row} from './api';
import {money} from '../domain/money';
import {useClinic,patientRemaining} from './store';
import {Dialog,Form,Heading,Table,Badge,useTask,pastDateConfirmation,requirePastConfirmation} from './ui';
import {followupTiming,followupTimingLabels} from './followupDates';
import {isOpenPrice} from './openPrice';
export default function FollowUps(){
 const {data,rows,name,profile,refresh}=useClinic();const navigate=useNavigate();const [params]=useSearchParams();const account=params.get('account');const task=useTask(refresh);const [scope,setScope]=useState(account?'all':'today');const [reschedule,setReschedule]=useState<Row|null>(null);const [opening,setOpening]=useState<Row|null>(null);
 const patient=rows('patients').find(row=>row.id===opening?.patient_id);
 const doctor=rows('doctors').find(row=>row.id===opening?.doctor_id);
 const covered=patient?.client_type_code==='insurance_credit'||patient?.client_type_code==='syndicate_cash';
 const balance=(row:Row)=>{
  const original=patientRemaining(data,rows('visits').find(v=>v.id===row.source_visit_id));
  return original+(row.billing_visit_id&&row.billing_visit_id!==row.source_visit_id?patientRemaining(data,rows('visits').find(v=>v.id===row.billing_visit_id)):row.planned_billing_mode==='fee'&&!row.billing_visit_id?BigInt(text(row.fee_minor)):0n);
 };
 const cairoToday=today();
 const due=rows('follow_ups').filter(row=>(!account||row.source_visit_id===account||row.billing_visit_id===account)&&(scope==='all'||(row.status==='scheduled'&&followupTiming(row.due_date,cairoToday)===scope)||(scope==='today'&&row.status==='arrived'&&date(row.admitted_at)===date(cairoToday)))).sort((a,b)=>text(a.due_date).localeCompare(text(b.due_date)));
 return <><Heading title="المتابعات" detail="المواعيد القريبة والمتأخرة وحالة الحضور"/>{task.feedback}
 {account&&<p className="notice">متابعات الحساب المفتوح <Link to="/follow-ups">عرض كل المتابعات</Link></p>}
 <div className="filters"><label>عرض<select value={scope} onChange={event=>setScope(event.target.value)}><option value="today">اليوم</option><option value="overdue">متأخرة</option><option value="upcoming">قادمة</option><option value="all">كل المتابعات</option></select></label><span>{due.length} متابعة</span></div>
 <Table rows={due} columns={[
  {label:'العميل / الحساب',render:row=><><Link to={profile.role==='doctor'?`/patients/${text(row.patient_id)}`:`/visits/${text(row.billing_visit_id||row.source_visit_id)}`}>{name('patients',row.patient_id)}</Link>{profile.role!=='doctor'&&<> <small>المطلوب: {money(balance(row))}</small> <Link to={`/patients/${text(row.patient_id)}`}>ملف العميل</Link></>}</>},
  {label:'التاريخ',render:row=>date(row.due_date)},{label:'الوقت',render:row=><bdi>{text(row.due_time).slice(0,5)||'—'}</bdi>},
  {label:'الطبيب',render:row=>name('doctors',row.doctor_id)},{label:'الغرض',render:row=>text(row.purpose)},
  {label:'الحالة',render:row=><Badge>{label(row.status)}</Badge>},
  {label:'موعد المتابعة',render:row=><Badge tone={followupTiming(row.due_date,cairoToday)==='overdue'?'warning':'neutral'}>{followupTimingLabels[followupTiming(row.due_date,cairoToday)]}</Badge>},
  ...(profile.role!=='doctor'?[{label:'باقي الحساب الأصلي',render:(row:Row)=><>{money(patientRemaining(data,rows('visits').find(v=>v.id===row.source_visit_id)))} <Link className="button" to={`/visits/${text(row.source_visit_id)}`}>فتح الحساب الأصلي</Link></>},
  {label:'سعر المتابعة',render:(row:Row)=>row.planned_billing_mode==='fee'?money(row.fee_minor):row.planned_billing_mode==='continuation'?'استكمال نفس الحساب':'حسب الخدمة'},
  {label:'المطلوب قبل الدخول',render:(row:Row)=>money(balance(row))},
  {label:'حساب المتابعة',render:(row:Row)=>row.billing_visit_id?<Link to={`/visits/${text(row.billing_visit_id)}`}>{row.billing_mode==='continuation'?'استكمال نفس الحساب':'زيارة بخدمة جديدة'}</Link>:<button onClick={()=>setOpening(row)} disabled={row.status!=='scheduled'}>فتح / تحصيل المتابعة</button>}]:[]),
  {label:'الإجراء',render:row=>row.status==='scheduled'?<div className="actions">{profile.role!=='doctor'?<button className="primary" disabled={task.busy||!row.billing_visit_id||balance(row)>0n} onClick={()=>void task.run(()=>visitOperation('clinic_admit_followup',{id:row.id}))}>دخول بعد السداد</button>:<span>بانتظار الاستقبال والسداد</span>}<button onClick={()=>setReschedule(row)}>تغيير الموعد</button><button disabled={task.busy} onClick={()=>void task.run(()=>command('follow_up_status',{id:row.id,status:'missed'}))}>لم يحضر</button></div>:row.status==='arrived'?<button disabled={task.busy} onClick={()=>void task.run(()=>command('follow_up_status',{id:row.id,status:'done'}))}>إنهاء المتابعة</button>:<Link to={`/visits/${text(row.billing_visit_id||row.source_visit_id)}`}>الزيارة</Link>}
 ]}/>
 {opening&&<Dialog title="فتح حساب المتابعة" close={()=>setOpening(null)}><p className="notice">باقي الحساب الأصلي: {money(patientRemaining(data,rows('visits').find(v=>v.id===opening.source_visit_id)))}. {opening.planned_billing_mode==='fee'?`سعر المتابعة المحجوز: ${money(opening.fee_minor)}. افتح الحساب ثم حصّل المطلوب قبل الدخول.`:'استكمال نفس الخدمة لا يكرر سعرها؛ افتح الحساب وحصّل الباقي.'}</p><Form initial={{mode:opening.planned_billing_mode==='fee'?'fee':'continuation',visit_date:today()}} fields={[
 {key:'mode',label:'نوع المتابعة',type:'select',required:true,options:opening.planned_billing_mode==='fee'?[{value:'fee',label:'المتابعة بالسعر المحجوز'}]:opening.planned_billing_mode==='continuation'?[{value:'continuation',label:'استكمال نفس الخدمة / تحصيل باقي الحساب'}]:[{value:'continuation',label:'استكمال نفس الخدمة / تحصيل باقي الحساب'},{value:'new_service',label:'خدمة جديدة بمقابل'}]},
 {key:'service_id',label:'خدمة المتابعة المدفوعة',type:'select',required:true,when:v=>v.mode==='new_service',options:rows('services').filter(row=>row.active&&row.specialty_id===doctor?.specialty_id&&row.pricing_kind!=='home'&&!isOpenPrice(row)).map(row=>({value:row.id,label:text(row.name)}))},
 {key:'visit_date',label:'تاريخ الزيارة الجديدة',type:'date',required:true,when:v=>v.mode==='new_service'},
 {key:'co_pay_bps',label:'نسبة تحمّل العميل من الكارنيه (%)',type:'percent',blankInitially:true,required:true,min:0,max:100,when:v=>v.mode==='new_service'&&covered}
 ]} submit={async values=>{const result=await visitOperation('clinic_open_followup',{...values,id:opening.id,co_pay_bps:values.mode==='new_service'&&covered?values.co_pay_bps:undefined});await refresh('operational');setOpening(null);navigate(`/visits/${text(result.id)}`);}} label="فتح الحساب"/></Dialog>}
 {reschedule&&<Dialog title="تغيير موعد المتابعة" close={()=>setReschedule(null)}><Form initial={reschedule} fields={[{key:'due_date',label:'التاريخ الجديد',type:'date',required:true},pastDateConfirmation('due_date'),{key:'due_time',label:'الوقت',type:'time'},{key:'purpose',label:'الغرض',required:true}]} submit={async values=>{requirePastConfirmation(values,'due_date');await command('follow_up_status',{...values,id:reschedule.id,status:'rescheduled'});await refresh('operational');setReschedule(null);}}/></Dialog>}
 </>;
}
