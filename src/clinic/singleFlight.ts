// Same-tick calls share a read. Calls during a read queue one fresh pass so
// a mutation committed after that read began cannot leave the desk stale.
// An optional scope is merged across waiting callers (e.g. a full reload wins over a partial one).
export function singleFlight<S=void>(work:(scope:S)=>Promise<void>,merge:(a:S,b:S)=>S=a=>a):(scope?:S)=>Promise<void> {
 let pending:Promise<void>|undefined,running=false,again=false,next:S|undefined,hasNext=false;
 const request=(scope:S)=>{next=hasNext?merge(next as S,scope):scope;hasNext=true;};
 return (scope?:S)=>{
  request(scope as S);
  if(pending){if(running)again=true;return pending;}
  pending=Promise.resolve().then(async()=>{
   running=true;
   do{again=false;const current=next as S;hasNext=false;next=undefined;await work(current);}while(again);
  }).finally(()=>{pending=undefined;running=false;again=false;hasNext=false;next=undefined;});
  return pending;
 };
}
