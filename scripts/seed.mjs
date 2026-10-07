import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { env, query, setEnv } from './supabase.mjs';

const catalog = JSON.parse(readFileSync('supabase/seed/family-care-catalog.json', 'utf8'));
const literal = value => "'" + String(value).replaceAll("'", "''") + "'";
query(`begin;
insert into public.specialties(name,client_prefix,sort_order) values(${literal(catalog.specialty)},${literal(catalog.client_code_prefix)},0) on conflict(client_prefix) do nothing;
insert into public.clinic_settings(id) values(true) on conflict do nothing;
insert into public.message_templates(kind,body) values
('birthday','كل سنة وأنت بخير يا {client_name}. هديتك من فاميلي كير: {offer}. كود العرض {code}.'),
('campaign','أهلاً {client_name}، عرض فاميلي كير: {offer}. استخدم الكود {code}.'),
('follow_up','أهلاً {client_name}، بنفكرك بمتابعتك يوم {date}: {purpose}.') on conflict do nothing;
commit;`);
const specialty = query("select id from public.specialties where client_prefix='DEN';")[0].id;
const statements = [];
for (const type of catalog.price_lists) {
  statements.push(`insert into public.client_types(code,name) values(${literal(type.code)},${literal(type.name)}) on conflict do nothing;`);
  statements.push(`insert into public.price_lists(client_type_code,name,review_required) values(${literal(type.code)},${literal(type.name)},${type.review_required}) on conflict(client_type_code) do nothing;`);
}
for (const service of catalog.services) {
  statements.push(`insert into public.services(seed_code,specialty_id,name,category,pricing_kind,requires_deposit,default_deposit_minor,review_note)
    values(${literal(service.code)},${literal(specialty)},${literal(service.name)},${literal(service.category)},${literal(service.pricing_kind || 'service')},${!!service.requires_deposit},${service.default_deposit_minor || 50000},${service.owner_review ? literal(service.owner_review) : 'null'}) on conflict(seed_code) do nothing;`);
}
query(`begin;${statements.join('\n')}commit;`);
const services = new Map(query('select seed_code,id from public.services;').map(row => [row.seed_code,row.id]));
for (const service of catalog.services) {
  const components = [...(service.components || []),...(service.gift_service_codes || []).map(service_code => ({ service_code,gift:true,weight:1 }))];
  for (const component of components) {
    query(`insert into public.bundle_components values(${literal(services.get(service.code))},${literal(services.get(component.service_code))},${component.gift},${component.weight}) on conflict do nothing;`);
  }
}
for (const list of query('select id from public.price_lists;')) {
  if (query(`select id from public.price_list_versions where list_id=${literal(list.id)} and effective_from=${literal(catalog.effective_from)};`).length) continue;
  query(`begin;
    insert into public.price_list_versions(list_id,effective_from) values(${literal(list.id)},${literal(catalog.effective_from)});
    ${catalog.services.map(service => `insert into public.service_prices select id,${literal(services.get(service.code))},${service.price_minor} from public.price_list_versions where list_id=${literal(list.id)} and effective_from=${literal(catalog.effective_from)};`).join('\n')}
    update public.price_list_versions set published_at=now() where list_id=${literal(list.id)} and effective_from=${literal(catalog.effective_from)};
    commit;`);
}
const auth = createClient(env.SUPABASE_URL, env.SUPABASE_SERVER_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const email = env.OWNER_EMAIL || 'owner@familycare.example.com';
const password = env.OWNER_PASSWORD || `FC!${randomBytes(24).toString('base64url')}`;
setEnv({OWNER_EMAIL:email,OWNER_PASSWORD:password});
const owners = query("select id from public.profiles where role='owner' and active;");
if (!owners.length) {
  const {data,error} = await auth.auth.admin.createUser({email,password,email_confirm:true});
  if (error) throw new Error(`Owner bootstrap failed: ${error.code || error.status}`);
  const {error:profileError} = await auth.from('profiles').insert({id:data.user.id,role:'owner',display_name:'مالك فاميلي كير'});
  if (profileError) throw new Error(`Owner profile failed: ${profileError.code}`);
}
console.log('Seed verified: 43 services, five price lists, templates and owner. Owner credentials are in .env.');
