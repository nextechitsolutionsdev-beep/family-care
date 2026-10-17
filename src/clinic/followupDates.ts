// Date-only ISO values compare in calendar order; no device-local conversion.
export function followupTiming(due:unknown,cairoToday:string):'overdue'|'today'|'upcoming'|'invalid' {
 const value=String(due??'');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return 'invalid';
 return value<cairoToday?'overdue':value>cairoToday?'upcoming':'today';
}
export const followupTimingLabels={overdue:'متأخرة',today:'اليوم',upcoming:'قادمة',invalid:'تاريخ غير متاح'};
