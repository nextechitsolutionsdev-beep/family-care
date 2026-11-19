import test from 'node:test';
import assert from 'node:assert/strict';
import {dayHours,outsideDoctorHours,scheduleLabel} from '../src/clinic/doctorAvailability.ts';

// 2026-11-22 is a Sunday (0), 2026-11-23 a Monday (1).
const doctor={active:true,schedule:[0,6],working_hours:{'0':{from:'15:00',to:'17:00'}}};

test('schedule label lists Saturday first with hours where set',()=>{
 assert.equal(scheduleLabel(doctor),'السبت · الأحد 15:00–17:00');
 assert.equal(scheduleLabel({schedule:[],working_hours:{}}),'كل أيام الأسبوع');
 assert.equal(dayHours(doctor,0)?.to,'17:00');assert.equal(dayHours(doctor,6),null);
 assert.equal(dayHours({working_hours:{'0':{from:'9',to:'x'}}},0),null);
});

test('outside hours mirrors the server: day off, before start, at or after the end',()=>{
 assert.match(outsideDoctorHours(doctor,'2026-11-23','16:00'),/مش بيشتغل يوم الإثنين/);
 assert.match(outsideDoctorHours(doctor,'2026-11-22','14:59'),/من 15:00 لـ 17:00/);
 assert.match(outsideDoctorHours(doctor,'2026-11-22','17:00'),/17:00/);
 assert.equal(outsideDoctorHours(doctor,'2026-11-22','15:00'),null);
 assert.equal(outsideDoctorHours(doctor,'2026-11-22','16:59:00'),null);
 assert.equal(outsideDoctorHours(doctor,'2026-11-22',''),null,'no time: checked by day only');
 assert.equal(outsideDoctorHours(doctor,'2026-11-28','23:00'),null,'Saturday has no hour limit');
 assert.equal(outsideDoctorHours({schedule:[],working_hours:{}},'2026-11-23','03:00'),null,'empty schedule = every day');
 assert.equal(outsideDoctorHours(doctor,'bad-date','16:00'),null);
});
