import {useState} from 'react';
import {db,date,text,type Row} from './api';
import {useClinic} from './store';
import {Badge,useTask} from './ui';

const gatewayLabels:Record<string,string>={ready:'متصل',qr_ready:'مستني مسح QR',authenticating:'بيتصل',initializing:'بيبدأ',created:'مش مربوط',
 disconnected:'مفصول',action_required:'محتاج إجراء من الموبايل',failed:'متوقف بخطأ',unreachable:'البرنامج مش شغال'};

/** How long ago the worker last reported; older than 3 minutes means it is not running. */
function freshness(row:Row|undefined,now=Date.now()){
 const checked=row?new Date(text(row.checked_at)).getTime():NaN;
 return Number.isNaN(checked)?null:Math.round((now-checked)/60000);
}

export function gatewayState(row:Row|undefined):{tone:'success'|'warning'|'neutral';label:string}{
 const minutes=freshness(row);
 if(minutes===null)return {tone:'neutral',label:'لم يتصل برنامج الإرسال بعد'};
 if(minutes>3)return {tone:'warning',label:`برنامج الإرسال مش شغال — آخر ظهور ${date(row?.checked_at)}`};
 const status=text(row?.status);
 return {tone:status==='ready'?'success':'warning',label:gatewayLabels[status]??status};
}

/** Owner setting: where the system's messages go. Reception sees the state only. */
export default function WhatsAppSettings(){
 const {rows,profile,refresh}=useClinic();const task=useTask(refresh);
 const provider=text(rows('clinic_settings')[0]?.provider)||'mock';const [chosen,setChosen]=useState(provider);
 const state=gatewayState(rows('whatsapp_gateway')[0]);
 return <section className="wide" aria-labelledby="whatsapp-title">
  <h2 id="whatsapp-title">إرسال الرسائل</h2>
  <p>المزود الحالي: <strong>{provider==='openwa'?'واتساب (OpenWA)':'تجريبي — تسجيل في النظام فقط'}</strong>{provider==='openwa'&&<> · <Badge tone={state.tone}>{state.label}</Badge></>}</p>
  {profile.role==='owner'&&<div className="toolbar">
   <label>المزود<select value={chosen} onChange={event=>setChosen(event.target.value)}><option value="mock">تجريبي — بدون إرسال</option><option value="openwa">واتساب (OpenWA)</option></select></label>
   <button className="primary" disabled={task.busy||chosen===provider} onClick={()=>{
    if(chosen==='openwa'&&!window.confirm('الرسائل هتتبعت فعلاً على واتساب للعملاء الموافقين. متأكد؟'))return;
    void task.run(async()=>{const {error}=await db.rpc('clinic_whatsapp_provider',{payload:{provider:chosen}});if(error)throw error;});
   }}>حفظ المزود</button>
  </div>}
  {task.feedback}
  <p className="notice">واتساب عن طريق OpenWA غير رسمي، والرقم ممكن يتحظر. استخدم رقم مخصص للعيادة. الرسائل بتتبعت للعملاء الموافقين بس، رسالة كل دقيقة تقريباً وفي ساعات النهار، والرسالة اللي تتأخر أكتر من يومين ما بتتبعتش.</p>
 </section>;
}
