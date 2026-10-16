// Same-tick calls share a read. Calls during a read queue one fresh pass so
// a mutation committed after that read began cannot leave the desk stale.
export function singleFlight(work:()=>Promise<void>):()=>Promise<void> {
 let pending:Promise<void>|undefined,running=false,again=false;
 return ()=>{
  if(pending){if(running)again=true;return pending;}
  pending=Promise.resolve().then(async()=>{
   running=true;
   do{again=false;await work();}while(again);
  }).finally(()=>{pending=undefined;running=false;again=false;});
  return pending;
 };
}
