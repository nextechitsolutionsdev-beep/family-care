import test from 'node:test';
import assert from 'node:assert/strict';
import {query} from '../scripts/supabase.mjs';
test('quick service prices are atomic, exact, immutable and owner-only',()=>{
 const result=query(`begin;
 do $$ declare uid uuid; key uuid:=gen_random_uuid(); payload jsonb; first jsonb; retry jsonb; version uuid; previous_count bigint; previous_total numeric;
 begin
 select id into strict uid from public.profiles where role='owner' and active;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated')::text,true);
 select count(*),sum(price_minor) into previous_count,previous_total from public.service_prices;
 payload:=jsonb_build_object('idempotency_key',key,'name','خدمة اختبار متراجعة','specialty_id',(select id from public.specialties where active limit 1),'price_minor',12345,'category','general','default_deposit_minor',0,'active',true);
 first:=public.clinic_quick_service(payload);retry:=public.clinic_quick_service(payload);
 if first<>retry or first->>'id'<>key::text then raise exception 'retry failure'; end if;
 if (select count(*) from public.service_prices where service_id=key)<5 or exists(select 1 from public.service_prices where service_id=key and price_minor<>12345) then raise exception 'prices missing'; end if;
 if (select count(*) from public.service_prices where service_id<>key)<>previous_count or (select sum(price_minor) from public.service_prices where service_id<>key)<>previous_total then raise exception 'existing prices changed'; end if;
 begin perform public.clinic_quick_service(payload||'{"price_minor":12346}');raise exception 'changed retry accepted';exception when others then if sqlerrm not like '%IDEMPOTENCY_CONFLICT%' then raise;end if;end;
 begin update public.service_prices set price_minor=1 where service_id=key;raise exception 'price mutation accepted';exception when others then if sqlerrm not like '%PRICE_IMMUTABLE%' then raise;end if;end;
 begin perform public.clinic_quick_service(payload||jsonb_build_object('idempotency_key',gen_random_uuid(),'price_minor',-1));raise exception 'negative price accepted';exception when others then if sqlerrm not like '%INVALID_INPUT%' then raise;end if;end;
 update public.profiles set role='reception' where id=uid;
 begin perform public.clinic_quick_service(payload||jsonb_build_object('idempotency_key',gen_random_uuid()));raise exception 'reception accepted';exception when others then if sqlerrm not like '%ACCESS_DENIED%' then raise;end if;end;
 end $$;
 select true as passed;rollback;`);
 assert.equal(result[0].passed,true);
});
