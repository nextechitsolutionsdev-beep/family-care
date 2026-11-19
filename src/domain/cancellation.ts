/** Money still held for a visit when its booking is cancelled (owner decision 19/11/2026): receipts not yet
 * returned. A full refund returns the applied amount plus any excess; a partial refund returns applied amounts only
 * and must stay below them (the database rule in private.booking_cancel). */
export function refundableNow(payments:Record<string,unknown>[]):{total:bigint;applied:bigint}{
 const returned=new Set(payments.filter(row=>row.kind==='refund').map(row=>String(row.reverses_payment_id)));
 const open=payments.filter(row=>row.kind!=='refund'&&!returned.has(String(row.id)));
 const applied=open.reduce((sum,row)=>sum+BigInt(String(row.amount_minor??0)),0n);
 return {applied,total:applied+open.reduce((sum,row)=>sum+BigInt(String(row.excess_minor??0)),0n)};
}

/** Whether a partial refund of this amount is allowed. */
export function partialRefundAllowed(amount:bigint,applied:bigint):boolean{return amount>0n&&amount<applied;}
