import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {env,query} from '../scripts/supabase.mjs';

test('doctor account and specialty save together; invalid data and failed profile leave no orphan doctor',async()=>{
 const admin=createClient(env.SUPABASE_URL,env.SUPABASE_SERVER_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const created=await admin.auth.admin.createUser({email:`qa-specialty-${randomUUID()}@example.com`,password:`Qa!${randomUUID()}`,email_confirm:true});
 assert.equal(created.error,null);const id=created.data.user.id;
 try{
  const result=query(`begin;do $$ declare uid uuid; specialty uuid; inactive uuid; result jsonb; before_count bigint;
  begin
   select id into strict uid from public.profiles where role='owner' and active limit 1;
   perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated')::text,true);
   select id into strict specialty from public.specialties where active limit 1;
   insert into public.specialties(name,client_prefix,active) values('تخصص حساب متراجع','QQACCT',false) returning id into inactive;
   select count(*) into before_count from public.doctors;
   begin perform public.clinic_create_doctor_account(jsonb_build_object('id','${id}','display_name','طبيب حساب متراجع','doctor',jsonb_build_object('specialty_id',inactive,'category','percentage','default_share_bps',3333)));raise exception 'inactive specialty accepted';exception when others then if sqlerrm not like '%SPECIALTY_INACTIVE%' then raise;end if;end;
   if (select count(*) from public.doctors)<>before_count then raise exception 'invalid specialty left doctor';end if;
   begin perform public.clinic_create_doctor_account(jsonb_build_object('id',gen_random_uuid(),'display_name','طبيب حساب متراجع','doctor',jsonb_build_object('specialty_id',specialty,'category','percentage','default_share_bps',3333)));raise exception 'missing Auth user accepted';exception when foreign_key_violation then null;end;
   if (select count(*) from public.doctors)<>before_count then raise exception 'profile failure left doctor';end if;
   result:=public.clinic_create_doctor_account(jsonb_build_object('id','${id}','display_name','طبيب حساب متراجع','doctor',jsonb_build_object('specialty_id',specialty,'category','percentage','default_share_bps',3333)));
   if not exists(select 1 from public.profiles p join public.doctors d on d.id=p.doctor_id where p.id='${id}' and p.role='doctor' and d.specialty_id=specialty and d.default_share_bps=3333 and d.active) then raise exception 'doctor not assigned correctly';end if;
   begin perform public.clinic_create_doctor_account(jsonb_build_object('id','${id}','display_name','طبيب حساب متراجع','doctor',jsonb_build_object('specialty_id',specialty,'category','percentage','default_share_bps',3333)));raise exception 'duplicate accepted';exception when others then if sqlerrm not like '%ACCOUNT_EXISTS%' then raise;end if;end;
   if (select count(*) from public.doctors)<>before_count+1 then raise exception 'duplicate left doctor';end if;
   update public.profiles set role='reception' where id=uid;
   begin perform public.clinic_create_doctor_account('{}');raise exception 'reception allowed';exception when others then if sqlerrm not like '%ACCESS_DENIED%' then raise;end if;end;
   if has_function_privilege('anon','public.clinic_create_doctor_account(jsonb)','EXECUTE') then raise exception 'anon allowed';end if;
  end $$;select true passed;rollback;`);
  assert.equal(result[0].passed,true);
 }finally{const deleted=await admin.auth.admin.deleteUser(id);assert.equal(deleted.error,null);}
});
