/** Display labels for the stored doctor categories. Stored values stay 'dentist' | 'renting' | 'percentage';
 * the first category is the specialty's own doctors, named after whatever specialty is selected. */
export const doctorCategoryOrder=['dentist','renting','percentage'] as const;

/** «أسنان» → «الأسنان», «باطنه» → «الباطنه»; names that already have the article or several words stay as typed. */
function definite(name:string):string{
 const value=name.trim();
 if(!value)return 'التخصص';
 if(value.startsWith('ال')||/\s/.test(value))return value;
 return 'ال'+value;
}

export function doctorCategoryLabel(category:unknown,specialtyName?:unknown):string{
 if(category==='renting')return 'أطباء مستأجرين';
 if(category==='percentage')return 'أطباء نسبة';
 if(category==='dentist')return `أطباء ${definite(String(specialtyName??''))}`;
 return String(category??'');
}

export function doctorCategoryOptions(specialtyName?:unknown){
 return doctorCategoryOrder.map(value=>({value,label:doctorCategoryLabel(value,specialtyName)}));
}
