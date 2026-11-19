/** Monthly payroll per employee (owner decision 19/11/2026). Amounts are piastres. */
export type PayrollKind='advance'|'deduction'|'bonus'|'payout';
export type MonthTotals={salary:bigint;bonus:bigint;advance:bigint;deduction:bigint;payout:bigint;due:bigint};

/** First day of the month of an ISO date (yyyy-mm-dd → yyyy-mm-01). */
export const monthOf=(day:string)=>day.slice(0,8)+'01';

/** Still due for the month = salary + bonuses − advances − deductions − salary already paid. Voided entries do not count. */
export function monthTotals(salary:bigint,entries:Record<string,unknown>[]):MonthTotals{
 const sum=(kind:PayrollKind)=>entries.filter(row=>row.kind===kind&&!row.voided_at).reduce((total,row)=>total+BigInt(String(row.amount_minor)),0n);
 const bonus=sum('bonus'),advance=sum('advance'),deduction=sum('deduction'),payout=sum('payout');
 return {salary,bonus,advance,deduction,payout,due:salary+bonus-advance-deduction-payout};
}

/** «بقاله في الشغل»: whole years and months since the hire date. */
export function tenure(hire:string,today:string):string{
 const [hy,hm,hd]=hire.split('-').map(Number),[ty,tm,td]=today.split('-').map(Number);
 let months=(ty-hy)*12+(tm-hm)-(td<hd?1:0);if(months<0)months=0;
 const years=Math.floor(months/12),rest=months%12;
 if(!years&&!rest)return 'أقل من شهر';
 // Egyptian Arabic counting: 1 سنة / 2 سنتين / 3–10 سنين / 11+ سنة (same for شهر).
 const count=(n:number,one:string,two:string,few:string,many:string)=>n===1?one:n===2?two:n<=10?`${n} ${few}`:`${n} ${many}`;
 return [years?count(years,'سنة','سنتين','سنين','سنة'):'',rest?count(rest,'شهر','شهرين','شهور','شهر'):''].filter(Boolean).join(' و ');
}
