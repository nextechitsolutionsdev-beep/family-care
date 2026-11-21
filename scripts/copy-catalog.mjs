// One-time copy of catalog and settings rows from the legacy project into FC_TARGET.
// Reads the legacy project through its server key in .env; writes in one transaction; skips rows that already exist.
import { readFileSync } from 'node:fs';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { query, target, projectName } from './supabase.mjs';

if (target === 'legacy') throw new Error('Set FC_TARGET=staging or FC_TARGET=production');
const legacy = dotenv.parse(readFileSync('.env'));
const source = createClient(legacy.SUPABASE_URL, legacy.SUPABASE_SERVER_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
// Order follows foreign keys. Profile references are cleared because accounts are recreated per project.
const tables = [
  ['client_types', 'code'], ['specialties', 'id'], ['specialty_sequences', 'specialty_id'], ['price_lists', 'id'],
  ['services', 'id'], ['bundle_components', null], ['price_list_versions', 'id'], ['service_prices', null],
  ['message_templates', null], ['clinic_settings', 'id'],
];
const clearProfiles = { price_list_versions: ['created_by'] };
const literal = value => "'" + String(value).replaceAll("'", "''") + "'";
const generated = new Set(query(`select table_name||'.'||column_name c from information_schema.columns where table_schema='public' and (is_generated='ALWAYS' or identity_generation='ALWAYS');`).map(row => row.c));
const statements = [];
const counts = {};
for (const [table, key] of tables) {
  const { data, error } = await source.from(table).select('*');
  if (error) throw new Error(`Read ${table} failed: ${error.code || error.message}`);
  let rows = data.filter(row => !row.demo_batch_id);
  if (table === 'price_list_versions') rows = rows.map(row => ({ ...row, published_at: null }));
  for (const column of clearProfiles[table] || []) rows = rows.map(row => ({ ...row, [column]: null }));
  counts[table] = rows.length;
  if (!rows.length) continue;
  const columns = Object.keys(rows[0]).filter(column => !generated.has(`${table}.${column}`));
  const list = columns.map(column => `"${column}"`).join(',');
  statements.push(`insert into public.${table}(${list}) select ${list} from json_populate_recordset(null::public.${table}, ${literal(JSON.stringify(rows))}::json) on conflict ${key ? `(${key}) ` : ''}do nothing;`);
}
// Versions are published only after their prices are in place, matching the seed flow.
const { data: versions, error } = await source.from('price_list_versions').select('id,published_at').not('published_at', 'is', null);
if (error) throw new Error(`Read versions failed: ${error.code}`);
for (const version of versions) statements.push(`update public.price_list_versions set published_at=${literal(version.published_at)} where id=${literal(version.id)} and published_at is null;`);
query(`begin;\n${statements.join('\n')}\ncommit;`);
console.log(`Copied into ${projectName}: ${JSON.stringify(counts)}`);
