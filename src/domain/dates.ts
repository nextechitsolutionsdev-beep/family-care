/** Desk dates are typed and shown as dd/mm/yyyy; the API always receives ISO yyyy-mm-dd. */
const arabicDigits=(value:string)=>value.replace(/[٠-٩]/g,digit=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit))).replace(/[۰-۹]/g,digit=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));

export function isIsoDate(value:unknown):value is string{
 const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value??''));
 return Boolean(match)&&validParts(Number(match![3]),Number(match![2]),Number(match![1]));
}

function validParts(day:number,month:number,year:number):boolean{
 if(year<1900||year>2100||month<1||month>12||day<1)return false;
 const days=new Date(Date.UTC(year,month,0)).getUTCDate();
 return day<=days;
}

/** '' for empty input, ISO for a real calendar date, null for anything incomplete or impossible. */
export function parseDeskDate(input:unknown):string|null{
 const value=arabicDigits(String(input??'')).trim().replace(/[‎‏؜]/g,'');
 if(!value)return '';
 if(isIsoDate(value))return value;
 const match=/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(value);
 if(!match)return null;
 const [day,month,year]=[Number(match[1]),Number(match[2]),Number(match[3])];
 if(!validParts(day,month,year))return null;
 return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}

export function formatDeskDate(iso:unknown):string{
 return isIsoDate(iso)?iso.split('-').reverse().join('/'):'';
}
