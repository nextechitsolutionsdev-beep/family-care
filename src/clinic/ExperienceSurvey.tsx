import {useEffect,useState} from 'react';

type SurveyStatus='checking'|'ready'|'success'|'submitted'|'expired'|'invalid'|'error';
const endpoint=`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/experience-feedback`;
async function requestSurvey(body:Record<string,unknown>){
 const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','apikey':import.meta.env.VITE_SUPABASE_ANON_KEY},body:JSON.stringify(body),cache:'no-store'});
 const result=await response.json() as {status?:string};
 if(!response.ok)throw new Error('SURVEY_UNAVAILABLE');
 return result;
}
export default function ExperienceSurvey({token}:{token:string}){
 const [status,setStatus]=useState<SurveyStatus>('checking');
 const [submitting,setSubmitting]=useState(false);
 const [formError,setFormError]=useState(false);
 const [rating,setRating]=useState(0);
 const [comment,setComment]=useState('');
 useEffect(()=>{document.title='تقييم الزيارة | فاميلي كير';void requestSurvey({action:'check',token}).then(result=>setStatus(result.status==='ready'?'ready':result.status==='submitted'?'submitted':result.status==='expired'?'expired':'invalid')).catch(()=>setStatus('error'));},[token]);
 const submit=async(event:React.FormEvent<HTMLFormElement>)=>{
  event.preventDefault();setSubmitting(true);setFormError(false);
  try{
   const result=await requestSurvey({action:'submit',token,rating,comment:comment.trim()});
   setStatus(result.status==='accepted'?'success':result.status==='submitted'?'submitted':result.status==='expired'?'expired':'invalid');
  }catch{setFormError(true);}
  finally{setSubmitting(false);}
 };
 return <main className="survey-page"><section className="survey-card" aria-labelledby="survey-title">
  <div className="survey-brand"><img src="/logo.jpg" width="52" height="52" alt=""/><span><strong>فاميلي كير</strong><small>رعاية تبدأ بالاهتمام</small></span></div>
  {status==='checking'&&<div className="survey-message" role="status"><span className="survey-mark">…</span><h1 id="survey-title">جارٍ فتح التقييم</h1><p>لحظة من فضلك.</p></div>}
  {status==='ready'&&<><header className="survey-heading"><span className="survey-eyebrow">رأيك يهمنا</span><h1 id="survey-title">كيف كانت تجربتك؟</h1><p>ساعدنا نطوّر رعايتنا. تقييمك يصل إلى إدارة العيادة فقط.</p></header><form className="survey-form" onSubmit={event=>void submit(event)}>
   <fieldset><legend>اختر تقييمك من نجمة إلى خمس نجوم</legend><div className="survey-stars" aria-label="تقييم التجربة من نجمة إلى خمس نجوم">{[1,2,3,4,5].map(value=><button key={value} type="button" aria-pressed={rating===value} aria-label={`${value} من 5`} className={rating>=value?'selected':''} onClick={()=>setRating(value)}>★</button>)}</div><p className="survey-score" aria-live="polite">{rating?`${rating} من 5`:'لم يتم الاختيار بعد'}</p></fieldset>
   <label htmlFor="survey-comment">ملاحظة (اختياري)<textarea id="survey-comment" rows={4} maxLength={1200} value={comment} onChange={event=>setComment(event.target.value)} placeholder="ما الذي أعجبك أو يمكننا تحسينه؟"/></label>
   <button className="primary survey-submit" disabled={!rating||submitting}>{submitting?'جارٍ إرسال التقييم…':'إرسال التقييم'}</button>
   {formError&&<p className="error" role="alert">تعذر إرسال التقييم الآن. تحقق من اتصالك وحاول مرة أخرى.</p>}
  </form></>}
  {status==='success'&&<div className="survey-message" role="status"><span className="survey-mark">✓</span><h1 id="survey-title">شكرًا لمشاركتك</h1><p>وصل تقييمك إلى إدارة فاميلي كير وسيساعدنا على تحسين تجربتك.</p></div>}
  {status==='submitted'&&<div className="survey-message" role="status"><span className="survey-mark">✓</span><h1 id="survey-title">تم استلام تقييمك</h1><p>شكرًا لوقتك. لا يمكن إرسال تقييم آخر لهذا الرابط.</p></div>}
  {status==='expired'&&<div className="survey-message"><span className="survey-mark">⌛</span><h1 id="survey-title">انتهت صلاحية الرابط</h1><p>انتهت مدة هذا الرابط. شكرًا لزيارتك فاميلي كير.</p></div>}
  {status==='invalid'&&<div className="survey-message"><span className="survey-mark">!</span><h1 id="survey-title">الرابط غير صالح</h1><p>راجع الرابط الذي وصلك أو تواصل مع العيادة للمساعدة.</p></div>}
  {status==='error'&&<div className="survey-message"><span className="survey-mark">!</span><h1 id="survey-title">تعذر فتح التقييم</h1><p>تحقق من اتصال الإنترنت ثم أعد تحميل الصفحة.</p><button onClick={()=>{setStatus('checking');void requestSurvey({action:'check',token}).then(result=>setStatus(result.status==='ready'?'ready':result.status==='submitted'?'submitted':result.status==='expired'?'expired':'invalid')).catch(()=>setStatus('error'));}}>إعادة المحاولة</button></div>}
  <footer className="survey-footer">فاميلي كير · تقييمك خاص بإدارة العيادة</footer>
 </section></main>;
}
