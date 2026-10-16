import {useState} from 'react';
import {Link,useNavigate} from 'react-router-dom';
import {command,visitOperation,date,label,text,today,type Row} from './api';
import {money} from '../domain/money';
import {useClinic,patientRemaining} from './store';
import {Dialog,Form,Heading,Table,Badge,useTask} from './ui';
export default function FollowUps(){
 const {data,rows,name,profile,refresh}=useClinic();const navigate=useNavigate();const task=useTask(refresh);const [scope,setScope]=useState('today');const [reschedule,setReschedule]=useState<Row|null>(null);const [opening,setOpening]=useState<Row|null>(null);
 const patient=rows('patients').find(row=>row.id===opening?.patient_id);
 const doctor=rows('doctors').find(row=>row.id===opening?.doctor_id);
 const covered=patient?.client_type_code==='insurance_credit'||patient?.client_type_code==='syndicate_cash';
 const due=rows('follow_ups').filter(row=>scope==='all'||(row.status==='scheduled'&&(scope==='today'?row.due_date===today():scope==='overdue'?text(row.due_date)<today():text(row.due_date)>today()))).sort((a,b)=>text(a.due_date).localeCompare(text(b.due_date)));
 return <><Heading title="المتابعات" detail="المواعيد القريبة والمتأخرة وحالة الحضور"/>{task.feedback}
 <div className="filters"><label>عرض<select value={scope} onChange={event=>setScope(event.target.value)}><option value="today">اليوم</option><option value="overdue">متأخرة</option><option value="upcoming">قادمة</option><option value="all">كل المتابعات</option></select></label><span>{due.length} متابعة</span></div>
 <Table rows={due} columns={[
  {label:'العميل',render:row=><Link to={`/patients/${text(row.patient_id)}`}>{name('patients',row.patient_id)}</Link>},
  {label:'التاريخ',render:row=>date(row.due_date)},{label:'الوقت',render:row=><bdi>{text(row.due_time).slice(0,5)||'—'}</bdi>},
  {label:'الطبيب',render:row=>name('doctors',row.doctor_id)},{label:'الغرض',render:row=>text(row.purpose)},
  {label:'الحالة',render:row=><Badge>{label(row.status)}</Badge>},
  ...(profile.role!=='doctor'?[{label:'باقي الحساب الأصلي',render:(row:Row)=>money(patientRemaining(data,rows('visits').find(v=>v.id===row.source_visit_id)))},
  {label:'حساب المتابعة',render:(row:Row)=>row.billing_visit_id?<Link to={`/visits/${text(row.billing_visit_id)}`}>{row.billing_mode==='continuation'?'استكمال نفس الحساب':'زيارة بخدمة جديدة'}</Link>:<button onClick={()=>setOpening(row)} disabled={row.status!=='scheduled'}>فتح / تحصيل المتابعة</button>}]:[]),
  {label:'الإجراء',render:row=>row.status==='scheduled'?<div className="actions"><button disabled={task.busy} onClick={()=>void task.run(()=>command('follow_up_status',{id:row.id,status:'done'}))}>تمت</button><button onClick={()=>setReschedule(row)}>تغيير الموعد</button><button disabled={task.busy} onClick={()=>void task.run(()=>command('follow_up_status',{id:row.id,status:'missed'}))}>لم يحضر</button></div>:<Link to={`/visits/${text(row.source_visit_id)}`}>الزيارة</Link>}
 ]}/>
 {opening&&<Dialog title="فتح حساب المتابعة" close={()=>setOpening(null)}><p className="notice">استكمال نفس الخدمة لا يكرر سعرها. لو فيه خدمة إضافية بمقابل، اختار خدمة جديدة. باقي الحساب الأصلي: {money(patientRemaining(data,rows('visits').find(v=>v.id===opening.source_visit_id)))}</p><Form initial={{mode:'continuation',visit_date:today()}} fields={[
 {key:'mode',label:'نوع المتابعة',type:'select',required:true,options:[{value:'continuation',label:'استكمال نفس الخدمة / تحصيل باقي الحساب'},{value:'new_service',label:'خدمة جديدة بمقابل'}]},
 {key:'service_id',label:'خدمة المتابعة المدفوعة',type:'select',required:true,when:v=>v.mode==='new_service',options:rows('services').filter(row=>row.active&&row.specialty_id===doctor?.specialty_id&&row.pricing_kind!=='home').map(row=>({value:row.id,label:text(row.name)}))},
 {key:'visit_date',label:'تاريخ الزيارة الجديدة',type:'date',required:true,when:v=>v.mode==='new_service'},
 {key:'co_pay_bps',label:'نسبة تحمّل العميل من الكارنيه (%)',type:'percent',blankInitially:true,required:true,min:0,max:100,when:v=>v.mode==='new_service'&&covered}
 ]} submit={async values=>{const result=await visitOperation('clinic_open_followup',{...values,id:opening.id,co_pay_bps:values.mode==='new_service'&&covered?values.co_pay_bps:undefined});await refresh();setOpening(null);navigate(`/visits/${text(result.id)}`);}} label="فتح الحساب"/></Dialog>}
 {reschedule&&<Dialog title="تغيير موعد المتابعة" close={()=>setReschedule(null)}><Form initial={reschedule} fields={[{key:'due_date',label:'التاريخ الجديد',type:'date',required:true},{key:'due_time',label:'الوقت',type:'time'},{key:'purpose',label:'الغرض',required:true}]} submit={async values=>{await command('follow_up_status',{...values,id:reschedule.id,status:'rescheduled'});await refresh();setReschedule(null);}}/></Dialog>}
 </>;
}
