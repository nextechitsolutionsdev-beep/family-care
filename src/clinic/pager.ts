/** Keyset pagination over a unique key, so a full read never skips or repeats a row that exists for the whole
 * read, even when rows are inserted or removed between pages. Offset paging (range) without a stable order
 * gave no such guarantee once a table passed one page. */
export type Key=string[];
export type Cursor=Record<string,unknown>;
export type PageReader<T extends Cursor>=(after:Cursor|undefined,limit:number)=>Promise<T[]>;

export async function readAll<T extends Cursor>(read:PageReader<T>,key:Key,pageSize=1000):Promise<T[]>{
 if(!key.length)throw new Error('pagination key required');
 const rows:T[]=[];let after:Cursor|undefined;
 for(;;){
  const page=await read(after,pageSize);
  rows.push(...page);
  if(page.length<pageSize)return rows;
  const last=page[page.length-1];
  after=Object.fromEntries(key.map(column=>[column,last[column]]));
 }
}

const quoted=(value:unknown)=>`"${String(value).replaceAll('\\','\\\\').replaceAll('"','\\"')}"`;

/** PostgREST filter selecting rows strictly after the cursor in key order: a>x, or a=x and b>y, … */
export function afterFilter(key:Key,after:Cursor):string{
 const terms=key.map((column,index)=>{
  const equal=key.slice(0,index).map(previous=>`${previous}.eq.${quoted(after[previous])}`);
  const greater=`${column}.gt.${quoted(after[column])}`;
  return equal.length?`and(${[...equal,greater].join(',')})`:greater;
 });
 return terms.join(',');
}

/** In-memory reference of the same ordering, used by tests to model a table. */
export function compareKey(key:Key,a:Cursor,b:Cursor):number{
 for(const column of key){const x=String(a[column]),y=String(b[column]);if(x<y)return -1;if(x>y)return 1;}
 return 0;
}
