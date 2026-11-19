/** «تعديل» on a receipt (owner decision 19/11/2026): the owner any receipt; reception only one recorded today (Cairo),
 * and the server also refuses once today is closed. Refunds and receipts already returned or corrected are final. */
export const cairoDay=(value:unknown)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo'}).format(new Date(String(value)));
export function correctable(payment:Record<string,unknown>,payments:Record<string,unknown>[],role:string,available:boolean,today:string):boolean{
 if(!available||role==='doctor'||payment.kind==='refund')return false;
 if(payments.some(row=>row.reverses_payment_id===payment.id))return false;
 return role==='owner'||cairoDay(payment.paid_at)===today;
}
