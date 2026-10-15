import {useState} from 'react';
import {command,text,type Row} from './api';
import {Dialog,Form} from './ui';
import {specialtyPresets,normalizeSpecialty,makeSpecialtyPrefix} from '../domain/specialtyPresets';
export default function SpecialtyEditor({row,specialties,close,saved}:{row:Row|null;specialties:Row[];close:()=>void;saved:()=>Promise<void>}){
 const [search,setSearch]=useState('');const [selected,setSelected]=useState('');
 const preset=specialtyPresets.find(([prefix])=>prefix===selected);
 const initial=row??{name:preset?.[1]??'',client_prefix:preset?.[0]??'',sort_order:specialties.length+1};
 const exists=(prefix:string,name:string)=>specialties.some(item=>item.client_prefix===prefix||normalizeSpecialty(text(item.name))===normalizeSpecialty(name));
 const choices=specialtyPresets.filter(([prefix,name])=>normalizeSpecialty(name).includes(normalizeSpecialty(search))||prefix.toLowerCase().includes(search.trim().toLowerCase())||prefix===selected);
 return <Dialog title={row?'تعديل التخصص':'إضافة تخصص عند توفره'} close={close}>
 {!row&&<><p className="notice">اختار تخصصًا جاهزًا، أو اكتب اسم تخصص آخر. لن يُضاف للعيادة إلا بعد الضغط على حفظ.</p><div className="filters"><label>بحث عن تخصص<input type="search" value={search} onChange={event=>setSearch(event.target.value)} placeholder="مثال: قلب، أطفال، CARD"/></label><label>اختار التخصص<select value={selected} onChange={event=>setSelected(event.target.value)}><option value="">تخصص آخر / إدخال يدوي</option>{choices.map(([prefix,name])=><option key={prefix} value={prefix} disabled={exists(prefix,name)}>{name} — {prefix}{exists(prefix,name)?' (مسجل بالفعل)':''}</option>)}</select></label></div>{!choices.length&&<p>لا يوجد تطابق؛ يمكنك كتابة اسم التخصص بنفسك.</p>}</>}
 <Form key={row?.id??selected} initial={initial} fields={[{key:'name',label:'اسم التخصص',required:true},{key:'custom_code',label:'تخصيص الكود والترتيب (اختياري)',type:'checkbox'},{key:'client_prefix',label:'بادئة كود العميل',required:true,when:values=>Boolean(row)||Boolean(values.custom_code),hint:'حروف إنجليزية كبيرة، من 2 إلى 8. لا تتغير بعد تخصيص أكواد.'},{key:'sort_order',label:'ترتيب العرض',type:'number',required:true,when:values=>Boolean(row)||Boolean(values.custom_code)}]} submit={async values=>{
 const name=text(values.name).trim();const matched=specialtyPresets.find(([,title])=>normalizeSpecialty(title)===normalizeSpecialty(name));
 const prefix=text(values.client_prefix)||matched?.[0]||makeSpecialtyPrefix();
 if(specialties.some(item=>item.id!==row?.id&&(item.client_prefix===prefix||normalizeSpecialty(text(item.name))===normalizeSpecialty(name))))throw new Error('التخصص أو الكود مسجل بالفعل. راجع التخصصات الموجودة.');
 await command('specialty_save',{...values,name,client_prefix:prefix,...(row?{id:row.id}:{})});await saved();close();
 }}>{values=><p className="notice wide">كود العميل: <bdi>{text(values.client_prefix)||specialtyPresets.find(([,title])=>normalizeSpecialty(title)===normalizeSpecialty(text(values.name)))?.[0]||'تلقائي'}</bdi> — مثال: <bdi>{text(values.client_prefix)||preset?.[0]||'SP'}-000001</bdi></p>}</Form>
 </Dialog>;
}
