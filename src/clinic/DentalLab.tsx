import {useState} from 'react';
import {Link} from 'react-router-dom';
import {date,db,text,today,type Row} from './api';
import {normalizeEgyptianPhone} from '../domain/phone';
import {useClinic} from './store';
import {Badge,DateInput,Dialog,Form,Heading,Table,exportCsv} from './ui';
import {money} from '../domain/money';
import {labStatus,labTotals,type LabStatus} from '../domain/dentalLab';
import {paymentMethodOptions} from './paymentMethods';

const statusTitles:Record<LabStatus,string>={in_lab:'في المعمل',back:'رجعت من المعمل',cancelled:'ملغية'};
const write=async(payload:Record<string,unknown>)=>{const {data,error}=await db.rpc('clinic_lab_case',{payload});if(error)throw error;return data as Row;};
const phoneText=(value:unknown)=>text(value).replace(/^\+20/,'0');

/** «معمل الأسنان» (owner decision 19/11/2026): the desk's lab sheet with the lab's price. Paying the lab records an
 * expense in «معمل أسنان». */
export default function DentalLab(){
 const {rows,name,profile,refresh}=useClinic();const owner=profile.role==='owner';
 const [from,setFrom]=useState(today().slice(0,8)+'01');const [until,setUntil]=useState(today());const [status,setStatus]=useState('');const [doctor,setDoctor]=useState('');const [search,setSearch]=useState('');
 const [edit,setEdit]=useState<Row|null|undefined>();const [paying,setPaying]=useState<{row:Row;key:string}|null>(null);const [action,setAction]=useState<{row:Row;kind:'unpay'|'cancel'}|null>(null);
 const expenses=new Map(rows('expenses').map(row=>[row.id,row]));
 const cases=rows('lab_cases').filter(row=>text(row.sent_on)>=from&&text(row.sent_on)<=until&&(!doctor||row.doctor_id===doctor)&&(!status||labStatus(row)===status)
  &&(!search.trim()||`${text(row.patient_name)} ${phoneText(row.patient_phone)} ${text(row.work)}`.includes(search.trim()))).sort((a,b)=>text(b.sent_on).localeCompare(text(a.sent_on))||text(b.created_at).localeCompare(text(a.created_at)));
 const totals=labTotals(cases);const after=async()=>{await refresh('all');};
 const dentists=rows('doctors').filter(row=>row.active||rows('lab_cases').some(item=>item.doctor_id===row.id));
 return <><Heading title="معمل الأسنان" detail="الشغل اللي راح المعمل ورجع، والدكتور، والأسيستنت، وسعر المعمل."><button className="primary" onClick={()=>setEdit(null)}>شغل جديد للمعمل</button>
   <button disabled={!cases.length} onClick={()=>exportCsv(cases.map(row=>({اسم_المريض:row.patient_name,رقم_المريض:phoneText(row.patient_phone),اسم_الدكتور:name('doctors',row.doctor_id),راحت_المعمل:date(row.sent_on),جت_من_المعمل:row.received_on?date(row.received_on):'',حالة_التركيبة_والنوع:row.work,توقيع_الأسيستنت:row.assistant,المعمل:row.lab_name,السعر:money(row.price_minor),الدفع:row.paid_expense_id?'اتدفع':'لسه'})),'dental-lab.csv')}>تصدير CSV</button><button onClick={()=>window.print()}>طباعة</button></Heading>
  <div className="filters"><label>راحت المعمل من<DateInput value={from} onChange={setFrom}/></label><label>إلى<DateInput value={until} onChange={setUntil}/></label>
   <label>الحالة<select value={status} onChange={event=>setStatus(event.target.value)}><option value="">الكل</option>{(Object.keys(statusTitles) as LabStatus[]).map(key=><option key={key} value={key}>{statusTitles[key]}</option>)}</select></label>
   <label>الدكتور<select value={doctor} onChange={event=>setDoctor(event.target.value)}><option value="">كل الدكاترة</option>{dentists.map(row=><option key={row.id} value={row.id}>{text(row.name)}</option>)}</select></label>
   <label>بحث<input type="search" value={search} onChange={event=>setSearch(event.target.value)} placeholder="اسم، موبايل، نوع الشغل"/></label></div>
  <div className="day-kpis"><div><small>في المعمل دلوقتي</small><strong>{totals.inLab}</strong></div><div><small>رجعت</small><strong>{totals.back}</strong></div>
   <div><small>إجمالي سعر المعمل</small><strong>{money(totals.price)}</strong></div><div><small>اتدفع للمعمل</small><strong>{money(totals.paid)}</strong></div>
   <div className="total"><small>متبقي للمعمل</small><strong>{money(totals.unpaid)}</strong></div></div>
  <Table rows={cases} empty="مفيش شغل للمعمل في الفترة دي." columns={[
   {label:'اسم المريض',render:row=>row.patient_id?<Link to={`/patients/${text(row.patient_id)}`}>{text(row.patient_name)}</Link>:text(row.patient_name)},
   {label:'رقم المريض',render:row=><bdi>{phoneText(row.patient_phone)||'—'}</bdi>},{label:'اسم الدكتور',render:row=>name('doctors',row.doctor_id)},
   {label:'راحت المعمل',render:row=>date(row.sent_on)},{label:'جت من المعمل',render:row=>row.received_on?date(row.received_on):'—'},
   {label:'حالة التركيبة والنوع',render:row=>text(row.work)},{label:'توقيع الأسيستنت',render:row=>text(row.assistant)||'—'},{label:'المعمل',render:row=>text(row.lab_name)||'—'},
   {label:'السعر',numeric:true,render:row=>money(row.price_minor)},
   {label:'الحالة',render:row=>{const state=labStatus(row);const paid=row.paid_expense_id?expenses.get(text(row.paid_expense_id)):null;
    return <>{<Badge tone={state==='in_lab'?'warning':state==='back'?'success':'neutral'}>{statusTitles[state]}</Badge>} {state!=='cancelled'&&BigInt(text(row.price_minor))>0n&&<Badge tone={row.paid_expense_id?'success':'warning'}>{row.paid_expense_id?`اتدفع${paid?` ${date(paid.spent_on)}`:''}`:'لسه ما اتدفعش'}</Badge>}</>;}},
   {label:'الإجراء',render:row=>labStatus(row)==='cancelled'?<small>{text(row.cancel_reason)}</small>:<div className="actions">
    <button onClick={()=>setEdit(row)}>تعديل</button>
    {!row.received_on&&<button onClick={()=>void write({...row,action:'save',received_on:today()}).then(after)}>رجعت النهارده</button>}
    {!row.paid_expense_id&&BigInt(text(row.price_minor))>0n&&<button onClick={()=>setPaying({row,key:crypto.randomUUID()})}>دفع للمعمل</button>}
    {Boolean(row.paid_expense_id)&&owner&&<button onClick={()=>setAction({row,kind:'unpay'})}>إلغاء الدفع</button>}
    {!row.paid_expense_id&&<button onClick={()=>setAction({row,kind:'cancel'})}>إلغاء</button>}</div>}]}/>
  {edit!==undefined&&<LabCaseDialog row={edit} close={()=>setEdit(undefined)} saved={async()=>{await after();setEdit(undefined);}}/>}
  {paying&&<Dialog title={`دفع للمعمل — ${text(paying.row.patient_name)}`} close={()=>setPaying(null)}><Form initial={{paid_on:today(),method:'cash'}} label="تسجيل الدفع" fields={[
    {key:'paid_on',label:'تاريخ الدفع',type:'date',required:true},{key:'method',label:'اتدفع إزاي',type:'select',required:true,options:()=>paymentMethodOptions()}]}
   submit={async values=>{await write({action:'pay',id:paying.row.id,paid_on:values.paid_on,method:values.method,idempotency_key:paying.key});await after();setPaying(null);}}>
   <p className="notice wide">هيتسجل مصروف «معمل أسنان» بمبلغ {money(paying.row.price_minor)}، ولو كاش بيتخصم من درج اليوم.</p></Form></Dialog>}
  {action&&<Dialog title={action.kind==='unpay'?'إلغاء دفع المعمل':'إلغاء الشغلانة'} close={()=>setAction(null)}><Form fields={[{key:'reason',label:'السبب',required:true}]} label="تأكيد"
   submit={async values=>{await write({action:action.kind,id:action.row.id,reason:values.reason});await after();setAction(null);}}>
   <p className="notice wide">{action.kind==='unpay'?'المصروف اللي اتسجل للمعمل هيتلغي، والشغلانة ترجع «لسه ما اتدفعش».':'الشغلانة هتفضل في السجل وعليها «ملغية» ومش هتدخل في الإجماليات.'}</p></Form></Dialog>}
 </>;
}

