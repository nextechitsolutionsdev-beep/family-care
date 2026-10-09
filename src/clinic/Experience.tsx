import {date,text} from './api';
import {useClinic} from './store';
import {Heading,Table} from './ui';

export default function Experience(){
 const {rows}=useClinic();
 const feedback=rows('experience_feedback').filter(row=>!row.demo_batch_id).sort((a,b)=>text(b.submitted_at).localeCompare(text(a.submitted_at)));
 const average=feedback.length?feedback.reduce((sum,row)=>sum+Number(row.rating),0)/feedback.length:0;
 return <><Heading title="تقييمات العملاء" detail="التقييمات والتعليقات تظهر للمالك فقط."/>
  <div className="ledger-summary"><span>عدد التقييمات<strong>{feedback.length}</strong></span><span>متوسط التقييم<strong>{feedback.length?`${average.toFixed(1)} من 5`:'—'}</strong></span></div>
  <Table rows={feedback} empty="لا توجد تقييمات مستلمة حتى الآن." columns={[
   {label:'تاريخ التقييم',render:row=>date(row.submitted_at)},
   {label:'التقييم',render:row=><span className="feedback-rating" aria-label={`${row.rating} من 5`}>{'★'.repeat(Number(row.rating))}{'☆'.repeat(5-Number(row.rating))} <bdi>{text(row.rating)} / 5</bdi></span>},
   {label:'ملاحظة العميل',render:row=><span className="feedback-comment">{text(row.comment)||'—'}</span>},
  ]}/>
 </>;
}
