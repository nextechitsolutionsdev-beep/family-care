import {useState} from 'react';
import {Link} from 'react-router-dom';
import {text} from './api';
import {useClinic} from './store';
import {Heading,Table} from './ui';
import {workWeek} from './doctorAvailability';
export default function DoctorSchedules(){
 const {rows,name,profile}=useClinic();
 const [specialty,setSpecialty]=useState('');
 const specialties=rows('specialties');
 const doctors=rows('doctors').filter(row=>row.active&&specialties.some(s=>s.id===row.specialty_id))
  .filter(row=>row.specialty_id===specialty)
  .sort((a,b)=>text(a.name).localeCompare(text(b.name),'ar'));
 return <><Heading title="مواعيد الدكاترة" detail="اختار التخصص، وشوف الدكاترة وأيام وجود كل واحد.">
 {profile.role==='owner'&&<Link className="button" to="/doctors">تعديل أيام عمل الدكاترة</Link>}
 </Heading><div className="filters">
 <label>التخصص<select aria-label="التخصص" value={specialty} onChange={event=>setSpecialty(event.target.value)}><option value="">اختار التخصص…</option>{specialties.map(row=><option key={row.id} value={row.id}>{text(row.name)}</option>)}</select></label>
 </div>{specialty?<><p className="notice">الأيام حسب الجدول المسجل. «كل أيام الأسبوع» تعني إن أيام الطبيب غير محددة في النظام.</p>
 <Table rows={doctors} empty="لا يوجد دكاترة متاحون في التخصص ده حاليًا." columns={[
 {label:'الدكتور',render:row=>text(row.name)},
 {label:'التخصص',render:row=>name('specialties',row.specialty_id)},
 {label:'أيام العمل',render:row=>Array.isArray(row.schedule)?row.schedule.length?workWeek.filter(item=>(row.schedule as number[]).includes(item.day)).map(item=>item.label).join('، '):'كل أيام الأسبوع':'راجع جدول الطبيب'},
 ]}/></>:<p className="empty">اختار التخصص عشان تظهر الدكاترة وأيام وجودهم.</p>}</>;
}
