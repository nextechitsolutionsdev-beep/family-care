export function visitWeekday(value:unknown):number|null{
 const day=String(value??'');if(!/^\d{4}-\d{2}-\d{2}$/.test(day))return null;
 const date=new Date(`${day}T12:00:00Z`);
 if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==day)return null;
 return date.getUTCDay();
}
export function doctorAvailable(doctor:Record<string,unknown>|undefined,day:unknown):boolean{
 const weekday=visitWeekday(day);
 if(!doctor?.active||weekday===null||!Array.isArray(doctor.schedule))return false;
 return doctor.schedule.length===0||doctor.schedule.includes(weekday);
}
export const workWeek=[{day:6,label:'السبت'},{day:0,label:'الأحد'},{day:1,label:'الإثنين'},{day:2,label:'الثلاثاء'},{day:3,label:'الأربعاء'},{day:4,label:'الخميس'},{day:5,label:'الجمعة'}];
/** Hours for one working day, from doctors.working_hours ({"0":{"from":"15:00","to":"17:00"}}). */
export type DayHours={from:string;to:string};
const timePattern=/^([01][0-9]|2[0-3]):[0-5][0-9]$/;
export function dayHours(doctor:Record<string,unknown>|undefined,weekday:number):DayHours|null{
 const hours=doctor?.working_hours;
 if(!hours||typeof hours!=='object')return null;
 const span=(hours as Record<string,unknown>)[String(weekday)] as Record<string,unknown>|undefined;
 if(!span||!timePattern.test(String(span.from))||!timePattern.test(String(span.to)))return null;
 return {from:String(span.from),to:String(span.to)};
}
const workingDays=(doctor:Record<string,unknown>|undefined)=>Array.isArray(doctor?.schedule)?doctor.schedule as number[]:[];
/** «السبت 17:00–21:00 · الأحد» in Saturday-first order; «كل أيام الأسبوع» when no day is set. */
export function scheduleLabel(doctor:Record<string,unknown>|undefined):string{
 const days=workingDays(doctor);
 const listed=days.length?workWeek.filter(item=>days.includes(item.day)):workWeek.filter(item=>dayHours(doctor,item.day));
 if(!listed.length)return 'كل أيام الأسبوع';
 const text=listed.map(item=>{const hours=dayHours(doctor,item.day);return hours?`${item.label} ${hours.from}–${hours.to}`:item.label;}).join(' · ');
 return days.length?text:`كل أيام الأسبوع (${text})`;
}
/** Why a booking is outside the doctor's days or hours, or null. Mirrors private.doctor_outside_hours. */
export function outsideDoctorHours(doctor:Record<string,unknown>|undefined,day:unknown,time:unknown):string|null{
 const weekday=visitWeekday(day);
 if(!doctor||weekday===null)return null;
 const label=workWeek.find(item=>item.day===weekday)?.label??'';
 const days=workingDays(doctor);
 if(days.length&&!days.includes(weekday))return `الطبيب مش بيشتغل يوم ${label}. مواعيده: ${scheduleLabel(doctor)}.`;
 const at=String(time??'').slice(0,5);
 const hours=dayHours(doctor,weekday);
 if(!hours||!timePattern.test(at))return null;
 if(at<hours.from||at>=hours.to)return `الطبيب موجود يوم ${label} من ${hours.from} لـ ${hours.to} بس، والوقت المختار ${at}.`;
 return null;
}
