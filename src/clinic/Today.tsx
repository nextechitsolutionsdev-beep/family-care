import {useState} from 'react';
import {Link} from 'react-router-dom';
import {command,date,label,text,today} from './api';
import {useClinic} from './store';
import {Badge,Heading,Table,useTask} from './ui';
export default function Today(){
 const {rows,name,profile,refresh}=useClinic();const [day,setDay]=useState(today());const task=useTask(refresh);
 const appointments=rows('appointments').filter(row=>row.appointment_date===day).sort((a,b)=>text(a.appointment_time).localeCompare(text(b.appointment_time)));
 const reminders=rows('follow_ups').filter(row=>row.status==='scheduled'&&text(row.due_date)<=day).sort((a,b)=>text(a.due_date).localeCompare(text(b.due_date)));
 const upcoming=rows('follow_ups').filter(row=>row.status==='scheduled'&&text(row.due_date)>day).sort((a,b)=>text(a.due_date).localeCompare(text(b.due_date))).slice(0,10);
 return <><Heading title={profile.role==='doctor'?'عيادتي اليوم':'اليوم'} detail="الحجوزات والمتابعات التي تحتاج إجراء"><Link className="button primary" to="/patients">البحث عن عميل / حجز زيارة</Link></Heading>{task.feedback}
 <div className="filters"><label>تاريخ العمل<input type="date" value={day} onChange={event=>setDay(event.target.value)}/></label><span>{appointments.length} حجز · {reminders.length} متابعة مستحقة · {upcoming.length} قادمة</span></div>
 <h2>الحجوزات</h2><Table rows={appointments} columns={[
  {label:'الوقت',render:row=><bdi>{text(row.appointment_time).slice(0,5)||'—'}</bdi>},
  {label:'العميل',render:row=><Link to={`/patients/${text(row.patient_id)}`}>{name('patients',row.patient_id)}</Link>},
  {label:'الطبيب',render:row=>name('doctors',row.doctor_id)},{label:'الحالة',render:row=><Badge tone={row.status==='pending'?'warning':'neutral'}>{label(row.status)}</Badge>},
  {label:'الإجراء',render:row=><div className="actions"><Link to={`/visits/${text(row.visit_id)}`}>فتح الزيارة</Link>{profile.role!=='doctor'&&row.status==='confirmed'&&<button disabled={task.busy} onClick={()=>void task.run(()=>command('appointment_status',{visit_id:row.visit_id,status:'arrived'}))}>حضر</button>}{profile.role!=='doctor'&&!['completed','cancelled'].includes(text(row.status))&&<button onClick={()=>{if(window.confirm('إلغاء الحجز؟ سجل الزيارة والتحصيل سيظل محفوظاً.'))void task.run(()=>command('appointment_status',{visit_id:row.visit_id,status:'cancelled'}));}}>إلغاء الحجز</button>}</div>}
 ]}/>
 <h2>المتابعات المستحقة</h2><Table rows={reminders} columns={[{label:'العميل',render:row=><Link to={`/patients/${text(row.patient_id)}`}>{name('patients',row.patient_id)}</Link>},{label:'الموعد',render:row=>date(row.due_date)},{label:'الغرض',render:row=>text(row.purpose)},{label:'التنبيه',render:row=><Badge tone={text(row.due_date)<day?'warning':'neutral'}>{text(row.due_date)<day?'متأخرة':'اليوم'}</Badge>},{label:'الإجراء',render:()=><Link to="/follow-ups">إدارة المتابعات</Link>}]}/>
 <h2>المتابعات القادمة</h2><Table rows={upcoming} columns={[{label:'العميل',render:row=><Link to={`/patients/${text(row.patient_id)}`}>{name('patients',row.patient_id)}</Link>},{label:'الموعد',render:row=>date(row.due_date)},{label:'الغرض',render:row=>text(row.purpose)},{label:'الإجراء',render:()=><Link to="/follow-ups">إدارة المتابعات</Link>}]}/>
 </>;
}
