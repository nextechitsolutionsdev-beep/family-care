import {useCallback,useEffect,useState} from 'react';
import {db,date,text,type Row} from './api';
import {useClinic} from './store';
import {Badge,Dialog,Form,Table,useTask,type Field} from './ui';
import {normalizeEgyptianPhone} from '../domain/phone';
import '../styles/whatsapp.css';

const gatewayLabels:Record<string,string>={ready:'متصل',qr_ready:'مستني مسح QR',authenticating:'بيتصل',initializing:'بيبدأ',created:'مش مربوط',
 disconnected:'مفصول',action_required:'محتاج إجراء من الموبايل',failed:'متوقف بخطأ',unreachable:'برنامج OpenWA مش شغال'};
const commandLabels:Record<string,string>={link:'ربط الرقم',unlink:'فك الربط',test:'رسالة تجربة'};
const resultLabels:Record<string,string>={LINK_STARTED:'ظهر كود الربط',ALREADY_LINKED:'الرقم مربوط بالفعل',UNLINKED:'اتفك الربط',NOT_LINKED:'مفيش رقم مربوط',SENT:'اتبعتت',
 NOT_ON_WHATSAPP:'الرقم مش على واتساب',GATEWAY_UNREACHABLE:'برنامج OpenWA مش شغال',GATEWAY_REJECTED:'OpenWA رفض الطلب',GATEWAY_AUTH:'مفتاح OpenWA غلط',
 SEND_UNCONFIRMED:'مش مؤكد إنها اتبعتت',RATE_LIMITED:'وصلنا للحد، جرب بعدين',GATEWAY_BUSY:'واتساب مش جاهز، جرب كمان شوية',TIMED_OUT:'البرنامج ما ردش',EXPIRED:'البرنامج ما كانش شغال',SESSION_NOT_CREATED:'تعذر تجهيز الجلسة'};
const commandStatus:Record<string,string>={pending:'مستني البرنامج',running:'جاري التنفيذ',done:'تم',failed:'تعذر'};

/** How long ago the worker last reported, in minutes; null when it never did. */
function freshness(row:Row|undefined,now=Date.now()){
 const checked=row?new Date(text(row.checked_at)).getTime():NaN;
 return Number.isNaN(checked)?null:Math.round((now-checked)/60000);
}

export function gatewayState(row:Row|undefined):{tone:'success'|'warning'|'neutral';label:string;live:boolean}{
 const minutes=freshness(row);
 if(minutes===null)return {tone:'neutral',label:'برنامج الإرسال لم يتصل بعد',live:false};
 if(minutes>3)return {tone:'warning',label:`برنامج الإرسال مش شغال — آخر ظهور ${date(row?.checked_at)}`,live:false};
 const status=text(row?.status);
 return {tone:status==='ready'?'success':'warning',label:gatewayLabels[status]??status,live:true};
}

async function whatsapp(payload:Record<string,unknown>){const {data,error}=await db.rpc('clinic_whatsapp',{payload});if(error)throw error;return data as Row;}
async function readOne(table:string,columns='*'){const {data,error}=await db.from(table).select(columns).limit(1).maybeSingle();if(error)throw error;return (data??undefined) as Row|undefined;}

/** Re-reads what the worker reports while the panel is open, so status, QR and requests update without reloading. */
function useLive(interval:number){
 const [gateway,setGateway]=useState<Row|undefined>();const [commands,setCommands]=useState<Row[]>([]);
 const load=useCallback(async()=>{
  const [state,{data,error}]=await Promise.all([readOne('whatsapp_gateway'),db.from('whatsapp_commands').select('*').order('requested_at',{ascending:false}).limit(8)]);
  if(error)throw error;setGateway(state);setCommands((data??[]) as Row[]);
 },[]);
 useEffect(()=>{let active=true;const run=()=>{void load().catch(()=>undefined);};run();const timer=setInterval(()=>{if(active)run();},interval);return()=>{active=false;clearInterval(timer);};},[load,interval]);
 return {gateway,commands,load};
}

