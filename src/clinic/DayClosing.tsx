import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {date,db,label,readableError,text,today,type Row} from './api';
import {useClinic,patientRemaining} from './store';
import {Badge,DateInput,Form,Heading,Table} from './ui';
import {minor,money} from '../domain/money';
import {carriedOut,daySection,handoverAllowed,methodOrder,signedReceived,type DaySection} from '../domain/dayClosing';
import {expenseCategories} from './Expenses';

type Summary={day:string;methods:Record<string,unknown>;sections:Record<string,{patients:number;visits:number}>;expenses_minor:unknown;cash_expenses_minor:unknown;
 cash_in_minor:unknown;carried_in_minor:unknown;carried_from:string|null;drawer_minor:unknown;latest_closed_day:string|null;closing:Row|null};
const sectionTitles:Record<DaySection,string>={percentage:'يومية النسبة',renting:'يومية المستأجرين'};
const cairoDay=(value:unknown)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo'}).format(new Date(text(value)));
const big=(value:unknown)=>BigInt(text(value??0)||'0');

/** Reception day closing (owner decision 19/11/2026): the paper «تقفيل الحساب» sheet, computed by the database. */
export default function DayClosing(){
 const {rows,name,data,profile,refresh}=useClinic();const [day,setDay]=useState(today());
 const [state,setState]=useState<{key:string;summary?:Summary;error?:string}>({key:''});const [reload,setReload]=useState(0);const [busy,setBusy]=useState(false);
 useEffect(()=>{let active=true;if(!day){setState({key:day,error:'اكتب تاريخ صحيح.'});return;}
  void db.rpc('clinic_day_summary',{day}).then(({data:summary,error})=>{if(!active)return;setState(error?{key:day,error:readableError(error)}:{key:day,summary:summary as Summary});});
  return()=>{active=false;};},[day,data,reload]);
 const summary=state.key===day?state.summary:undefined;
 const after=async()=>{await refresh('operational');setReload(value=>value+1);};

 const visits=rows('visits').filter(row=>row.visit_date===day&&row.status!=='void').sort((a,b)=>text(a.visit_time).localeCompare(text(b.visit_time))||text(a.created_at).localeCompare(text(b.created_at)));
 const doctor=(id:unknown)=>rows('doctors').find(row=>row.id===id);
 const paidToday=(visit:Row)=>rows('payments').filter(row=>row.visit_id===visit.id&&cairoDay(row.paid_at)===day);
 const services=(visit:Row)=>rows('visit_lines').filter(row=>row.visit_id===visit.id&&!row.bundle_group_id).map(row=>name('services',row.service_id)).join('، ')||'—';
 const clientType=(code:unknown)=>text(rows('client_types').find(row=>row.code===code)?.name)||text(code);
 const columns=[
  {label:'العميل',render:(row:Row)=><Link to={`/visits/${row.id}`}>{name('patients',row.patient_id)}</Link>},
  {label:'الموبايل',render:(row:Row)=><bdi>{text(rows('patients').find(patient=>patient.id===row.patient_id)?.phone_e164).replace(/^\+20/,'0')||'—'}</bdi>},
  {label:'الطبيب',render:(row:Row)=>name('doctors',row.doctor_id)||'—'},
  {label:'التخصص',render:(row:Row)=>name('specialties',row.specialty_id)||'—'},
  {label:'الخدمة',render:(row:Row)=>services(row)},
  {label:'جهة العميل',render:(row:Row)=>clientType(row.client_type_code)},
  {label:'المدفوع النهارده',numeric:true,render:(row:Row)=>money(paidToday(row).reduce((sum,pay)=>sum+signedReceived(pay),0n))},
  {label:'طريقة الدفع',render:(row:Row)=>[...new Set(paidToday(row).map(pay=>label(pay.method)))].join(' + ')||'—'},
  {label:'المتبقي',numeric:true,render:(row:Row)=>money(patientRemaining(data,row))},
 ];
 const expenses=rows('expenses').filter(row=>row.spent_on===day&&!row.voided_at);
 const methods=summary?methodOrder.filter(method=>method!=='transfer'||big(summary.methods.transfer)!==0n):[];
 const revenue=summary?Object.values(summary.methods).reduce<bigint>((sum,value)=>sum+big(value),0n):0n;
 const closing=summary?.closing;
 const closedLater=Boolean(summary&&!closing&&summary.latest_closed_day&&summary.latest_closed_day>day);
 const reopen=async()=>{if(!window.confirm('إعادة فتح تقفيل اليوم ده؟ هتقدر تقفله تاني بالأرقام الصح.'))return;setBusy(true);
  try{const {error}=await db.rpc('clinic_day_reopen',{day});if(error)throw error;await after();}catch(error){setState(current=>({...current,error:readableError(error)}));}finally{setBusy(false);}};

 return <><Heading title="تقفيل اليوم" detail="عدد المرضى، الإيرادات بطريقة الدفع، المصروفات، والكاش اللي في الدرج."><button onClick={()=>window.print()}>طباعة</button></Heading>
  <div className="filters"><label>اليوم<DateInput value={day} onChange={value=>setDay(value)}/></label>{closing?<Badge tone="success">متقفل</Badge>:<Badge tone="warning">لسه ما اتقفلش</Badge>}</div>
  {state.error&&state.key===day&&<p className="error" role="alert">{state.error}</p>}
  {!summary?(!state.error&&<p role="status" className="loading">جارٍ حساب اليوم…</p>):<>
   <h2>المرضى</h2><div className="day-kpis">{(['percentage','renting'] as DaySection[]).map(section=><div key={section}><small>{sectionTitles[section]}</small><strong>{summary.sections[section]?.patients??0} مريض</strong><small>{summary.sections[section]?.visits??0} زيارة</small></div>)}</div>
   <h2>الإيرادات</h2><div className="day-kpis">{methods.map(method=><div key={method}><small>{label(method)}</small><strong>{money(summary.methods[method]??0)}</strong></div>)}<div className="total"><small>إجمالي الإيرادات</small><strong>{money(revenue)}</strong></div></div>
   <h2>المصروفات والدرج</h2><div className="day-kpis">
    <div><small>إجمالي المصروفات</small><strong>{money(summary.expenses_minor)}</strong>{big(summary.expenses_minor)!==big(summary.cash_expenses_minor)&&<small>منها كاش {money(summary.cash_expenses_minor)}</small>}</div>
    <div><small>متبقي من حساب امس</small><strong>{money(summary.carried_in_minor)}</strong><small>{summary.carried_from?`من تقفيل ${date(summary.carried_from)}`:'مفيش تقفيل قبل كده'}</small></div>
    <div><small>كاش النهارده</small><strong>{money(summary.cash_in_minor)}</strong></div>
    <div className="total"><small>الكاش في الدرج</small><strong>{money(summary.drawer_minor)}</strong><small>المتبقي من امس + الكاش − مصروفات الكاش</small></div>
   </div>
   {closing?<section className="closing-done"><h2>التقفيل</h2><div className="day-kpis">
     <div><small>اتبعت لـ {text(closing.handed_to)}</small><strong>{money(closing.handed_to_owner_minor)}</strong></div>
     <div className="total"><small>يترحل لبكرة</small><strong>{money(closing.carried_out_minor)}</strong></div>
     <div><small>قفله</small><strong className="plain">{name('profiles',closing.closed_by)||'—'}</strong><small><bdi>{date(closing.closed_at)}</bdi></small></div>
    </div>{text(closing.note)&&<p className="notice">ملاحظة: {text(closing.note)}</p>}
    {big(closing.drawer_minor)!==big(summary.drawer_minor)&&<p className="notice" role="status">اتسجلت حركة بعد التقفيل: الدرج دلوقتي {money(summary.drawer_minor)} بدل {money(closing.drawer_minor)} وقت التقفيل.{profile.role==='owner'?' تقدر تفتح التقفيل وتقفله تاني لو هو آخر يوم متقفل.':' بلّغ المالك.'}</p>}
    {profile.role==='owner'&&summary.latest_closed_day===day&&<button disabled={busy} onClick={()=>void reopen()}>إعادة فتح التقفيل</button>}
   </section>:closedLater?<p className="notice">فيه يوم بعده متقفل ({date(summary.latest_closed_day)})، فمينفعش تقفل اليوم ده دلوقتي.</p>:day>today()?null:
    <section className="no-print"><h2>تقفيل اليوم</h2><Form key={day+text(summary.drawer_minor)} initial={{handed_to_owner_minor:big(summary.drawer_minor)>0n?summary.drawer_minor:0,handed_to:'المالك'}} label="تقفيل اليوم" fields={[
      {key:'handed_to_owner_minor',label:'المبلغ اللي اتبعت للمالك',type:'money',required:true,hint:`الموجود في الدرج ${money(summary.drawer_minor)}. اللي يفضل يترحل لبكرة في «متبقي من حساب امس».`},
      {key:'handed_to',label:'اتبعت لمين',required:true},{key:'note',label:'ملاحظات (اختياري)',type:'textarea'}]}
     submit={async values=>{if(!window.confirm('تقفيل اليوم؟ بعد التقفيل مش هتقدر تعدّله، المالك بس يقدر يفتحه.'))return;
      const {error}=await db.rpc('clinic_day_close',{payload:{day,handed_to_owner_minor:values.handed_to_owner_minor,handed_to:values.handed_to,note:values.note}});if(error)throw error;await after();}}>
     {values=>{let handed:bigint;try{handed=BigInt(minor(text(values.handed_to_owner_minor)||'0'));}catch{return null;}
      const drawerAmount=big(summary.drawer_minor);return handoverAllowed(drawerAmount,handed)?<p className="notice wide">يترحل لبكرة: {money(carriedOut(drawerAmount,handed))}</p>:<p className="error wide">المبلغ أكبر من الكاش اللي في الدرج.</p>;}}
    </Form></section>}
  </>}
  {(['percentage','renting'] as DaySection[]).map(section=><section key={section}><h2>{sectionTitles[section]}</h2>
   <Table rows={visits.filter(row=>daySection(doctor(row.doctor_id)?.category)===section)} columns={columns} empty="مفيش مرضى في اليومية دي."/></section>)}
  <h2>المصروفات</h2>{profile.role!=='owner'&&<p className="notice">الإجمالي فوق بيشمل مصروفات كل الاستقبال. الجدول ده بيعرض اللي إنت سجلته بس.</p>}
  <Table rows={expenses} columns={[{label:'المبلغ',numeric:true,render:row=>money(row.amount_minor)},{label:'سبب الصرف',render:row=>text(row.description)},{label:'البند',render:row=>expenseCategories[text(row.category)]??text(row.category)},{label:'المستلم',render:row=>text(row.recipient)||'—'},{label:'طريقة الدفع',render:row=>label(row.method)}]} empty="مفيش مصروفات مسجلة اليوم ده."/>
 </>;
}
