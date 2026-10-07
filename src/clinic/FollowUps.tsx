import {useState} from 'react';
import {Link} from 'react-router-dom';
import {command,date,label,text,today,type Row} from './api';
import {useClinic} from './store';
import {Dialog,Form,Heading,Table,Badge,useTask} from './ui';
export default function FollowUps(){
 const {rows,name,refresh}=useClinic();const task=useTask(refresh);const [scope,setScope]=useState('today');const [reschedule,setReschedule]=useState<Row|null>(null);
 const due=rows('follow_ups').filter(row=>scope==='all'||(row.status==='scheduled'&&(scope==='today'?row.due_date===today():scope==='overdue'?text(row.due_date)<today():text(row.due_date)>today()))).sort((a,b)=>text(a.due_date).localeCompare(text(b.due_date)));
 return <><Heading title="المتابعات" detail="المواعيد القريبة والمتأخرة وحالة الحضور"/>{task.feedback}
 <div className="filters"><label>عرض<select value={scope} onChange={event=>setScope(event.target.value)}><option value="today">اليوم</option><option value="overdue">متأخرة</option><option value="upcoming">قادمة</option><option value="all">كل المتابعات</option></select></label><span>{due.length} متابعة</span></div>
 <Table rows={due} columns={[
  {label:'العميل',render:row=><Link to={`/patients/${text(row.patient_id)}`}>{name('patients',row.patient_id)}</Link>},
  {label:'التاريخ',render:row=>date(row.due_date)},{label:'الوقت',render:row=><bdi>{text(row.due_time).slice(0,5)||'—'}</bdi>},
  {label:'الطبيب',render:row=>name('doctors',row.doctor_id)},{label:'الغرض',render:row=>text(row.purpose)},
  {label:'الحالة',render:row=><Badge>{label(row.status)}</Badge>},
  {label:'الإجراء',render:row=>row.status==='scheduled'?<div className="actions"><button disabled={task.busy} onClick={()=>void task.run(()=>command('follow_up_status',{id:row.id,status:'done'}))}>تمت</button><button onClick={()=>setReschedule(row)}>تغيير الموعد</button><button disabled={task.busy} onClick={()=>void task.run(()=>command('follow_up_status',{id:row.id,status:'missed'}))}>لم يحضر</button></div>:<Link to={`/visits/${text(row.source_visit_id)}`}>الزيارة</Link>}
 ]}/>
 {reschedule&&<Dialog title="تغيير موعد المتابعة" close={()=>setReschedule(null)}><Form initial={reschedule} fields={[{key:'due_date',label:'التاريخ الجديد',type:'date',required:true},{key:'due_time',label:'الوقت',type:'time'},{key:'purpose',label:'الغرض',required:true}]} submit={async values=>{await command('follow_up_status',{...values,id:reschedule.id,status:'rescheduled'});await refresh();setReschedule(null);}}/></Dialog>}
 </>;
}
