import Payroll from './Payroll';
import {paymentMethodOptions} from './paymentMethods';
import {useState} from 'react';
import {db,date,text,today,label} from './api';
import {useClinic} from './store';
import {Dialog,Form,Heading,Table,useTask,exportCsv,DateInput} from './ui';
import {money} from '../domain/money';
export const expenseCategories:Record<string,string>={maintenance:'صيانة وتصليح',supplies:'مستلزمات',utilities:'فواتير وإيجار',wages:'أجور وعمالة',lab:'معمل أسنان',other:'أخرى'};
function ExpenseLedger(){
 const {profile,rows,refresh,name}=useClinic();const owner=profile.role==='owner';
 const [from,setFrom]=useState(today().slice(0,8)+'01');const [until,setUntil]=useState(today());const [category,setCategory]=useState('');
 const [key,setKey]=useState('');const [cancel,setCancel]=useState('');const task=useTask(refresh);
 const entries=rows('expenses').filter(row=>text(row.spent_on)>=from&&text(row.spent_on)<=until&&(!category||row.category===category)).sort((a,b)=>text(b.spent_on).localeCompare(text(a.spent_on))||text(b.created_at).localeCompare(text(a.created_at)));
 const valid=entries.filter(row=>!row.voided_at);const total=valid.reduce((sum,row)=>sum+BigInt(text(row.amount_minor)),0n);
 const write=async(payload:Record<string,unknown>)=>{const {error}=await db.rpc('clinic_expense',{payload});if(error)throw error;await refresh('operational');};
 return <><Heading title="المصروفات" detail={owner?'إجمالي مصاريف العيادة وتفاصيل كل عملية.':'سجّل المبلغ وسبب الصرف. تظهر هنا المصروفات التي سجلتها فقط.'}><button className="primary" onClick={()=>setKey(crypto.randomUUID())}>تسجيل مصروف</button>{owner&&<><button onClick={()=>window.print()}>طباعة</button><button disabled={!entries.length} onClick={()=>exportCsv(entries.map(row=>({التاريخ:date(row.spent_on),البند:expenseCategories[text(row.category)],السبب:row.description,المستلم:row.recipient,المبلغ:money(row.amount_minor),الطريقة:label(row.method),الموظف:name('profiles',row.created_by),الحالة:row.voided_at?'ملغى':'مسجل',سبب_الإلغاء:row.void_reason})),'expenses.csv')}>تصدير CSV</button></>}</Heading>
 <div className="filters"><label>من<DateInput value={from} onChange={value=>setFrom(value)}/></label><label>إلى<DateInput value={until} onChange={value=>setUntil(value)}/></label><label>البند<select value={category} onChange={event=>setCategory(event.target.value)}><option value="">كل البنود</option>{Object.entries(expenseCategories).map(([value,title])=><option key={value} value={value}>{title}</option>)}</select></label></div>
 {from>until?<p className="error">تاريخ البداية لازم يكون قبل تاريخ النهاية.</p>:null}
 {owner&&<><div className="ledger-summary"><span>إجمالي المصروفات <strong>{money(total)}</strong></span><span>عدد المصروفات <strong>{valid.length}</strong></span></div><h2>تفصيل حسب البند</h2><Table rows={Object.entries(expenseCategories).map(([id,title])=>({id,title,amount:valid.filter(row=>row.category===id).reduce((sum,row)=>sum+BigInt(text(row.amount_minor)),0n)}))} columns={[{label:'البند',render:row=>text(row.title)},{label:'المبلغ',numeric:true,render:row=>money(row.amount)}]}/></>}
 {task.feedback}<h2>{owner?'كل مصروف بالتفصيل':'المصروفات التي سجلتها'}</h2><Table rows={entries} columns={[{label:'التاريخ',render:row=>date(row.spent_on)},{label:'المبلغ',numeric:true,render:row=>money(row.amount_minor)},{label:'البند',render:row=>expenseCategories[text(row.category)]},{label:'سبب الصرف',render:row=>text(row.description)},{label:'المستلم',render:row=>text(row.recipient)||'—'},{label:'طريقة الدفع',render:row=>label(row.method)},...(owner?[{label:'سجّله',render:(row:import('./api').Row)=>name('profiles',row.created_by)}]:[]),{label:'الحالة',render:row=>row.voided_at?`ملغى: ${text(row.void_reason)}`:'مسجل'},...(owner?[{label:'الإجراء',render:(row:import('./api').Row)=>!row.voided_at?<button disabled={task.busy} onClick={()=>setCancel(row.id)}>إلغاء المصروف</button>:'—'}]:[])]}/>
 {key&&<Dialog title="تسجيل مصروف" close={()=>setKey('')}><Form initial={{spent_on:today(),method:'cash',category:'maintenance'}} fields={[{key:'amount_minor',label:'المبلغ بالجنيه',type:'money',required:true,blankInitially:true},{key:'description',label:'سبب الصرف',required:true,hint:'مثال: عامل تصليح الكرسي.'},{key:'category',label:'البند',type:'select',required:true,options:Object.entries(expenseCategories).map(([value,title])=>({value,label:title}))},{key:'spent_on',label:'تاريخ المصروف',type:'date',required:true},{key:'recipient',label:'اسم المستلم (اختياري)'},{key:'method',label:'طريقة الدفع',type:'select',required:true,options:()=>paymentMethodOptions()}]} submit={async values=>{await write({...values,action:'create',idempotency_key:key});setKey('');}} label="حفظ المصروف"/></Dialog>}
 {cancel&&<Dialog title="إلغاء المصروف" close={()=>setCancel('')}><Form fields={[{key:'reason',label:'سبب الإلغاء',required:true}]} submit={async values=>{await write({...values,action:'void',id:cancel});setCancel('');}} label="تأكيد الإلغاء"><p className="notice wide">يبقى السجل محفوظاً ويُستبعد من الإجمالي. لو المبلغ غلط، ألغِه وسجّل المبلغ الصحيح.</p></Form></Dialog>}</>;
}
/** «المصروفات» with the owner's «الموظفين» tab (owner decision 19/11/2026); reception sees the expenses only. */
export default function Expenses(){
 const {profile,capabilities}=useClinic();const [tab,setTab]=useState<'ledger'|'staff'>('ledger');
 if(profile.role!=='owner'||!capabilities.payroll)return <ExpenseLedger/>;
 return <><div className="tabs" role="tablist" aria-label="أقسام المصروفات">{([['ledger','المصروفات'],['staff','الموظفين']] as const).map(([id,title])=><button key={id} role="tab" aria-selected={tab===id} className={tab===id?'selected':''} onClick={()=>setTab(id)}>{title}</button>)}</div>
  {tab==='ledger'?<ExpenseLedger/>:<><Heading title="الموظفين" detail="المرتبات والمكافآت والسلف والخصومات لكل موظف في الشهر."/><Payroll/></>}</>;
}
