import test from 'node:test';
import assert from 'node:assert/strict';
import {doctorCategoryLabel,doctorCategoryOptions} from '../src/domain/doctorCategories.ts';

test('the first doctor category follows the selected specialty, for any specialty',()=>{
 assert.deepEqual(doctorCategoryOptions('أسنان').map(option=>option.label),['أطباء الأسنان','أطباء مستأجرين','أطباء نسبة']);
 assert.deepEqual(doctorCategoryOptions('باطنة').map(option=>option.label),['أطباء الباطنة','أطباء مستأجرين','أطباء نسبة']);
 assert.deepEqual(doctorCategoryOptions('جلدية').map(option=>option.label),['أطباء الجلدية','أطباء مستأجرين','أطباء نسبة']);
 assert.equal(doctorCategoryLabel('dentist','العلاج الطبيعي'),'أطباء العلاج الطبيعي','article already present');
 assert.equal(doctorCategoryLabel('dentist','نساء وتوليد'),'أطباء نساء وتوليد','custom multi-word specialty');
 assert.equal(doctorCategoryLabel('dentist','تخاطب'),'أطباء التخاطب','custom specialty added by the owner');
 assert.equal(doctorCategoryLabel('dentist',''),'أطباء التخصص','no specialty chosen yet');
});

test('stored category values are unchanged; renting and percentage labels do not depend on the specialty',()=>{
 assert.deepEqual(doctorCategoryOptions('أسنان').map(option=>option.value),['dentist','renting','percentage']);
 for(const specialty of ['أسنان','باطنة','أي تخصص'])assert.equal(doctorCategoryLabel('renting',specialty),'أطباء مستأجرين');
 assert.equal(doctorCategoryLabel('percentage','جلدية'),'أطباء نسبة');
});
