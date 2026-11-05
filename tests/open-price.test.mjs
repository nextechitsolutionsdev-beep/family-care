import test from 'node:test';
import assert from 'node:assert/strict';
import {isOpenPrice,typedPrice,withTypedPrice} from '../src/clinic/openPrice.ts';

const open={id:'s1',open_price:true},fixed={id:'s2',open_price:false},legacy={id:'s3'};

test('only services marked open are priced at the desk',()=>{
 assert.equal(isOpenPrice(open),true);
 assert.equal(isOpenPrice(fixed),false);
 assert.equal(isOpenPrice(legacy),false,'a database without the column has fixed prices only');
 assert.equal(isOpenPrice(undefined),false);
});

test('typed prices are exact piastres from a form value or pounds text',()=>{
 assert.equal(typedPrice(35000),35000);
 assert.equal(typedPrice('350.5'),35050);
 assert.equal(typedPrice('1,250.25'),125025);
 assert.equal(typedPrice(''),null);
 assert.equal(typedPrice(0),null);
 assert.equal(typedPrice('0'),null);
 assert.equal(typedPrice(12.5),null,'a form value is already whole piastres');
 assert.throws(()=>typedPrice('12.345'));
});

test('the typed price is sent only for a non-gift open-price service',()=>{
 assert.deepEqual(withTypedPrice({service_id:'s1',quantity:2},open,'200'),{service_id:'s1',quantity:2,unit_price_minor:20000});
 assert.deepEqual(withTypedPrice({service_id:'s2',quantity:1,unit_price_minor:''},fixed,''),{service_id:'s2',quantity:1},'a hidden field value is dropped for a fixed price');
 assert.deepEqual(withTypedPrice({service_id:'s1',is_gift:true,unit_price_minor:''},open,''),{service_id:'s1',is_gift:true},'a gift costs nothing');
 assert.throws(()=>withTypedPrice({service_id:'s1'},open,''),/اكتب سعر الخدمة/);
 assert.throws(()=>withTypedPrice({service_id:'s1'},open,0),/اكتب سعر الخدمة/);
});
