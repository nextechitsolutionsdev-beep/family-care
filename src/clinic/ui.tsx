import {useEffect,useId,useRef,useState,type ReactNode} from 'react';
import {text,readableError,today,type Row} from './api';
import {minor,percent,decimal} from '../domain/money';
import {formatDeskDate,isIsoDate,parseDeskDate} from '../domain/dates';
export type Field={key:string;label:string;type?:'text'|'email'|'password'|'date'|'time'|'number'|'money'|'percent'|'checkbox'|'textarea'|'select'|'weekdays';required?:boolean;options?:{value:string;label:string}[]|((values:Record<string,unknown>)=>{value:string;label:string}[]);when?:(values:Record<string,unknown>)=>boolean;clearOnChange?:string[]|((values:Record<string,unknown>)=>string[]);blankInitially?:boolean;hint?:string;min?:number;max?:number};
export function Form({fields,initial={},submit,label='حفظ',children}:{fields:Field[];initial?:Record<string,unknown>;submit:(values:Record<string,unknown>)=>Promise<void>;label?:string;children?:ReactNode|((values:Record<string,unknown>)=>ReactNode)}) {
 const [values,setValues]=useState<Record<string,unknown>>(()=>Object.fromEntries(fields.map(field=>[field.key,
   field.blankInitially&&initial[field.key]==null?'':field.type==='money'||field.type==='percent'?decimal(initial[field.key]??0):initial[field.key]??(field.type==='checkbox'?false:field.type==='weekdays'?[]:'')])));
 const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 const [visiblePasswords,setVisiblePasswords]=useState<Record<string,boolean>>({});
 return <form className="editor" onSubmit={event=>{event.preventDefault();setError('');setBusy(true);const normalized={...values};
   try {for(const field of fields) {
     if(field.when&&!field.when(values))continue;
     if(field.type==='money')normalized[field.key]=minor(text(values[field.key]));
     if(field.type==='percent')normalized[field.key]=percent(text(values[field.key]));
     if(field.type==='number')normalized[field.key]=values[field.key]===''?null:Number(values[field.key]);
   }}catch(error){setError(readableError(error));setBusy(false);return;}
   void submit(normalized).catch(error=>setError(readableError(error))).finally(()=>setBusy(false));
 }}>
   {fields.filter(field=>!field.when||field.when(values)).map(field=>{
     const id=`field-${field.key}`;const set=(value:unknown)=>setValues(current=>{const next={...current,[field.key]:value};const clear=typeof field.clearOnChange==='function'?field.clearOnChange(next):field.clearOnChange??[];return {...next,...Object.fromEntries(clear.map(key=>[key,'']))};});
     return <div className={field.type==='textarea'?'field wide':'field'} key={field.key}>
       {field.type==='checkbox'?<label className="check"><input type="checkbox" checked={Boolean(values[field.key])} onChange={event=>set(event.target.checked)}/>{field.label}</label>:<><label htmlFor={id}>{field.label}{field.required?' *':''}</label>
       {field.type==='select'?<select id={id} required={field.required} value={text(values[field.key])} onChange={event=>set(event.target.value)}><option value="">اختار…</option>{(typeof field.options==='function'?field.options(values):field.options)?.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select>:
        field.type==='date'?<DateInput id={id} required={field.required} value={text(values[field.key])} onChange={set}/>:
        field.type==='textarea'?<textarea id={id} required={field.required} value={text(values[field.key])} onChange={event=>set(event.target.value)} rows={3}/>:
        field.type==='weekdays'?<fieldset className="days" id={id}><legend>الأيام المتاحة</legend>{[{day:'السبت',index:6},{day:'الأحد',index:0},{day:'الإثنين',index:1},{day:'الثلاثاء',index:2},{day:'الأربعاء',index:3},{day:'الخميس',index:4},{day:'الجمعة',index:5}].map(({day,index})=><label key={day}><input type="checkbox" checked={(values[field.key] as number[]).includes(index)} onChange={event=>set(event.target.checked?[...(values[field.key] as number[]),index]:(values[field.key] as number[]).filter(value=>value!==index))}/>{day}</label>)}</fieldset>:
        <><input id={id} type={field.type==='password'&&visiblePasswords[field.key]?'text':field.type==='money'||field.type==='percent'?'text':field.type??'text'} inputMode={['money','percent'].includes(field.type??'')?'decimal':undefined} required={field.required} min={field.min} max={field.max} value={text(values[field.key])} onChange={event=>set(event.target.value)} minLength={field.type==='password'?12:undefined} maxLength={field.type==='password'?128:undefined} autoComplete={field.type==='password'?'new-password':undefined}/>{field.type==='password'&&<button type="button" aria-controls={id} aria-pressed={Boolean(visiblePasswords[field.key])} onClick={()=>setVisiblePasswords(current=>({...current,[field.key]:!current[field.key]}))}>{visiblePasswords[field.key]?'إخفاء كلمة المرور':'إظهار كلمة المرور'}</button>}</>}
       </>}{field.hint&&<small>{field.hint}</small>}
     </div>;
   })}
   {typeof children==='function'?children(values):children}{error&&<p className="error wide" role="alert">{error}</p>}<div className="form-actions wide"><button className="primary" disabled={busy} type="submit">{busy?'جارٍ الحفظ…':label}</button></div>
 </form>;
}
/** Follow-ups dated before Cairo today are allowed (historical entry) but must be confirmed explicitly. */
export const pastDateConfirmation=(key:string):Field=>({key:'confirm_past_'+key,label:'تأكيد: التاريخ ده فات، وهتتسجل كمتابعة متأخرة',type:'checkbox',
 when:values=>isIsoDate(values[key])&&String(values[key])<today()});
export function requirePastConfirmation(values:Record<string,unknown>,key:string){
 if(isIsoDate(values[key])&&String(values[key])<today()&&!values['confirm_past_'+key])throw new Error('تاريخ المتابعة فات. صحّح التاريخ أو علّم تأكيد تسجيلها كمتابعة متأخرة.');
}
const INVALID_DATE='اكتب تاريخًا صحيحًا بصيغة يوم/شهر/سنة، مثل 07/10/2026.';
/** dd/mm/yyyy entry independent of the browser locale; emits ISO yyyy-mm-dd ('' while empty or invalid).
 * Arabic digits and pasted ISO dates are accepted; the calendar button opens the browser's date picker. */
export function DateInput({id,value,onChange,required,disabled}:{id?:string;value:string;onChange:(iso:string)=>void;required?:boolean;disabled?:boolean}){
 const [draft,setDraft]=useState(()=>formatDeskDate(value));
 const emitted=useRef(value);const input=useRef<HTMLInputElement>(null);const picker=useRef<HTMLInputElement>(null);
 useEffect(()=>{if(value!==emitted.current){emitted.current=value;setDraft(formatDeskDate(value));input.current?.setCustomValidity('');}},[value]);
 const accept=(typed:string)=>{
  const iso=parseDeskDate(typed);
  setDraft(iso&&isIsoDate(typed.trim())?formatDeskDate(iso):typed);
  input.current?.setCustomValidity(iso===null?INVALID_DATE:'');
  const next=iso??'';if(next!==emitted.current){emitted.current=next;onChange(next);}
 };
 return <span className="date-input"><input ref={input} id={id} type="text" inputMode="numeric" dir="ltr" placeholder="يوم/شهر/سنة" autoComplete="off"
  value={draft} required={required} disabled={disabled} onChange={event=>accept(event.target.value)}
  onBlur={()=>{const iso=parseDeskDate(draft);if(iso)setDraft(formatDeskDate(iso));else if(iso===null)input.current?.reportValidity();}}/>
  <button type="button" className="date-picker" aria-label="فتح التقويم" disabled={disabled} onClick={()=>{const native=picker.current;if(!native)return;native.value=isIsoDate(value)?value:'';try{native.showPicker();}catch{native.focus();}}}>
   <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16"><rect x="1.5" y="3" width="13" height="11.5" rx="1.5" fill="none" stroke="currentColor"/><path d="M1.5 6.5h13M5 1.5v3M11 1.5v3" stroke="currentColor"/></svg></button>
  <input ref={picker} type="date" tabIndex={-1} aria-hidden="true" aria-label="التقويم" className="date-native" onChange={event=>{if(isIsoDate(event.target.value))accept(formatDeskDate(event.target.value));}}/></span>;
}
export function Dialog({title,close,children}:{title:string;close:()=>void;children:ReactNode}) {
 const ref=useRef<HTMLDialogElement>(null);
 const titleId=useId();
 useEffect(()=>{const dialog=ref.current;const opener=document.activeElement;dialog?.showModal();return()=>{dialog?.close();if(opener instanceof HTMLElement&&opener.isConnected)opener.focus();};},[]);
 return <dialog ref={ref} aria-labelledby={titleId} onCancel={event=>{event.preventDefault();close();}}><header className="dialog-head"><h2 id={titleId}>{title}</h2><button type="button" aria-label="إغلاق" onClick={close}>×</button></header>{children}</dialog>;
}
export type Column={label:string;render:(row:Row)=>ReactNode;numeric?:boolean};
export function Table({rows,columns,empty='لا توجد سجلات هنا.'}:{rows:Row[];columns:Column[];empty?:string}) {
 const wrapper=useRef<HTMLDivElement>(null);
 const [overflows,setOverflows]=useState(false);
 useEffect(()=>{
   const element=wrapper.current;
   if(!element){setOverflows(false);return;}
   const measure=()=>setOverflows(element.scrollWidth>element.clientWidth+1);
   const observer=new ResizeObserver(measure);
   observer.observe(element);
   const table=element.querySelector('table');if(table)observer.observe(table);
   measure();
   return()=>observer.disconnect();
 },[rows.length,columns.length]);
 if(!rows.length)return <p className="empty">{empty}</p>;
 return <>{overflows&&<p className="table-scroll-hint">حرّك الجدول يمينًا ويسارًا لعرض بقية الأعمدة</p>}<div className="table-wrap" ref={wrapper}><table><thead><tr>{columns.map(column=><th key={column.label} className={column.numeric?'numeric':column.label==='الإجراء'?'action-column':''}>{column.label}</th>)}</tr></thead><tbody>{rows.map((row,index)=><tr key={row.id||index}>{columns.map(column=><td key={column.label} className={column.numeric?'numeric':column.label==='الإجراء'?'action-column':''}>{column.render(row)}</td>)}</tr>)}</tbody></table></div></>;
}
export function Badge({children,tone='neutral'}:{children:ReactNode;tone?:'neutral'|'warning'|'success'}){return <span className={`badge ${tone}`}>{children}</span>;}
export function Heading({title,detail,children}:{title:string;detail?:string;children?:ReactNode}){return <div className="page-heading"><div><h1>{title}</h1>{detail&&<p>{detail}</p>}</div><div className="actions">{children}</div></div>;}
export function useTask(refresh?:()=>Promise<void>) {
 const [error,setError]=useState('');const [busy,setBusy]=useState(false);
 const run=async(work:()=>Promise<unknown>)=>{setBusy(true);setError('');try{await work();await refresh?.();}catch(error){setError(readableError(error));}finally{setBusy(false);}};
 return {run,busy,error,feedback:error?<p className="error" role="alert">{error}</p>:null};
}
export function exportCsv(rows:Record<string,unknown>[],filename:string) {
 if(!rows.length)return;
 const quote=(value:unknown)=>{let cell=text(value);if(/^[=+\-@\t\r]/.test(cell))cell="'"+cell;return '"'+cell.replaceAll('"','""')+'"';};
 const headers=Object.keys(rows[0]);const csv='\uFEFF'+[headers.map(quote).join(','),...rows.map(row=>headers.map(key=>quote(row[key])).join(','))].join('\r\n');
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));const link=document.createElement('a');link.href=url;link.download=filename;link.click();URL.revokeObjectURL(url);
}
