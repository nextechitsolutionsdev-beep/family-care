import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeEgyptianPhone} from '../src/domain/phone.ts';

test('Egyptian mobile entry accepts local, pasted international and Arabic digits',()=>{
 for(const prefix of ['010','011','012','015']){
  const local=prefix+'12345678',expected='+2'+local;
  for(const input of [local,local.slice(1),'2'+local,'+2'+local,'002'+local,` ${prefix} 1234-5678 `])assert.equal(normalizeEgyptianPhone(input),expected);
 }
 for(const input of ['٠١٠١٢٣٤٥٦٧٨','۰۱۰۱۲۳۴۵۶۷۸','\u200e+20 (10) 1234-5678\u200f'])assert.equal(normalizeEgyptianPhone(input),'+201012345678');
});
test('optional phone stays empty; malformed phones are left for validation, not repaired',()=>{
 assert.equal(normalizeEgyptianPhone(null),'');
 assert.equal(normalizeEgyptianPhone('  '),'');
 for(const value of ['010123','01912345678','++201012345678','+441234567890','010123456789','+200000000001'])assert.equal(normalizeEgyptianPhone(value),value);
});
