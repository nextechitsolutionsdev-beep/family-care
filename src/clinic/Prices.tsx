import {useState} from 'react';
import {date,db,readableError,text,today,type Row} from './api';
import {useClinic} from './store';
import {Heading,Table,Badge} from './ui';
import {decimal,minor} from '../domain/money';

/** Owner decision 20/11/2026: one screen where the owner sets the price of every service for every client type.
 * Saving applies from today; visits already saved keep their prices (snapshots). Server: clinic_price_matrix_save. */
const cell=(type:unknown,service:unknown)=>`${text(type)}|${text(service)}`;

export default function Prices(){
 const {rows,name,refresh,capabilities}=useClinic();
 const [specialty,setSpecialty]=useState('');const [search,setSearch]=useState('');
 const [draft,setDraft]=useState<Record<string,string>>({});const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [saved,setSaved]=useState('');
 const [key,setKey]=useState(()=>crypto.randomUUID());const [history,setHistory]=useState(false);
 const types=rows('client_types');
 const lists=rows('price_lists');
 const versionFor=(type:unknown)=>{
  const list=lists.find(row=>row.client_type_code===type);
  return rows('price_list_versions').filter(row=>row.list_id===list?.id&&row.published_at&&text(row.effective_from)<=today()).sort((a,b)=>text(b.effective_from).localeCompare(text(a.effective_from)))[0];
 };
 const priceIndex=new Map<string,unknown>();
 for(const type of types){const version=versionFor(type.code);for(const price of rows('service_prices'))if(price.version_id===version?.id)priceIndex.set(cell(type.code,price.service_id),price.price_minor);}
 const typeName=(code:unknown)=>text(types.find(row=>row.code===code)?.name);
 const services=rows('services').filter(row=>row.active&&!row.internal_followup&&(!specialty||row.specialty_id===specialty)&&text(row.name).includes(search.trim()))
  .sort((a,b)=>name('specialties',a.specialty_id).localeCompare(name('specialties',b.specialty_id),'ar')||text(a.name).localeCompare(text(b.name),'ar'));
 const value=(type:unknown,service:unknown)=>draft[cell(type,service)]??(priceIndex.has(cell(type,service))?decimal(priceIndex.get(cell(type,service))):'');
 const changes=(Object.entries(draft) as [string,string][]).filter(([id,typed])=>{const original=priceIndex.get(id);return original===undefined||typed.trim()!==decimal(original);});
 const review=lists.filter(row=>row.review_required);
 const save=async()=>{
  setBusy(true);setError('');setSaved('');
  try{
   const prices=changes.map(([id,typed])=>{
    const [client_type_code,service_id]=id.split('|');
    if(!typed.trim())throw new Error(`اكتب سعر ${name('services',service_id)} لـ${typeName(client_type_code)}، أو 0 لو الخدمة مجانية.`);
    const amount=minor(typed);
    if(!(amount>=0))throw new Error(`سعر ${name('services',service_id)} لـ${typeName(client_type_code)} مش رقم صحيح.`);
    return {client_type_code,service_id,price_minor:amount};
   });
   const {data,error:failure}=await db.rpc('clinic_price_matrix_save',{payload:{idempotency_key:key,prices}});
   if(failure)throw failure;
   const later=((data as {lists?:Row[]})?.lists??[]).filter(row=>text(row.effective_from)>today());
   await refresh();setDraft({});setKey(crypto.randomUUID());
   setSaved(later.length?`اتحفظ. ${later.map(row=>typeName(row.client_type_code)).join('، ')}: اتسجل النهارده حجز بالأسعار الحالية، فالتعديل هيبدأ من ${date(later[0].effective_from)}.`:'اتحفظ. الأسعار الجديدة شغالة من النهارده.');
  }catch(failure){setError(readableError(failure));}finally{setBusy(false);}
 };
 if(!capabilities.priceMatrix)return <><Heading title="الأسعار"/><p className="notice">شاشة الأسعار هتشتغل بعد تحديث قاعدة البيانات (20/11).</p></>;
 return <>
  <Heading title="الأسعار" detail="سعر كل خدمة لكل نوع عميل. الحفظ بيتطبق على الحجوزات من النهارده، والزيارات القديمة أسعارها ما بتتغيرش.">
   <button className="primary" disabled={busy||!changes.length} onClick={()=>void save()}>{busy?'جارٍ الحفظ…':changes.length?`حفظ ${changes.length} تعديل`:'حفظ'}</button>
   {Object.keys(draft).length>0&&<button disabled={busy} onClick={()=>{setDraft({});setError('');}}>إلغاء التعديلات</button>}
  </Heading>
  {review.length>0&&<p className="notice">راجع أسعار: {review.map(row=>text(row.name)).join('، ')}. لسه أسعار مبدئية، احفظ أي تعديل عليها عشان تتعتمد.</p>}
  <p className="notice">سعر شركة تأمين أو نقابة معينة (لو مختلف) بيتحدد من «التأمين والنقابات» ← «أسعار الخدمات»، وبيكسب على سعر القائمة هنا.</p>
  {error&&<p className="error" role="alert">{error}</p>}{saved&&<p className="success" role="status">{saved}</p>}
  <div className="filters">
   <label>التخصص<select value={specialty} onChange={event=>setSpecialty(event.target.value)}><option value="">كل التخصصات</option>{rows('specialties').filter(row=>row.active).map(row=><option key={row.id} value={row.id}>{text(row.name)}</option>)}</select></label>
   <label>بحث الخدمة<input type="search" value={search} onChange={event=>setSearch(event.target.value)}/></label>
  </div>
  <Table rows={services} empty="لا توجد خدمات مطابقة." columns={[
   {label:'الخدمة',render:row=><>{text(row.name)}{!specialty&&<small className="muted"> — {name('specialties',row.specialty_id)}</small>}</>},
   ...types.map(type=>({label:`${text(type.name)} (جنيه)`,render:(row:Row)=>row.open_price?<span className="muted">يكتبه الاستقبال</span>:<input className={changes.some(([id])=>id===cell(type.code,row.id))?'price-input changed':'price-input'} aria-label={`سعر ${text(row.name)} — ${text(type.name)}`} inputMode="decimal" dir="ltr" value={value(type.code,row.id)} onChange={event=>{const typed=event.target.value;setDraft(current=>({...current,[cell(type.code,row.id)]:typed}));}}/>}))
  ]}/>
  <div className="toolbar"><button onClick={()=>setHistory(value=>!value)} aria-expanded={history}>{history?'إخفاء سجل الأسعار':'سجل الأسعار'}</button></div>
  {history&&<Table rows={rows('price_list_versions').filter(row=>row.published_at).sort((a,b)=>text(b.effective_from).localeCompare(text(a.effective_from)))} columns={[
   {label:'نوع العميل',render:row=>text(lists.find(list=>list.id===row.list_id)?.name)},
   {label:'من تاريخ',render:row=>date(row.effective_from)},
   {label:'الحالة',render:row=>row.id===versionFor(lists.find(list=>list.id===row.list_id)?.client_type_code)?.id?<Badge tone="success">الحالية</Badge>:text(row.effective_from)>today()?<Badge tone="warning">لسه هتبدأ</Badge>:'سابقة'},
   {label:'عدد الخدمات',numeric:true,render:row=>rows('service_prices').filter(price=>price.version_id===row.id).length}
  ]}/>}
 </>;
}
