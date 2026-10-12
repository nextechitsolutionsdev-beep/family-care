import {useState} from 'react';
import {Link,useParams} from 'react-router-dom';
import {command,date,label,text,today,percentLabel,type Row} from './api';
import {useClinic,patientPaid} from './store';
import {Dialog,Form,Heading,Table,Badge,useTask} from './ui';
import {money} from '../domain/money';
function Receipt({payment,close}:{payment:Row;close:()=>void}) {
 const {rows,name}=useClinic();const visit=rows('visits').find(row=>row.id===payment.visit_id);
 return <Dialog title="إيصال التحصيل" close={close}><div className="print-receipt"><img src="/logo.jpg" alt="فاميلي كير" width="64" height="64"/><h2>فاميلي كير — إيصال {label(payment.kind)}</h2><p>رقم الإيصال: <bdi>{text(payment.receipt_number)}</bdi></p><p>التاريخ: <bdi>{date(payment.paid_at)}</bdi></p><p>العميل: {name('patients',payment.patient_id)}</p><p>الزيارة: <bdi>{date(visit?.visit_date)}</bdi></p><p>المبلغ: <strong>{money(payment.amount_minor)}</strong> · {label(payment.method)}</p><Table rows={rows('payment_allocations').filter(row=>row.payment_id===payment.id).map((row,index)=>({...row,id:String(index)}))} columns={[{label:'الخدمة',render:row=>{const line=rows('visit_lines').find(line=>line.id===row.visit_line_id);return name('services',line?.service_id);}},{label:'المبلغ الموزع',numeric:true,render:row=>money(row.amount_minor)}]}/><p>الموظف: {name('profiles',payment.recorded_by)}</p></div><button className="primary no-print" onClick={()=>window.print()}>طباعة الإيصال</button></Dialog>;
}
export default function Visit(){
 const {id}=useParams();const {data,rows,name,profile,refresh}=useClinic();const task=useTask(refresh);
 const [dialog,setDialog]=useState('');const [paymentKey,setPaymentKey]=useState('');const [receipt,setReceipt]=useState<Row|null>(null);
 const v=rows('visits').find(row=>row.id===id);if(!v)return <p className="empty">الزيارة غير موجودة أو غير متاحة لحسابك.</p>;
 const patient=rows('patients').find(row=>row.id===v.patient_id);const lines=rows('visit_lines').filter(row=>row.visit_id===id).sort((a,b)=>Number(a.sequence)-Number(b.sequence));
 const payments=rows('payments').filter(row=>row.visit_id===id);const isDoctor=profile.role==='doctor';
 const paid=patientPaid(data,id);const remaining=BigInt(text(v.co_pay_minor||0))-paid;
 const locked=payments.length>0||rows('insurance_invoices').some(row=>row.visit_id===id)||v.status!=='open';
 const activeServices=rows('services').filter(row=>row.active&&row.specialty_id===v.specialty_id&&row.pricing_kind!=='home');
 return <><Heading title={`زيارة ${name('patients',v.patient_id)}`} detail={`${date(v.visit_date)} · ${name('doctors',v.doctor_id)} · ${label(v.location)}`}><Link className="button" to={`/patients/${text(v.patient_id)}`}>ملف العميل</Link><Badge>{label(v.status)}</Badge></Heading>{task.feedback}
 {patient?.demo_batch_id&&<p className="notice">زيارة تجريبية — بيانات اختبار.</p>}
 {['insurance_credit','syndicate_cash'].includes(text(v.client_type_code))&&!isDoctor&&<p className="notice">{v.client_type_code==='syndicate_cash'?'النقابة':'شركة التأمين'}: {v.client_type_code==='syndicate_cash'?name('unions',v.union_id):name('insurance_companies',v.insurer_id)} · العميل يتحمل {percentLabel(v.co_pay_bps)} · الجهة تغطي {percentLabel(10000-Number(v.co_pay_bps))}. السعر المثبت لكل خدمة موضح أدناه.</p>}
 {!isDoctor&&<><div className="ledger-summary"><span>الإجمالي <strong>{money(v.total_minor)}</strong></span><span>حصة العميل <strong>{money(v.co_pay_minor)}</strong></span><span>على الجهة <strong>{money(v.covered_minor)}</strong></span><span>المحصّل <strong>{money(paid)}</strong></span><span>المتبقي <strong>{money(remaining)}</strong></span></div>
 {!v.confirmed&&<p className="notice">الحجز بانتظار ديبوزيت {money(v.deposit_required_minor)}. التحصيل المسجل {money(paid)}.</p>}
 {v.deposit_exemption_reason==='fully_covered_insurance'&&<p className="notice">الجهة تغطي الزيارة بالكامل؛ لا توجد حصة أو ديبوزيت على العميل.</p>}
 <div className="toolbar"><button className="primary" disabled={locked||Boolean(v.offer_id)} onClick={()=>setDialog('service')}>إضافة خدمة</button><button disabled={locked||Boolean(v.offer_id)||!lines.length} onClick={()=>setDialog('offer')}>تطبيق كود عرض</button><button disabled={remaining<=0||v.status==='void'} onClick={()=>{setPaymentKey(crypto.randomUUID());setDialog('payment');}}>تسجيل تحصيل</button><span>{locked?'الفاتورة مثبتة؛ إلغاء خدمة بعد التحصيل أو إنهاء الزيارة يحتاج تصحيحًا ماليًا مسجلًا من الأدمن.':v.offer_id?'العرض اتطبق على الخدمات الحالية.':'اختار الخدمات، وبعدها طبّق العرض وسجّل التحصيل.'}</span></div></>}
 <h2>الخدمات</h2><Table rows={lines} columns={[
 {label:'الخدمة',render:row=><>{name('services',row.service_id)} {row.is_gift?<Badge tone="success">هدية</Badge>:row.is_bundle?<Badge>باقة</Badge>:null}</>},
 {label:'الطبيب',render:row=>name('doctors',row.doctor_id)},{label:'العدد',numeric:true,render:row=>text(row.quantity)},
 {label:'السعر وقت الزيارة',numeric:true,render:row=>money(row.unit_price_minor)},{label:'الخصم',numeric:true,render:row=>money(row.discount_minor)},
 {label:'الإجمالي',numeric:true,render:row=>money(row.line_total_minor)},
 ...(!isDoctor?[{label:'الإجراء',render:(row:Row)=><button disabled={locked||Boolean(v.offer_id)||task.busy} onClick={()=>{if(window.confirm('إلغاء هذه الخدمة قبل تثبيت الفاتورة؟ لو ضمن باقة، تُلغى الباقة وخدماتها معًا.'))void task.run(()=>command('line_remove',{id:row.id}));}}>إلغاء الخدمة</button>}]:[])
 ]}/>
 <h2>الكشف والمتابعة</h2><p>{text(v.diagnosis)||'لم يُسجل تشخيص بعد.'}</p><p>{text(v.instructions)||'لم تُسجل تعليمات بعد.'}</p>
 <div className="toolbar"><button disabled={v.status==='void'} onClick={()=>setDialog('clinical')}>{v.status==='completed'?'تعديل الكشف / إضافة متابعة':'الكشف وإنهاء الزيارة'}</button><button disabled={v.status==='void'} onClick={()=>setDialog('followup')}>متابعة جديدة</button>{profile.role==='owner'&&v.status!=='void'&&<button disabled={task.busy} onClick={()=>{if(window.confirm('إلغاء الزيارة؟ يجب عكس التحصيل والتسويات أولاً.'))void task.run(()=>command('visit_void',{id:v.id}));}}>إلغاء الزيارة</button>}</div>
 {!isDoctor&&<><h2>التحصيل والإيصالات</h2><Table rows={payments} columns={[
 {label:'الإيصال',render:row=><bdi>{text(row.receipt_number)}</bdi>},{label:'التاريخ',render:row=>date(row.paid_at)},{label:'النوع',render:row=>label(row.kind)},
 {label:'المبلغ',numeric:true,render:row=>money(row.amount_minor)},{label:'الطريقة',render:row=>label(row.method)},
 {label:'الإجراء',render:row=><div className="actions"><button onClick={()=>setReceipt(row)}>عرض / طباعة</button>{profile.role==='owner'&&row.kind!=='refund'&&!payments.some(pay=>pay.reverses_payment_id===row.id)&&<button disabled={task.busy} onClick={()=>{if(window.confirm('رد هذا التحصيل بالكامل؟ سيُسجل إيصال عكس مع الحفاظ على الإيصال الأصلي.'))void task.run(()=>command('payment_reverse',{id:row.id,idempotency_key:crypto.randomUUID()}));}}>رد المبلغ</button>}</div>}
 ]}/></>}
 {dialog==='service'&&<Dialog title="إضافة خدمة للزيارة" close={()=>setDialog('')}><Form initial={{doctor_id:v.doctor_id,quantity:1,is_gift:false}} fields={[
 {key:'service_id',label:'الخدمة',type:'select',required:true,options:activeServices.map(row=>({value:row.id,label:text(row.name)}))},
 {key:'doctor_id',label:'الطبيب المنفذ',type:'select',required:true,options:rows('doctors').filter(row=>row.active&&row.specialty_id===v.specialty_id).map(row=>({value:row.id,label:text(row.name)}))},
 {key:'quantity',label:'العدد',type:'number',required:true,min:1,max:1000},{key:'is_gift',label:'هدية بدون مقابل',type:'checkbox'}
 ]} submit={async values=>{await command('line_add',{...values,visit_id:id});await refresh();setDialog('');}} label="إضافة الخدمة"/></Dialog>}
 {dialog==='offer'&&<Dialog title="تطبيق عرض" close={()=>setDialog('')}><Form fields={[{key:'code',label:'كود العرض',required:true}]} submit={async values=>{await command('offer_apply',{...values,visit_id:id});await refresh();setDialog('');}} label="تطبيق العرض"/></Dialog>}
 {dialog==='payment'&&<Dialog title="تسجيل تحصيل" close={()=>setDialog('')}><Form initial={{amount_minor:Number(remaining),method:'cash',kind:!v.confirmed?'deposit':'payment'}} fields={[
 {key:'amount_minor',label:'المبلغ بالجنيه',type:'money',required:true,hint:`المتبقي ${money(remaining)}`},
 {key:'method',label:'طريقة الدفع',type:'select',required:true,options:['cash','card','transfer'].map(value=>({value,label:label(value)}))},
 {key:'kind',label:'النوع',type:'select',required:true,options:[{value:'payment',label:'تحصيل'},{value:'deposit',label:'ديبوزيت حجز'}]}
 ]} submit={async values=>{const result=await command('payment',{...values,visit_id:id,idempotency_key:paymentKey});await refresh();setDialog('');setReceipt(result as Row);}} label="تسجيل وطباعة الإيصال"/></Dialog>}
 {dialog==='clinical'&&<Dialog title="الكشف والمتابعة" close={()=>setDialog('')}><Form initial={v} fields={[
 {key:'diagnosis',label:'التشخيص / ملاحظات الكشف',type:'textarea',required:true},{key:'instructions',label:'تعليمات العميل',type:'textarea'},
 {key:'follow_up_date',label:'موعد المتابعة (اختياري)',type:'date'},{key:'follow_up_time',label:'وقت المتابعة',type:'time',when:values=>Boolean(values.follow_up_date)},
 {key:'follow_up_purpose',label:'غرض المتابعة',required:true,when:values=>Boolean(values.follow_up_date)}
 ]} submit={async values=>{await command(v.status==='completed'?'clinical_save':'visit_complete',{...values,visit_id:id});await refresh();setDialog('');}} label={v.status==='completed'?'حفظ الكشف':'حفظ وإنهاء الزيارة'}/></Dialog>}
 {dialog==='followup'&&<Dialog title="متابعة جديدة" close={()=>setDialog('')}><Form initial={{due_date:today()}} fields={[{key:'due_date',label:'التاريخ',type:'date',required:true},{key:'due_time',label:'الوقت',type:'time'},{key:'purpose',label:'الغرض',required:true}]} submit={async values=>{await command('follow_up_save',{...values,visit_id:id});await refresh();setDialog('');}}/></Dialog>}
 {receipt&&<Receipt payment={receipt} close={()=>setReceipt(null)}/>}
 </>;
}
