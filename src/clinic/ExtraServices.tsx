import {useEffect} from 'react';
import {useClinic} from './store';
import {text,type Row} from './api';
import {isOpenPrice} from './openPrice';
/** unit_price: the typed price in pounds, only for an open-price service. */
export type SelectedService={service_id:string;quantity:number;unit_price?:string};
export default function ExtraServices({doctorId,items,onChange}:{doctorId:unknown;items:SelectedService[];onChange:(items:SelectedService[])=>void}){
 const {rows}=useClinic();
 useEffect(()=>{onChange([]);},[doctorId,onChange]);
 const doctor=rows('doctors').find(row=>row.id===doctorId);
 const services=rows('services').filter((row:Row)=>row.active&&row.specialty_id===doctor?.specialty_id&&row.pricing_kind!=='home');
 if(!doctor)return null;
 return <div className="wide extra-services">{items.map((item,index)=><div className="extra-service" key={index}>
 <label>الخدمة الإضافية {index+1}<select required value={item.service_id} onChange={event=>onChange(items.map((value,i)=>i===index?{...value,service_id:event.target.value}:value))}><option value="">اختار…</option>{services.map(service=><option key={service.id} value={service.id}>{text(service.name)}</option>)}</select></label>
 <label>العدد للخدمة {index+1}<input type="number" required min="1" max="1000" value={item.quantity} onChange={event=>onChange(items.map((value,i)=>i===index?{...value,quantity:Number(event.target.value)}:value))}/></label>
 {isOpenPrice(services.find(service=>service.id===item.service_id))&&<label>سعر الخدمة {index+1} بالجنيه<input inputMode="decimal" required value={item.unit_price??''} onChange={event=>onChange(items.map((value,i)=>i===index?{...value,unit_price:event.target.value}:value))}/></label>}
 <button type="button" onClick={()=>onChange(items.filter((_,i)=>i!==index))}>إلغاء الخدمة {index+1}</button>
 </div>)}<button type="button" disabled={items.length>=29} onClick={()=>onChange([...items,{service_id:'',quantity:1}])}>إضافة خدمة أخرى</button></div>;
}
