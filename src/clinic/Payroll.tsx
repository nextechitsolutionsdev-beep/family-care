import {useState} from 'react';
import {date,db,label,text,today,type Row} from './api';
import {normalizeEgyptianPhone} from '../domain/phone';
import {useClinic} from './store';
import {Badge,Dialog,Form,Table,type Field} from './ui';
import {money} from '../domain/money';
import {monthOf,monthTotals,tenure,type PayrollKind} from '../domain/payroll';
import {paymentMethodOptions} from './paymentMethods';

const kindTitles:Record<PayrollKind,string>={advance:'سلفة',deduction:'خصم',bonus:'مكافأة',payout:'صرف المرتب'};
const monthTitle=(month:string)=>{const [year,number]=month.split('-');return `${number}/${year}`;};
const write=async(rpc:'clinic_payroll'|'clinic_employee_save',payload:Record<string,unknown>)=>{const {data,error}=await db.rpc(rpc,{payload});if(error)throw error;return data as Row;};

/** «موظفين» under the expenses (owner only): salaries, bonuses, advances and deductions per month. Advances and salary
 * payments become expenses («أجور وعمالة») automatically. */
export default function Payroll(){
 const {rows,refresh}=useClinic();const [month,setMonth]=useState(monthOf(today()));
 const [employee,setEmployee]=useState<Row|null|undefined>();const [entry,setEntry]=useState<{employee:Row;kind:PayrollKind;key:string}|null>(null);
 const [report,setReport]=useState<Row|null>(null);const [salary,setSalary]=useState<Row|null>(null);const [showLeft,setShowLeft]=useState(false);
 const employees=rows('employees').filter(row=>showLeft||row.active).sort((a,b)=>text(a.name).localeCompare(text(b.name),'ar'));
 const monthSalary=(row:Row,on:string)=>{const saved=rows('payroll_months').find(item=>item.employee_id===row.id&&text(item.month)===on);return BigInt(text(saved?.salary_minor??(row.active?row.salary_minor:0)));};
 const entriesOf=(row:Row,on:string)=>rows('payroll_entries').filter(item=>item.employee_id===row.id&&text(item.month)===on);
 const totals=employees.map(row=>monthTotals(monthSalary(row,month),entriesOf(row,month)));
 const sum=(key:keyof ReturnType<typeof monthTotals>)=>totals.reduce((total,row)=>total+row[key],0n);
 const after=async()=>{await refresh('all');};
 return <>
  <div className="toolbar"><button className="primary" onClick={()=>setEmployee(null)}>موظف جديد</button>
   <label>الشهر<input type="month" value={month.slice(0,7)} onChange={event=>event.target.value&&setMonth(event.target.value+'-01')}/></label>
   <label className="check"><input type="checkbox" checked={showLeft} onChange={event=>setShowLeft(event.target.checked)}/>إظهار اللي سابوا الشغل</label></div>
  <div className="day-kpis">
   <div><small>مرتبات شهر {monthTitle(month)}</small><strong>{money(sum('salary'))}</strong></div>
   <div><small>المكافآت</small><strong>{money(sum('bonus'))}</strong></div>
   <div><small>السلف</small><strong>{money(sum('advance'))}</strong></div>
   <div><small>الخصومات</small><strong>{money(sum('deduction'))}</strong></div>
   <div><small>اتصرف من المرتبات</small><strong>{money(sum('payout'))}</strong></div>
   <div className="total"><small>المتبقي يتدفع للموظفين</small><strong>{money(sum('due'))}</strong></div>
  </div>
  <p className="notice">السلفة وصرف المرتب بيتسجلوا لوحدهم في المصروفات (بند «أجور وعمالة») بطريقة الدفع اللي تختارها، ولو كاش بيتخصموا من درج اليوم. الخصم والمكافأة مش فلوس بتخرج، فمش بيتسجلوا مصروف.</p>
  <Table rows={employees} empty="مفيش موظفين لسه. دوس «موظف جديد»." columns={[
   {label:'الموظف',render:row=><button className="link" onClick={()=>setReport(row)}>{text(row.name)}</button>},
   {label:'الوظيفة',render:row=>text(row.job_title)||'—'},
   {label:'المرتب',numeric:true,render:row=><button className="link" title="تعديل مرتب الشهر ده" onClick={()=>setSalary(row)}>{money(monthSalary(row,month))}</button>},
   {label:'مكافأة',numeric:true,render:(row:Row)=>money(monthTotals(monthSalary(row,month),entriesOf(row,month)).bonus)},
   {label:'سلف',numeric:true,render:(row:Row)=>money(monthTotals(monthSalary(row,month),entriesOf(row,month)).advance)},
   {label:'خصم',numeric:true,render:(row:Row)=>money(monthTotals(monthSalary(row,month),entriesOf(row,month)).deduction)},
   {label:'اتصرف',numeric:true,render:(row:Row)=>money(monthTotals(monthSalary(row,month),entriesOf(row,month)).payout)},
   {label:'المتبقي له',numeric:true,render:(row:Row)=>{const due=monthTotals(monthSalary(row,month),entriesOf(row,month)).due;return <strong className={due<0n?'negative':''}>{money(due)}</strong>;}},
   {label:'الإجراء',render:row=><div className="actions">{(['advance','deduction','bonus','payout'] as PayrollKind[]).map(kind=><button key={kind} onClick={()=>setEntry({employee:row,kind,key:crypto.randomUUID()})}>{kindTitles[kind]}</button>)}<button onClick={()=>setEmployee(row)}>تعديل</button></div>}]}/>
  {employee!==undefined&&<EmployeeDialog row={employee} close={()=>setEmployee(undefined)} saved={async()=>{await after();setEmployee(undefined);}}/>}
  {salary&&<Dialog title={`مرتب ${text(salary.name)} — شهر ${monthTitle(month)}`} close={()=>setSalary(null)}><Form initial={{salary_minor:monthSalary(salary,month)}} label="حفظ مرتب الشهر" fields={[{key:'salary_minor',label:'مرتب الشهر ده بالجنيه',type:'money',required:true,hint:'بيغيّر الشهر ده بس. لتغيير المرتب من هنا ورايح عدّل بيانات الموظف.'}]}
   submit={async values=>{await write('clinic_payroll',{action:'month_salary',employee_id:salary.id,month,salary_minor:values.salary_minor});await after();setSalary(null);}}/></Dialog>}
  {entry&&<Dialog title={`${kindTitles[entry.kind]} — ${text(entry.employee.name)}`} close={()=>setEntry(null)}><Form initial={{entry_date:today(),method:'cash'}} label="حفظ" fields={[
    {key:'amount_minor',label:'المبلغ بالجنيه',type:'money',required:true,blankInitially:true},
    {key:'entry_date',label:'التاريخ',type:'date',required:true},
    ...(entry.kind==='advance'||entry.kind==='payout'?[{key:'method',label:'اتدفع إزاي',type:'select' as const,required:true,options:()=>paymentMethodOptions()}]:[]),
    {key:'note',label:entry.kind==='deduction'?'سبب الخصم':'ملاحظات (اختياري)',required:entry.kind==='deduction'} as Field]}
   submit={async values=>{await write('clinic_payroll',{action:'add',employee_id:entry.employee.id,month,kind:entry.kind,amount_minor:values.amount_minor,entry_date:values.entry_date,
    method:entry.kind==='advance'||entry.kind==='payout'?values.method:null,note:values.note,idempotency_key:entry.key});await after();setEntry(null);}}>
   <p className="notice wide">بيتحسب على شهر {monthTitle(month)}.{entry.kind==='advance'||entry.kind==='payout'?' هيتسجل مصروف «أجور وعمالة» بنفس المبلغ والطريقة.':''}</p></Form></Dialog>}
  {report&&<EmployeeReport row={report} month={month} monthSalary={monthSalary} close={()=>setReport(null)} changed={after}/>}
 </>;
}

