import {useState} from 'react';
import {db,label,text,type Row} from './api';
import {useClinic} from './store';
import {Dialog,Form} from './ui';
import {money} from '../domain/money';
import {refundableNow} from '../domain/cancellation';

/** «إلغاء الحجز» with a choice for the money already paid (owner decision 19/11/2026). The server reverses the receipts,
 * voids the visit and records what was returned and what the clinic keeps. */
export function CancelBookingDialog({visitId,close}:{visitId:unknown;close:()=>void}){
 const {rows,name,refresh}=useClinic();const [done,setDone]=useState<Row|null>(null);
 const visit=rows('visits').find(row=>row.id===visitId);
 const held=refundableNow(rows('payments').filter(row=>row.visit_id===visitId));
 if(done)return <Dialog title="اتلغى الحجز" close={close}><p className="notice">{name('patients',visit?.patient_id)}: {label(done.refund_mode)}. اترد {money(done.refunded_minor)}{BigInt(text(done.kept_minor))>0n?` · محتفظ به للعيادة ${money(done.kept_minor)}`:''}.</p><div className="form-actions"><button className="primary" onClick={close}>تمام</button></div></Dialog>;
 return <Dialog title={`إلغاء حجز ${name('patients',visit?.patient_id)}`} close={close}><Form initial={{refund_mode:held.total>0n?'full':'none'}} label="إلغاء الحجز" fields={[
   {key:'refund_mode',label:'المبلغ المدفوع',type:'select',required:true,options:held.total>0n?[{value:'full',label:`استرداد المبلغ بالكامل (${money(held.total)})`},{value:'partial',label:'رد جزئي من المبلغ'},{value:'none',label:'لن يتم استرداد المبلغ'}]:[{value:'none',label:'مفيش مبلغ مدفوع'}]},
   {key:'amount_minor',label:'المبلغ اللي هيترد بالجنيه',type:'money',required:true,blankInitially:true,when:values=>values.refund_mode==='partial',hint:`أقل من ${money(held.applied)}. الباقي يفضل إيراد للعيادة.`},
   {key:'reason',label:'سبب الإلغاء (اختياري)',type:'textarea'}]}
  submit={async values=>{
   const {data,error}=await db.rpc('clinic_booking_cancel',{payload:{visit_id:visitId,refund_mode:values.refund_mode,reason:values.reason,
    ...(values.refund_mode==='partial'?{amount_minor:values.amount_minor}:{})}});
   if(error)throw error;await refresh('all');setDone(data as Row);}}>
  {values=><p className="notice wide">{held.total===0n?'الحجز هيتلغي والزيارة تتقفل.':values.refund_mode==='full'?`هيترد ${money(held.total)} بنفس طريقة الدفع، وده هيظهر في تحصيل وتقفيل النهارده.`:values.refund_mode==='none'?`المدفوع (${money(held.total)}) هيفضل إيراد للعيادة ومش هيرجع للعميل.`:'المبلغ اللي هيترد هيتسجل بنفس طريقة الدفع في تحصيل النهارده، والباقي يفضل إيراد للعيادة.'} الزيارة هتتلغي ومش هيتحسب عليها نسبة للدكتور.</p>}
 </Form></Dialog>;
}

/** What the clinic kept and returned when a booking was cancelled, shown on the visit. */
export function CancellationNotice({visitId}:{visitId:unknown}){
 const {rows,name}=useClinic();const saved=rows('booking_cancellations').find(row=>row.visit_id===visitId);
 if(!saved)return null;
 return <p className="notice">الحجز اتلغى ({label(saved.refund_mode)}): اترد {money(saved.refunded_minor)}، ومحتفظ به للعيادة {money(saved.kept_minor)}. لغاه {name('profiles',saved.cancelled_by)||'الاستقبال'}{text(saved.reason)?` · السبب: ${text(saved.reason)}`:''}.</p>;
}
