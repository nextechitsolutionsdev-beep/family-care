import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import dotenv from 'dotenv';

// FC_TARGET picks the Supabase project; each target keeps its secrets in its own gitignored env file.
const targets = {
  legacy: { ref: 'xkbyxefvzlcnyefkxwsx', organization: 'pmltjypbnnmrtggkwqwx', name: 'family care', envFile: '.env' },
  staging: { ref: 'mzwwgiknquhlgbfrmxon', organization: 'kzaqokummzjzcunkemcx', name: 'family-care-stagging', envFile: '.env.staging' },
  production: { ref: 'omuayitryemedynhynjj', organization: 'kzaqokummzjzcunkemcx', name: 'family-care-production', envFile: '.env.production' },
};
export const target = process.env.FC_TARGET || 'legacy';
if (!targets[target]) throw new Error(`Unknown FC_TARGET ${target}`);
export const { ref, organization, name: projectName, envFile } = targets[target];
const readEnv = file => existsSync(file) ? dotenv.parse(readFileSync(file)) : {};
export const env = { ...process.env, ...readEnv(envFile) };
const require = createRequire(import.meta.url);

export function cli(args, json = true) {
  const root = dirname(require.resolve('supabase/package.json'));
  const executable = join(root, 'dist', 'supabase.js');
  const run = spawnSync(process.execPath, [executable, ...args, ...(json ? ['--output-format', 'json'] : [])], { env, encoding: 'utf8', windowsHide: true, timeout: 180000 });
  if (run.status !== 0) {
    let message = String(run.stdout || run.stderr || run.error?.message || 'Supabase command failed');
    for (const [key, value] of Object.entries(env)) if (/KEY|TOKEN|PASSWORD/.test(key) && value) message = message.replaceAll(value, '[redacted]');
    throw new Error(message.slice(0, 1600));
  }
  return json ? JSON.parse(run.stdout) : run.stdout;
}

export function setEnv(changes) {
  let content = existsSync(envFile) ? readFileSync(envFile, 'utf8') : '';
  for (const [key, value] of Object.entries(changes)) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(key)) throw new Error('Invalid env key');
    const line = `${key}=${JSON.stringify(String(value))}`;
    const pattern = new RegExp(`^${key}=.*$`, 'm');
    content = pattern.test(content) ? content.replace(pattern, () => line) : `${content.trimEnd()}\n${line}\n`;
    env[key] = String(value);
  }
  writeFileSync(envFile, content, { mode: 0o600 });
}

export function query(sql) {
  mkdirSync('scratch',{recursive:true});
  const file=join('scratch',`query-${process.pid}-${randomUUID()}.sql`);
  writeFileSync(file,sql,{mode:0o600});
  try {
    const result = cli(['db', 'query', '--linked', '--project-ref', ref, '--file', file]);
    return result.rows || [];
  } finally {unlinkSync(file);}
}