function EmployeeDialog({row,close,saved}:{row:Row|null;close:()=>void;saved:()=>Promise<void>}){
 return <Dialog title={row?`تعديل ${text(row.name)}`:'موظف جديد'} close={close}><Form initial={row??{hire_date:today(),active:true}} label="حفظ الموظف" fields={[
   {key:'name',label:'الاسم',required:true},{key:'job_title',label:'الوظيفة (اختياري)',hint:'مثال: استقبال، أسيستنت، عامل نظافة.'},
   {key:'phone_e164',label:'الموبايل (اختياري)'},{key:'hire_date',label:'تاريخ التعيين',type:'date',required:true},
   {key:'start_salary_minor',label:'بدأ بمرتب (جنيه)',type:'money',required:true},{key:'salary_minor',label:'مرتبه الحالي (جنيه)',type:'money',required:true},
   {key:'note',label:'ملاحظات (اختياري)',type:'textarea'},{key:'active',label:'لسه شغال',type:'checkbox'}]}
  submit={async values=>{const phone=normalizeEgyptianPhone(values.phone_e164);if(phone&&!/^\+20[0-9]{9,10}$/.test(phone))throw new Error('اكتب رقم موبايل مصري صحيح، مثل 01012345678.');
   await write('clinic_employee_save',{...values,phone_e164:phone||null,...(row?{id:row.id}:{})});await saved();}}/></Dialog>;
}