function LabCaseDialog({row,close,saved}:{row:Row|null;close:()=>void;saved:()=>Promise<void>}){
 const {rows}=useClinic();
 const patients=rows('patients').filter(patient=>patient.active).sort((a,b)=>text(a.name).localeCompare(text(b.name),'ar'));
 const doctors=rows('doctors').filter(doctor=>doctor.active||doctor.id===row?.doctor_id);
 const paid=Boolean(row?.paid_expense_id);
 return <Dialog title={row?'تعديل شغل المعمل':'شغل جديد للمعمل'} close={close}><Form initial={row?{...row,patient_phone:phoneText(row.patient_phone),patient_mode:row.patient_id?'system':'typed'}:{patient_mode:'system',sent_on:today(),price_minor:0}} label="حفظ" fields={[
   {key:'patient_mode',label:'المريض',type:'select',required:true,options:[{value:'system',label:'من عملاء السيستم'},{value:'typed',label:'اكتب الاسم والرقم'}],clearOnChange:['patient_id','patient_name','patient_phone']},
   {key:'patient_id',label:'العميل',type:'select',required:true,when:values=>values.patient_mode==='system',options:patients.map(patient=>({value:patient.id,label:`${text(patient.name)} — ${phoneText(patient.phone_e164)}`}))},
   {key:'patient_name',label:'اسم المريض',required:true,when:values=>values.patient_mode==='typed'},{key:'patient_phone',label:'رقم المريض (اختياري)',when:values=>values.patient_mode==='typed'},
   {key:'doctor_id',label:'اسم الدكتور',type:'select',required:true,options:doctors.map(doctor=>({value:doctor.id,label:text(doctor.name)}))},
   {key:'work',label:'حالة التركيبة والنوع',required:true,hint:'مثال: مقاس 2 كراون زيركون، بروفة مقاس ريتينر.'},
   {key:'sent_on',label:'راحت المعمل',type:'date',required:true},{key:'received_on',label:'جت من المعمل (لو رجعت)',type:'date'},
   {key:'assistant',label:'توقيع الأسيستنت'},{key:'lab_name',label:'اسم المعمل (اختياري)'},
   {key:'price_minor',label:'سعر المعمل بالجنيه',type:'money',required:true,hint:paid?'اتدفع للمعمل، فالسعر متقفل. المالك يقدر يلغي الدفع لو السعر غلط.':'اللي العيادة هتدفعه للمعمل. اكتب صفر لو لسه مش معروف.'},
   {key:'note',label:'ملاحظات (اختياري)',type:'textarea'}]}
  submit={async values=>{const phone=normalizeEgyptianPhone(values.patient_phone);if(values.patient_mode==='typed'&&phone&&!/^\+20[0-9]{9,10}$/.test(phone))throw new Error('اكتب رقم موبايل مصري صحيح، مثل 01012345678.');
   if(values.received_on&&text(values.received_on)<text(values.sent_on))throw new Error('تاريخ الرجوع لازم يكون بعد تاريخ ما راحت المعمل.');
   const {patient_mode,...rest}=values;await write({...rest,action:'save',patient_id:patient_mode==='system'?values.patient_id:null,patient_phone:patient_mode==='typed'?phone||null:null,...(row?{id:row.id}:{})});await saved();}}/></Dialog>;
}
