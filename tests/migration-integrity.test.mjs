import test from 'node:test';
import assert from 'node:assert/strict';
import {sha256,verifyApplied} from '../scripts/migration-integrity.mjs';

const original='create table public.example(id uuid primary key);\nalter table public.example enable row level security;\n';
const crlf=original.replaceAll('\n','\r\n');
const record={checksum:sha256(original),recordedSource:original};

test('an unchanged applied migration is accepted in either line-ending form',()=>{
 assert.equal(verifyApplied({file:'x.sql',source:original,...record}),'match');
 assert.equal(verifyApplied({file:'x.sql',source:crlf,...record}),'line-endings');
 const appliedFromCrlf={checksum:sha256(crlf),recordedSource:crlf};
 assert.equal(verifyApplied({file:'x.sql',source:original,...appliedFromCrlf}),'line-endings','applied from a CRLF checkout, read from an LF one');
});

test('a genuine SQL change is rejected even with matching line endings',()=>{
 assert.throws(()=>verifyApplied({file:'x.sql',source:original.replace('uuid','text'),...record}),/Applied migration changed: x.sql/);
 assert.throws(()=>verifyApplied({file:'x.sql',source:crlf.replace('enable','disable'),...record}),/Applied migration changed/);
 assert.throws(()=>verifyApplied({file:'x.sql',source:original.replace(';\n',';  \n'),...record}),/Applied migration changed/,'other whitespace is not ignored');
});

test('the comparison is only trusted when the recorded source still matches its checksum',()=>{
 assert.throws(()=>verifyApplied({file:'x.sql',source:crlf,checksum:record.checksum,recordedSource:original+'-- tampered'}),/record is inconsistent/);
 assert.throws(()=>verifyApplied({file:'x.sql',source:crlf,checksum:record.checksum,recordedSource:undefined}),/no recorded source/);
});
