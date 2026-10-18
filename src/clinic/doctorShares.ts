export function doctorShareRates(revisions:Record<string,unknown>[]){
 const latest=new Map<string,{id:bigint;bps:number}>();
 for(const row of revisions){
  const line=String(row.line_id),id=BigInt(String(row.id));
  if(!latest.has(line)||latest.get(line)!.id<id)latest.set(line,{id,bps:Number(row.to_bps)});
 }
 return new Map([...latest].map(([line,value])=>[line,value.bps]));
}
