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
