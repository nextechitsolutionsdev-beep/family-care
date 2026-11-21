import { readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { cli, query, ref, organization, projectName } from './supabase.mjs';
import { appliedHistory, historySql, verifyApplied } from './migration-integrity.mjs';

const project = cli(['projects', 'list']).projects.find(project => project.ref === ref);
if (project?.organization_slug !== organization || project.name!==projectName) throw new Error('Unexpected migration target');
const literal = value => "'" + String(value).replaceAll("'", "''") + "'";
query(`begin;
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations(version text primary key, statements text[], name text);
create schema if not exists private;
create table if not exists private.migration_checksums(version text primary key, checksum text not null, applied_at timestamptz not null default now());
alter table private.migration_checksums enable row level security;
revoke all on private.migration_checksums from public, anon, authenticated;
commit;`);
const applied = appliedHistory(query(`${historySql};`));
for (const filename of readdirSync('supabase/migrations').filter(name => /^\d+_.+\.sql$/.test(name)).sort()) {
  const [version, ...nameParts] = filename.replace(/\.sql$/, '').split('_');
  const source = readFileSync(`supabase/migrations/${filename}`, 'utf8');
  if (!source.trim()) throw new Error(`Empty migration ${filename}`);
  const checksum = createHash('sha256').update(source).digest('hex');
  if (applied.has(version)) {
    // Same SQL with different line endings is accepted only against the recorded source (see migration-integrity.mjs).
    verifyApplied({ file: filename, source, ...applied.get(version) });
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
