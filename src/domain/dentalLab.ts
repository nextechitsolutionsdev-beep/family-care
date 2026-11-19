/** Dental lab cases (owner decision 19/11/2026). */
export type LabStatus='in_lab'|'back'|'cancelled';
export function labStatus(row:Record<string,unknown>):LabStatus{
 return row.cancelled_at?'cancelled':row.received_on?'back':'in_lab';
}
/** Counts and lab prices of the listed cases; cancelled cases are left out. */
export function labTotals(rows:Record<string,unknown>[]){
 const live=rows.filter(row=>!row.cancelled_at);
 const price=(list:typeof live)=>list.reduce((sum,row)=>sum+BigInt(String(row.price_minor??0)),0n);
 const paid=price(live.filter(row=>row.paid_expense_id));
 return {inLab:live.filter(row=>!row.received_on).length,back:live.filter(row=>row.received_on).length,price:price(live),paid,unpaid:price(live)-paid};
}
