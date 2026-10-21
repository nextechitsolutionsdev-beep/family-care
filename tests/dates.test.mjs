import test from 'node:test';
import assert from 'node:assert/strict';
import {parseDeskDate,formatDeskDate,isIsoDate} from '../src/domain/dates.ts';

test('desk dates read as day/month/year and become ISO',()=>{
 assert.equal(parseDeskDate('07/10/2026'),'2026-10-07');
 assert.equal(parseDeskDate('7/1/2026'),'2026-01-07');
 assert.equal(parseDeskDate(' 31-12-2026 '),'2026-12-31');
 assert.equal(parseDeskDate('01.02.2027'),'2027-02-01');
 assert.equal(parseDeskDate('٠٧/١٠/٢٠٢٦'),'2026-10-07','Arabic digits');
 assert.equal(parseDeskDate('2026-10-07'),'2026-10-07','pasted ISO kept');
 assert.equal(parseDeskDate(''),'');
});

test('impossible dates and leap years are rejected, not rolled over',()=>{
 for(const value of ['31/04/2026','30/02/2024','29/02/2025','29/02/1900','00/10/2026','10/13/2026','32/01/2026','1/1/26','2026/10/07','2026-02-30','12/10'])
  assert.equal(parseDeskDate(value),null,value);
 assert.equal(parseDeskDate('29/02/2024'),'2024-02-29');
 assert.equal(parseDeskDate('29/02/2000'),'2000-02-29','400-year leap rule');
});

test('formatting shows dd/mm/yyyy and ignores non-dates',()=>{
 assert.equal(formatDeskDate('2026-10-07'),'07/10/2026');
 assert.equal(formatDeskDate(''),'');assert.equal(formatDeskDate('2026-02-30'),'');
 assert.equal(isIsoDate('2026-10-07'),true);assert.equal(isIsoDate('07/10/2026'),false);
});