function LinkDialog({close}:{close:()=>void}){
 const [qr,setQr]=useState('');const [status,setStatus]=useState('');
 useEffect(()=>{
  let active=true;
  const run=async()=>{const [code,state]=await Promise.all([readOne('whatsapp_qr'),readOne('whatsapp_gateway')]);if(!active)return;setQr(text(code?.qr_code));setStatus(text(state?.status));};
  void run().catch(()=>undefined);const timer=setInterval(()=>{void run().catch(()=>undefined);},3000);
  return()=>{active=false;clearInterval(timer);};
 },[]);
 return <Dialog title="ربط رقم واتساب" close={close}>
  {status==='ready'?<p className="notice" role="status">الرقم اتربط بنجاح ✅</p>
   :qr?<div className="whatsapp-qr"><img src={qr} alt="كود QR لربط واتساب" width={264} height={264}/><ol>
     <li>افتح واتساب على موبايل رقم العيادة.</li><li>الإعدادات ← الأجهزة المرتبطة ← ربط جهاز.</li><li>امسح الكود. الكود بيتغير لوحده كل حوالي 20 ثانية.</li></ol></div>
   :<p role="status">جاري تجهيز كود الربط… {status?`(${gatewayLabels[status]??status})`:''}</p>}
  <div className="toolbar"><button onClick={close}>{status==='ready'?'تمام':'إغلاق'}</button></div>
 </Dialog>;
}

