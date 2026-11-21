import {useRef,useState} from 'react';
import {command,db,label,text,type Row} from './api';
import {useClinic} from './store';
import {Badge,Dialog,Heading,Table} from './ui';
import {templateVariables,unknownVariables} from '../domain/templates';

/** «قوالب الرسائل» (owner decision 19/11/2026): the variables guide, the four built-in templates, and extra campaign
 * templates the owner creates and reception picks when sending an offer campaign. */
export default function Templates(){
 const {rows,refresh,capabilities}=useClinic();const [edit,setEdit]=useState<{kind:'builtin'|'campaign';row:Row|null}|null>(null);
 return <>
  <h2>المتغيرات المسموحة</h2>
  <p className="notice">اكتب المتغير بين القوسين زي ما هو، أو دوس عليه وانت بتكتب القالب يتحط مكان المؤشر. السيستم بيبدّله باسم العميل أو العرض وقت الإرسال.</p>
  <Table rows={templateVariables.map(variable=>({id:variable.key,...variable}))} columns={[
   {label:'المتغير',render:row=><bdi className="code">{`{${text(row.key)}}`}</bdi>},{label:'بيتبدل بـ',render:row=>text(row.meaning)},
   {label:'متاح في',render:row=>(row.kinds as string[]).map(kind=>label(kind)).join('، ')},{label:'مثال',render:row=>text(row.example)}]}/>
  <h2>القوالب الأساسية</h2>
  <Table rows={rows('message_templates').map(row=>({...row,id:text(row.kind)}))} columns={[{label:'النوع',render:row=>label(row.kind)},{label:'القالب',render:row=>text(row.body)},
   {label:'الحالة',render:row=>row.active?'نشط':'متوقف'},{label:'الإجراء',render:row=><button onClick={()=>setEdit({kind:'builtin',row})}>تعديل</button>}]}/>
  {capabilities.campaignTemplates&&<><Heading title="قوالب حملات العروض" detail="قوالب إضافية تختار منها وانت بتبعت حملة عرض من «العروض والرسائل»."><button className="primary" onClick={()=>setEdit({kind:'campaign',row:null})}>إنشاء قالب جديد</button></Heading>
   <Table rows={rows('campaign_templates')} empty="مفيش قوالب إضافية لسه. دوس «إنشاء قالب جديد»." columns={[{label:'اسم القالب',render:row=>text(row.title)},{label:'النص',render:row=>text(row.body)},
    {label:'الحالة',render:row=><Badge tone={row.active?'success':'neutral'}>{row.active?'نشط':'متوقف'}</Badge>},{label:'الإجراء',render:row=><button onClick={()=>setEdit({kind:'campaign',row})}>تعديل</button>}]}/></>}
  {edit&&<TemplateEditor kind={edit.kind} row={edit.row} close={()=>setEdit(null)} saved={async()=>{await refresh('all');setEdit(null);}}/>}
 </>;
}

function TemplateEditor({kind,row,close,saved}:{kind:'builtin'|'campaign';row:Row|null;close:()=>void;saved:()=>Promise<void>}){
 const messageKind=kind==='campaign'?'campaign':text(row?.kind);
 const allowed=templateVariables.filter(variable=>variable.kinds.includes(messageKind));
 const [title,setTitle]=useState(text(row?.title));const [body,setBody]=useState(text(row?.body));const [active,setActive]=useState(row?Boolean(row.active):true);
 const [error,setError]=useState('');const [busy,setBusy]=useState(false);const area=useRef<HTMLTextAreaElement>(null);
 const unknown=unknownVariables(body,allowed.map(variable=>variable.key));
 const insert=(key:string)=>{const element=area.current;const token=`{${key}}`;const start=element?.selectionStart??body.length;const end=element?.selectionEnd??body.length;
  const next=body.slice(0,start)+token+body.slice(end);setBody(next);requestAnimationFrame(()=>{element?.focus();element?.setSelectionRange(start+token.length,start+token.length);});};
 const preview=allowed.reduce((textValue,variable)=>textValue.replaceAll(`{${variable.key}}`,variable.example),body);
 return <Dialog title={row?(kind==='campaign'?'تعديل قالب الحملة':`تعديل قالب ${label(row.kind)}`):'قالب حملة جديد'} close={close}>
  <form className="editor" onSubmit={event=>{event.preventDefault();setError('');
   if(unknown.length){setError(`متغير مش مسموح: ${unknown.map(key=>`{${key}}`).join(' ')}`);return;}setBusy(true);
   void (async()=>{if(kind==='campaign'){const {error}=await db.rpc('clinic_campaign_template_save',{payload:{id:row?.id??null,title,body,active}});if(error)throw error;}
    else await command('template_save',{kind:row?.kind,body,active});await saved();})().catch(problem=>setError(problem instanceof Error&&!('code' in problem)?problem.message:'تعذر حفظ القالب. راجع النص والمتغيرات.')).finally(()=>setBusy(false));}}>
   {kind==='campaign'&&<div className="field wide"><label htmlFor="template-title">اسم القالب *</label><input id="template-title" required maxLength={80} value={title} onChange={event=>setTitle(event.target.value)} placeholder="مثال: عرض الشتا"/></div>}
   <div className="field wide"><span className="label">المتغيرات المسموحة هنا — دوس عشان تضيفه</span><div className="chips">{allowed.map(variable=><button type="button" key={variable.key} title={variable.meaning} onClick={()=>insert(variable.key)}><bdi>{`{${variable.key}}`}</bdi> {variable.meaning}</button>)}</div></div>
   <div className="field wide"><label htmlFor="template-body">نص الرسالة *</label><textarea id="template-body" ref={area} required rows={5} maxLength={2000} value={body} onChange={event=>setBody(event.target.value)}/>
    <small>{body.length}/2000</small></div>
   {unknown.length>0&&<p className="error wide" role="alert">المتغير ده مش مسموح هنا: {unknown.map(key=>`{${key}}`).join(' ')}</p>}
   {body.trim()&&<div className="wide"><span className="label">شكل الرسالة للعميل</span><p className="notice" style={{whiteSpace:'pre-line'}}>{preview}</p></div>}
   <label className="check wide"><input type="checkbox" checked={active} onChange={event=>setActive(event.target.checked)}/>القالب نشط</label>
   {error&&<p className="error wide" role="alert">{error}</p>}
   <div className="form-actions wide"><button className="primary" disabled={busy}>{busy?'جارٍ الحفظ…':'حفظ القالب'}</button></div>
  </form></Dialog>;
}
