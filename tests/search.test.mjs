import test from 'node:test';
import assert from 'node:assert/strict';
import {patientSearchIndex} from '../src/clinic/search.ts';

test('the permanent code and every legacy specialty code find the same patient',()=>{
 const patients=[{id:'p1',name:'عميل',phone_e164:'+201012345678',patient_code:'FC-000123'},{id:'p2',name:'آخر',phone_e164:'+201112345678',patient_code:'FC-000124'}];
 const legacy=[{patient_id:'p1',code:'DEN-000382'},{patient_id:'p1',code:'DERM-000007'}];
 const index=patientSearchIndex(patients,legacy);
 const find=term=>patients.filter(row=>index.get(row.id).includes(term.toLowerCase())).map(row=>row.id);
 assert.deepEqual(find('FC-000123'),['p1']);assert.deepEqual(find('fc-000123'),['p1']);assert.deepEqual(find('000124'),['p2']);
 assert.deepEqual(find('DEN-000382'),['p1'],'old printed dental code');assert.deepEqual(find('DERM-000007'),['p1'],'old printed dermatology code');
 assert.deepEqual(find('01012345678'),['p1'],'local phone');
});
