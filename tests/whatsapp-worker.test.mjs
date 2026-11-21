import test from 'node:test';
import assert from 'node:assert/strict';
import {cairoDayStart,chatId,gapSeconds,networkOutcome,phoneSuffix,qrImage,safeReference,sendOutcome,sendingLimits,testMessage,withinSendHours,workerConfig} from '../scripts/whatsapp-core.mjs';

const base={SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVER_KEY:'k',OPENWA_API_KEY:'a'};

test('connection settings come from .env; secrets are required',()=>{
 const config=workerConfig(base);
 assert.equal(config.gatewayUrl,'http://localhost:2785');
 assert.equal(config.sessionId,null);
 assert.equal(config.sessionName,'family-care');
 assert.equal(workerConfig({...base,OPENWA_URL:'http://10.0.0.5:2785/'}).gatewayUrl,'http://10.0.0.5:2785');
 assert.throws(()=>workerConfig({...base,OPENWA_API_KEY:''}),/OPENWA_API_KEY/);
 assert.throws(()=>workerConfig({...base,SUPABASE_SERVER_KEY:''}),/SUPABASE_SERVER_KEY/);
});

test('sending limits come from the owner settings; empty trial list means everyone who consented',()=>{
 assert.deepEqual(sendingLimits({provider:'openwa',clinic_name:'فاميلي كير',daily_cap:50,start_hour:10,end_hour:20,min_gap_seconds:30,max_gap_seconds:90,max_age_hours:24,trial_numbers:['+201012345678']}),
  {provider:'openwa',clinicName:'فاميلي كير',dailyCap:50,startHour:10,endHour:20,minGap:30,maxGap:90,maxAgeHours:24,onlyNumbers:['+201012345678']});
 const defaults=sendingLimits({trial_numbers:[]});
 assert.equal(defaults.provider,'mock');assert.equal(defaults.onlyNumbers,null);assert.equal(defaults.dailyCap,100);
});

test('only the last three digits of the linked number are kept; QR must be a PNG data URL',()=>{
 assert.equal(phoneSuffix('201226166200'),'200');
 assert.equal(phoneSuffix('+20 122 616 6200'),'200');
 assert.equal(phoneSuffix(null),null);
 assert.equal(qrImage('data:image/png;base64,iVBORw0KGgo='),'data:image/png;base64,iVBORw0KGgo=');
 assert.equal(qrImage('data:text/html;base64,PHNjcmlwdD4='),null);
 assert.equal(qrImage('data:image/png;base64,'+'A'.repeat(200001)),null);
 assert.match(testMessage('فاميلي كير'),/فاميلي كير/);
 assert.match(testMessage(''),/العيادة/);
});

test('sending hours and the day boundary follow Cairo time',()=>{
 // 06:30 UTC on 20/11/2026 is 08:30 in Cairo (UTC+2): before 9.
 assert.equal(withinSendHours(new Date('2026-11-20T06:30:00Z'),9,21),false);
 assert.equal(withinSendHours(new Date('2026-11-20T07:00:00Z'),9,21),true);
 assert.equal(withinSendHours(new Date('2026-11-20T19:00:00Z'),9,21),false);
 assert.equal(cairoDayStart(new Date('2026-11-20T23:30:00Z')).toISOString(),'2026-11-20T22:00:00.000Z');
 assert.equal(cairoDayStart(new Date('2026-11-20T10:00:00Z')).toISOString(),'2026-11-19T22:00:00.000Z');
 // Summer time (UTC+3).
 assert.equal(cairoDayStart(new Date('2026-07-10T12:00:00Z')).toISOString(),'2026-07-09T21:00:00.000Z');
});

test('gateway answers map to safe results: never resend what may have gone out',()=>{
 assert.deepEqual(sendOutcome(201,{messageId:'true_201012345678@c.us_3EB0ABCD'}),{outcome:'sent',reference:'true_201012345678@c.us_3EB0ABCD',problem:null,retry:null});
 assert.equal(sendOutcome(400,{message:'Number is not registered on WhatsApp'}).problem,'NOT_ON_WHATSAPP');
 assert.deepEqual(sendOutcome(400,{message:'Session not active'}),{outcome:'failed',reference:null,problem:'GATEWAY_REJECTED',retry:null});
 assert.equal(sendOutcome(409,null).retry,120);
 assert.equal(sendOutcome(429,{retryAfterSeconds:5}).retry,30);
 assert.equal(sendOutcome(429,{}).retry,600);
 for(const status of [500,502,503])assert.deepEqual(sendOutcome(status,null),{outcome:'failed',reference:null,problem:'SEND_UNCONFIRMED',retry:null});
 assert.equal(networkOutcome({cause:{code:'ECONNREFUSED'}}).retry,300);
 assert.equal(networkOutcome(new DOMException('timeout','TimeoutError')).problem,'SEND_UNCONFIRMED');
});

test('references are trimmed to the database format; pauses stay in range',()=>{
 assert.equal(safeReference('a b/c'),'a_b_c');
 assert.equal(safeReference(''),null);
 assert.equal(safeReference('x'.repeat(300)).length,200);
 assert.equal(chatId('201012345678'),'201012345678@c.us');
 assert.equal(gapSeconds(20,60,()=>0),20);
 assert.equal(gapSeconds(20,60,()=>0.9999),60);
});
