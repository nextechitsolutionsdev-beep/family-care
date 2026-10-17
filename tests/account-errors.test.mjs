import test from 'node:test';
import assert from 'node:assert/strict';
import {accountError} from '../src/clinic/accountErrors.ts';
test('staff account failures explain password, doctor link and expired session',()=>{
 assert.match(accountError('WEAK_PASSWORD'),/كلمة المرور/);
 assert.match(accountError('DOCTOR_ALREADY_LINKED'),/حساب دخول بالفعل/);
 assert.match(accountError('',401),/جلسة الدخول انتهت/);
 assert.match(accountError('',403),/الأدمن/);
 assert.match(accountError('PROFILE_CREATE_FAILED'),/ربط حساب الدخول/);
});