/** Owner panel «الإعدادات ← واتساب»: provider, linking, test message and sending limits. */
export default function WhatsAppPanel(){
 const {rows,profile,refresh}=useClinic();const task=useTask(refresh);const live=useLive(5000);
 const provider=text(rows('clinic_settings')[0]?.provider)||'mock';const [chosen,setChosen]=useState(provider);
 const [linking,setLinking]=useState(false);const [testPhone,setTestPhone]=useState('');
 const state=gatewayState(live.gateway);const linked=state.live&&live.gateway?.status==='ready';
 const settings=rows('whatsapp_settings')[0];
 const busyCommand=(action:string)=>live.commands.some(row=>row.action===action&&['pending','running'].includes(text(row.status)));
 const request=(payload:Record<string,unknown>)=>task.run(async()=>{await whatsapp(payload);await live.load();});
 const limitFields:Field[]=[
  {key:'daily_cap',label:'أقصى عدد رسايل في اليوم',type:'number',min:1,max:1000,required:true},
  {key:'start_hour',label:'بداية الإرسال (ساعة، بتوقيت القاهرة)',type:'number',min:0,max:23,required:true},
  {key:'end_hour',label:'نهاية الإرسال (ساعة)',type:'number',min:1,max:24,required:true},
  {key:'min_gap_seconds',label:'أقل وقت بين رسالتين (ثانية)',type:'number',min:5,max:3600,required:true},
  {key:'max_gap_seconds',label:'أكبر وقت بين رسالتين (ثانية)',type:'number',min:5,max:7200,required:true},
  {key:'max_age_hours',label:'الرسالة ما تتبعتش لو اتأخرت أكتر من (ساعة)',type:'number',min:1,max:720,required:true},
  {key:'trial_numbers',label:'أرقام التجربة',type:'textarea',hint:'لو كتبت أرقام هنا، الإرسال يروح لها بس. افصل بينها بفاصلة. سيبها فاضية للإرسال لكل العملاء الموافقين.'}];
 if(profile.role!=='owner')return null;
 return <section aria-labelledby="whatsapp-title" className="whatsapp-panel">
  <h2 id="whatsapp-title">واتساب</h2>
  <p>الحالة: <Badge tone={state.tone}>{state.label}</Badge>{linked&&live.gateway?.linked_suffix?<> · الرقم المربوط ينتهي بـ <bdi>{text(live.gateway.linked_suffix)}</bdi></>:null}</p>
  {task.feedback}
  <div className="toolbar">
   {!linked&&<button className="primary" disabled={task.busy||!state.live||busyCommand('link')} onClick={()=>{void request({action:'link'}).then(()=>setLinking(true));}}>ربط رقم واتساب</button>}
   {linked&&<button disabled={task.busy||busyCommand('unlink')} onClick={()=>{if(window.confirm('فك ربط رقم العيادة؟ الإرسال هيقف لحد ما تربط رقم تاني.'))void request({action:'unlink'});}}>فك ربط الرقم</button>}
  </div>
  {!state.live&&<p className="notice">برنامج الإرسال لازم يكون شغال على الجهاز أو السيرفر عشان الربط والإرسال يشتغلوا. شغّله بـ <bdi dir="ltr">npm run whatsapp</bdi>.</p>}

  <h3>المزود</h3>
  <div className="toolbar">
   <label>الرسايل تتبعت عن طريق<select value={chosen} onChange={event=>setChosen(event.target.value)}><option value="mock">تجريبي — بدون إرسال</option><option value="openwa">واتساب (OpenWA)</option></select></label>
   <button className="primary" disabled={task.busy||chosen===provider} onClick={()=>{
    if(chosen==='openwa'&&!window.confirm('الرسايل هتتبعت فعلاً على واتساب للعملاء الموافقين. متأكد؟'))return;
    void task.run(async()=>{const {error}=await db.rpc('clinic_whatsapp_provider',{payload:{provider:chosen}});if(error)throw error;});
   }}>حفظ المزود</button>
  </div>

  <h3>رسالة تجربة</h3>
  <form className="toolbar" onSubmit={event=>{event.preventDefault();void request({action:'test',test_phone:normalizeEgyptianPhone(testPhone)});}}>
   <label>رقم الموبايل<input inputMode="tel" dir="ltr" value={testPhone} onChange={event=>setTestPhone(event.target.value)} placeholder="01xxxxxxxxx" required/></label>
   <button type="submit" disabled={task.busy||!linked||busyCommand('test')}>ابعت رسالة تجربة</button>
  </form>
  {!linked&&<p className="muted">رسالة التجربة بتشتغل بعد ربط الرقم.</p>}

  <h3>آخر الطلبات</h3>
  <Table rows={live.commands} columns={[{label:'الطلب',render:row=>commandLabels[text(row.action)]??text(row.action)},{label:'الوقت',render:row=>`${date(row.requested_at)} ${new Date(text(row.requested_at)).toLocaleTimeString('en-GB',{timeZone:'Africa/Cairo',hour:'2-digit',minute:'2-digit'})}`},
   {label:'الحالة',render:row=><Badge tone={row.status==='done'?'success':row.status==='failed'?'warning':'neutral'}>{commandStatus[text(row.status)]??text(row.status)}</Badge>},
   {label:'النتيجة',render:row=>resultLabels[text(row.result_code)]??(text(row.result_code)||'—')}]}/>

  <h3>حدود الإرسال</h3>
  {settings&&<Form key={text(settings.updated_at)} initial={{...settings,trial_numbers:(settings.trial_numbers as string[]|undefined)?.map(phone=>phone.replace(/^\+2/,'')).join('، ')??''}} fields={limitFields}
   submit={async values=>{
    const trial=text(values.trial_numbers).split(/[,،\s]+/).filter(Boolean).map(normalizeEgyptianPhone);
    await whatsapp({action:'settings_save',...values,trial_numbers:trial});await refresh();
   }}><p className="notice wide">OpenWA غير رسمي والرقم ممكن يتحظر. استخدم رقم مخصص للعيادة، وابدأ بعدد قليل في اليوم وزوّده بالتدريج.</p></Form>}
  {linking&&<LinkDialog close={()=>{setLinking(false);void live.load();}}/>}
 </section>;
}
