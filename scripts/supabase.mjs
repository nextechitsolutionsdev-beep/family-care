import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import dotenv from 'dotenv';

export const ref = 'xkbyxefvzlcnyefkxwsx';
export const organization = 'pmltjypbnnmrtggkwqwx';
export const env = { ...process.env, ...dotenv.parse(existsSync('.env') ? readFileSync('.env') : '') };
const require = createRequire(import.meta.url);

export function cli(args, json = true) {
  const root = dirname(require.resolve('supabase/package.json'));
  const executable = join(root, 'dist', 'supabase.js');
  const run = spawnSync(process.execPath, [executable, ...args, ...(json ? ['--output-format', 'json'] : [])], { env, encoding: 'utf8', windowsHide: true, timeout: 180000, maxBuffer: 64 * 1024 * 1024 });
  if (run.status !== 0) {
    let message = String(run.stdout || run.stderr || run.error?.message || 'Supabase command failed');
    for (const [key, value] of Object.entries(env)) if (/KEY|TOKEN|PASSWORD/.test(key) && value) message = message.replaceAll(value, '[redacted]');
    throw new Error(message.slice(0, 1600));
  }
  return json ? JSON.parse(run.stdout) : run.stdout;
}

export function setEnv(changes) {
  let content = existsSync('.env') ? readFileSync('.env', 'utf8') : '';
  for (const [key, value] of Object.entries(changes)) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(key)) throw new Error('Invalid env key');
    const line = `${key}=${JSON.stringify(String(value))}`;
    const pattern = new RegExp(`^${key}=.*$`, 'm');
    content = pattern.test(content) ? content.replace(pattern, () => line) : `${content.trimEnd()}\n${line}\n`;
    env[key] = String(value);
  }
  writeFileSync('.env', content, { mode: 0o600 });
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
