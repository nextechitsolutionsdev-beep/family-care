import test from 'node:test';
import assert from 'node:assert/strict';
import {cairoDayStart,chatId,gapSeconds,networkOutcome,safeReference,sendOutcome,withinSendHours,workerConfig} from '../scripts/whatsapp-core.mjs';

const base={SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVER_KEY:'k',OPENWA_API_KEY:'a',OPENWA_SESSION_ID:'s'};

test('worker settings: defaults, trial numbers normalised, bad values refused',()=>{
 const config=workerConfig(base);
 assert.equal(config.gatewayUrl,'http://localhost:2785');
 assert.equal(config.onlyNumbers,null);
 assert.deepEqual([config.dailyCap,config.maxAgeHours,config.startHour,config.endHour,config.minGap,config.maxGap],[100,48,9,21,20,60]);
 assert.deepEqual(workerConfig({...base,WHATSAPP_ONLY_NUMBERS:'01012345678, +201112345678'}).onlyNumbers,['+201012345678','+201112345678']);
 assert.throws(()=>workerConfig({...base,WHATSAPP_ONLY_NUMBERS:'0101234'}),/Egyptian mobile/);
 assert.throws(()=>workerConfig({...base,WHATSAPP_SEND_HOURS:'21-9'}),/9-21/);
 assert.throws(()=>workerConfig({...base,WHATSAPP_DAILY_CAP:'0'}),/WHATSAPP_DAILY_CAP/);
 assert.throws(()=>workerConfig({...base,OPENWA_API_KEY:''}),/OPENWA_API_KEY/);
 assert.equal(workerConfig({...base,OPENWA_URL:'http://10.0.0.5:2785/'}).gatewayUrl,'http://10.0.0.5:2785');
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
