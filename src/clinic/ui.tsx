import {useEffect,useRef,useState,type ReactNode} from 'react';
import {text,readableError,type Row} from './api';
import {minor,percent,decimal} from '../domain/money';
export type Field={key:string;label:string;type?:'text'|'email'|'password'|'date'|'time'|'number'|'money'|'percent'|'checkbox'|'textarea'|'select'|'weekdays';required?:boolean;options?:{value:string;label:string}[];when?:(values:Record<string,unknown>)=>boolean;hint?:string;min?:number;max?:number};
export function Form({fields,initial={},submit,label='حفظ',children}:{fields:Field[];initial?:Record<string,unknown>;submit:(values:Record<string,unknown>)=>Promise<void>;label?:string;children?:ReactNode}) {
 const [values,setValues]=useState<Record<string,unknown>>(()=>Object.fromEntries(fields.map(field=>[field.key,
   field.type==='money'||field.type==='percent'?decimal(initial[field.key]??0):initial[field.key]??(field.type==='checkbox'?false:field.type==='weekdays'?[]:'')])));
 const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 return <form className="editor" onSubmit={event=>{event.preventDefault();setError('');setBusy(true);const normalized={...values};
   try {for(const field of fields) {
     if(field.type==='money')normalized[field.key]=minor(text(values[field.key]));
     if(field.type==='percent')normalized[field.key]=percent(text(values[field.key]));
     if(field.type==='number')normalized[field.key]=values[field.key]===''?null:Number(values[field.key]);
   }}catch(error){setError(readableError(error));setBusy(false);return;}
   void submit(normalized).catch(error=>setError(readableError(error))).finally(()=>setBusy(false));
 }}>
   {fields.filter(field=>!field.when||field.when(values)).map(field=>{
     const id=`field-${field.key}`;const set=(value:unknown)=>setValues(current=>({...current,[field.key]:value}));
     return <div className={field.type==='textarea'?'field wide':'field'} key={field.key}>
       {field.type==='checkbox'?<label className="check"><input type="checkbox" checked={Boolean(values[field.key])} onChange={event=>set(event.target.checked)}/>{field.label}</label>:<><label htmlFor={id}>{field.label}{field.required?' *':''}</label>
       {field.type==='select'?<select id={id} required={field.required} value={text(values[field.key])} onChange={event=>set(event.target.value)}><option value="">اختار…</option>{field.options?.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select>:
        field.type==='textarea'?<textarea id={id} required={field.required} value={text(values[field.key])} onChange={event=>set(event.target.value)} rows={3}/>:
        field.type==='weekdays'?<fieldset className="days" id={id}><legend>الأيام المتاحة</legend>{[{day:'السبت',index:6},{day:'الأحد',index:0},{day:'الإثنين',index:1},{day:'الثلاثاء',index:2},{day:'الأربعاء',index:3},{day:'الخميس',index:4},{day:'الجمعة',index:5}].map(({day,index})=><label key={day}><input type="checkbox" checked={(values[field.key] as number[]).includes(index)} onChange={event=>set(event.target.checked?[...(values[field.key] as number[]),index]:(values[field.key] as number[]).filter(value=>value!==index))}/>{day}</label>)}</fieldset>:
        <input id={id} type={field.type==='money'||field.type==='percent'?'text':field.type??'text'} inputMode={['money','percent'].includes(field.type??'')?'decimal':undefined} required={field.required} min={field.min} max={field.max} value={text(values[field.key])} onChange={event=>set(event.target.value)} autoComplete={field.type==='password'?'new-password':undefined}/>}
       </>}{field.hint&&<small>{field.hint}</small>}
     </div>;
   })}
   {children}{error&&<p className="error wide" role="alert">{error}</p>}<div className="form-actions wide"><button className="primary" disabled={busy} type="submit">{busy?'جارٍ الحفظ…':label}</button></div>
 </form>;
}
export function Dialog({title,close,children}:{title:string;close:()=>void;children:ReactNode}) {
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const dialog=ref.current;dialog?.showModal();return()=>dialog?.close();},[]);
 return <dialog ref={ref} onCancel={close}><header className="dialog-head"><h2>{title}</h2><button type="button" aria-label="إغلاق" onClick={close}>×</button></header>{children}</dialog>;
}
export type Column={label:string;render:(row:Row)=>ReactNode;numeric?:boolean};
export function Table({rows,columns,empty='لا توجد سجلات هنا.'}:{rows:Row[];columns:Column[];empty?:string}) {
 if(!rows.length)return <p className="empty">{empty}</p>;
 return <div className="table-wrap"><table><thead><tr>{columns.map(column=><th key={column.label} className={column.numeric?'numeric':''}>{column.label}</th>)}</tr></thead><tbody>{rows.map((row,index)=><tr key={row.id||index}>{columns.map(column=><td key={column.label} className={column.numeric?'numeric':''}>{column.render(row)}</td>)}</tr>)}</tbody></table></div>;
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