function EmployeeReport({row,month,monthSalary,close,changed}:{row:Row;month:string;monthSalary:(row:Row,on:string)=>bigint;close:()=>void;changed:()=>Promise<void>}){
 const {rows}=useClinic();const [voiding,setVoiding]=useState<Row|null>(null);
 const entries=rows('payroll_entries').filter(item=>item.employee_id===row.id);
 const current=entries.filter(item=>text(item.month)===month).sort((a,b)=>text(b.entry_date).localeCompare(text(a.entry_date))||text(b.created_at).localeCompare(text(a.created_at)));
 const totals=monthTotals(monthSalary(row,month),current);
 const months=[...new Set([...rows('payroll_months').filter(item=>item.employee_id===row.id).map(item=>text(item.month)),...entries.map(item=>text(item.month))])].filter(item=>item!==month).sort().reverse();
 return <Dialog title={`تقرير ${text(row.name)}`} close={close}>
  <div className="day-kpis"><div><small>بقاله في الشغل</small><strong className="plain">{tenure(text(row.hire_date),today())}</strong><small>من {date(row.hire_date)}</small></div>
   <div><small>بدأ بمرتب</small><strong>{money(row.start_salary_minor)}</strong></div><div><small>مرتبه الحالي</small><strong>{money(row.salary_minor)}</strong></div>
   {!row.active&&<div><small>الحالة</small><strong className="plain">ساب الشغل</strong></div>}</div>
  <h3>شهر {monthTitle(month)}</h3>
  <div className="day-kpis"><div><small>المرتب</small><strong>{money(totals.salary)}</strong></div><div><small>مكافآت</small><strong>{money(totals.bonus)}</strong></div>
   <div><small>سلف</small><strong>{money(totals.advance)}</strong></div><div><small>خصومات</small><strong>{money(totals.deduction)}</strong></div>
   <div><small>اتصرف</small><strong>{money(totals.payout)}</strong></div><div className="total"><small>المتبقي له</small><strong>{money(totals.due)}</strong></div></div>
  <Table rows={current} empty="مفيش حركات الشهر ده." columns={[{label:'التاريخ',render:item=>date(item.entry_date)},{label:'النوع',render:item=>kindTitles[item.kind as PayrollKind]},
   {label:'المبلغ',numeric:true,render:item=>money(item.amount_minor)},{label:'الطريقة',render:item=>item.method?label(item.method):'—'},{label:'ملاحظات',render:item=>text(item.note)||'—'},
   {label:'الحالة',render:item=>item.voided_at?<Badge>ملغي: {text(item.void_reason)}</Badge>:'مسجل'},
   {label:'الإجراء',render:item=>item.voided_at?'—':<button onClick={()=>setVoiding(item)}>إلغاء</button>}]}/>
  {months.length>0&&<><h3>الشهور اللي فاتت</h3><Table rows={months.map(on=>({id:on,on,...monthTotals(monthSalary(row,on),entries.filter(item=>text(item.month)===on))}))} columns={[
   {label:'الشهر',render:item=>monthTitle(text(item.on))},{label:'المرتب',numeric:true,render:item=>money(item.salary)},{label:'مكافآت',numeric:true,render:item=>money(item.bonus)},
   {label:'سلف',numeric:true,render:item=>money(item.advance)},{label:'خصم',numeric:true,render:item=>money(item.deduction)},{label:'اتصرف',numeric:true,render:item=>money(item.payout)},{label:'المتبقي',numeric:true,render:item=>money(item.due)}]}/></>}
  {voiding&&<Dialog title={`إلغاء ${kindTitles[voiding.kind as PayrollKind]}`} close={()=>setVoiding(null)}><Form fields={[{key:'reason',label:'سبب الإلغاء',required:true}]} label="تأكيد الإلغاء"
   submit={async values=>{await write('clinic_payroll',{action:'void',id:voiding.id,reason:values.reason});await changed();setVoiding(null);}}>
   <p className="notice wide">الحركة هتفضل في السجل وعليها «ملغي».{voiding.expense_id?' والمصروف اللي اتسجل معاها هيتلغي.':''}</p></Form></Dialog>}
 </Dialog>;
}
