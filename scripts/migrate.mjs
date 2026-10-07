import { readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { cli, query, ref, organization } from './supabase.mjs';

const project = cli(['projects', 'list']).projects.find(project => project.ref === ref);
if (project?.organization_slug !== organization || project.name !== 'family care') throw new Error('Unexpected migration target');
const literal = value => "'" + String(value).replaceAll("'", "''") + "'";
query(`begin;
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations(version text primary key, statements text[], name text);
create schema if not exists private;
create table if not exists private.migration_checksums(version text primary key, checksum text not null, applied_at timestamptz not null default now());
alter table private.migration_checksums enable row level security;
revoke all on private.migration_checksums from public, anon, authenticated;
commit;`);
const applied = new Map(query('select version, checksum from private.migration_checksums;').map(row => [row.version, row.checksum]));
for (const filename of readdirSync('supabase/migrations').filter(name => /^\d+_.+\.sql$/.test(name)).sort()) {
  const [version, ...nameParts] = filename.replace(/\.sql$/, '').split('_');
  const source = readFileSync(`supabase/migrations/${filename}`, 'utf8');
  if (!source.trim()) throw new Error(`Empty migration ${filename}`);
  const checksum = createHash('sha256').update(source).digest('hex');
  if (applied.has(version)) {
    if (applied.get(version) !== checksum) throw new Error(`Applied migration changed: ${filename}`);
    continue;
  }
  query(`begin; select pg_advisory_xact_lock(7072026);
${source}
insert into private.migration_checksums(version,checksum) values(${literal(version)},${literal(checksum)});
insert into supabase_migrations.schema_migrations(version,name,statements) values(${literal(version)},${literal(nameParts.join('_'))},array[${literal(source)}]);
commit;`);
  console.log(`Applied ${filename}`);
}
console.log('Development database migrations verified.');
