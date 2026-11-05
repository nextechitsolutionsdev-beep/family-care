import {minor} from '../domain/money.ts';

type Row=Record<string,unknown>;
/** A service priced at the desk («السعر يحدده الاستقبال»): it has no list price; the visit stores the typed price. */
export const isOpenPrice=(service:Row|undefined)=>service?.open_price===true;

/** Piastres from a form value (already piastres) or from a typed amount in pounds; null when nothing usable was typed. */
export function typedPrice(value:unknown):number|null{
 if(typeof value==='number')return Number.isSafeInteger(value)&&value>0?value:null;
 if(typeof value!=='string'||!value.trim())return null;
 const amount=minor(value);
 return amount>0?amount:null;
}

/** The line payload for a service: the typed price is sent only for an open-price service that is not a gift,
 * because the server refuses a typed price for a fixed-price service. */
export function withTypedPrice(line:Row,service:Row|undefined,typed:unknown):Row{
 const rest={...line};delete rest.unit_price_minor;
 if(!isOpenPrice(service)||line.is_gift===true)return rest;
 const amount=typedPrice(typed);
 if(amount===null)throw new Error('اكتب سعر الخدمة بالجنيه؛ الخدمة دي سعرها بيتحدد وقت الزيارة.');
 return {...rest,unit_price_minor:amount};
}
