import test from 'node:test';
import assert from 'node:assert/strict';
import {commissionTerms,probeCapabilities,withTerms} from '../src/clinic/compat.ts';

// A minimal stand-in for the Supabase client: each scenario decides how the server answers.
function client({rpc,select}){
 const chain=result=>{const builder={order:()=>builder,gt:()=>builder,limit:async()=>result()};return builder;};
 return {rpc:name=>chain(()=>rpc(name)),from:table=>({select:columns=>{const answer=()=>select(table,columns);const builder={limit:async()=>answer(),then:(resolve,reject)=>Promise.resolve(answer()).then(resolve,reject)};return builder;}})};
}
const missingFunction={data:null,error:{code:'PGRST202',message:'Could not find the function'}};
const denied={data:null,error:{code:'42501',message:'permission denied'}};

test('final schema: terms come from the server function',async()=>{
 const result=await commissionTerms(client({rpc:()=>({data:[{doctor_id:'a',default_share_bps:3333}],error:null}),select:()=>assert.fail('old column must not be read')}));
 assert.deepEqual([...result.terms],[['a',3333]]);
});

test('old schema: function missing, old column readable',async()=>{
 const result=await commissionTerms(client({rpc:()=>missingFunction,select:()=>({data:[{id:'a',default_share_bps:2500}],error:null})}));
 assert.deepEqual([...result.terms],[['a',2500]]);
});

test('schema-cache transition: function not visible yet and column already restricted → unavailable, not guessed',async()=>{
 const result=await commissionTerms(client({rpc:()=>missingFunction,select:()=>denied}));
 assert.equal(result.terms,null);
 const doctors=[{id:'a',name:'x'}];
 assert.deepEqual(withTerms(doctors,result.terms),doctors,'no percentage is invented');
});

test('any other server error is reported, not hidden',async()=>{
 await assert.rejects(commissionTerms(client({rpc:()=>({data:null,error:{code:'57014',message:'timeout'}}),select:()=>assert.fail()})),error=>error.code==='57014');
});

test('capabilities are on only when the server positively accepts the column',async()=>{
 const features=await probeCapabilities(client({rpc:()=>assert.fail(),select:(table)=>table==='offers'?{data:[],error:null}:{data:null,error:{code:'42703',message:'column does not exist'}}}),'owner');
 assert.deepEqual(features,{offerPatientLimit:true,patientCode:false,doctorHours:false,paymentExcess:false,payerPrices:false,dayClosing:false,paymentCorrection:false,bookingCancellation:false,accountArchive:false,campaignTemplates:false,payroll:false,dentalLab:false});
 await assert.rejects(probeCapabilities(client({rpc:()=>assert.fail(),select:()=>({data:null,error:{code:'08006',message:'connection failure'}})}),'owner'),error=>error.code==='08006');
});

test('a table that does not exist yet (payer prices before 20261119100300) is a missing capability, not an error',async()=>{
 const features=await probeCapabilities(client({rpc:()=>assert.fail(),select:(table)=>table==='payer_service_prices'?{data:null,error:{code:'PGRST205',message:'table not found'}}:{data:[],error:null}}),'reception');
 assert.deepEqual(features,{offerPatientLimit:true,patientCode:true,doctorHours:true,paymentExcess:true,payerPrices:false,dayClosing:true,paymentCorrection:true,bookingCancellation:true,accountArchive:false,campaignTemplates:true,payroll:false,dentalLab:true});
 const doctor=await probeCapabilities(client({rpc:()=>assert.fail(),select:(table)=>['payments','payer_service_prices','day_closings','payment_corrections','booking_cancellations','campaign_templates','lab_cases','employees','profiles'].includes(table)?assert.fail('doctors never read payments'):{data:[],error:null}}),'doctor');
 assert.equal(doctor.paymentExcess,false);assert.equal(doctor.payerPrices,false);
});
