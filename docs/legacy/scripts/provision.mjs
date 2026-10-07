import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const organization = 'pmltjypbnnmrtggkwqwx';
const name = 'family-care-dev';
const envPath = '.env';
const current = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
const values = Object.fromEntries(current.split(/\r?\n/).filter(line => /^[A-Z][A-Z0-9_]*=/.test(line)).map(line => {
  const separator = line.indexOf('=');
  return [line.slice(0, separator), line.slice(separator + 1).trim()];
}));
const environment = { ...process.env, ...values };

function cli(args) {
  if (args.some(value => !/^[A-Za-z0-9_.-]+$/.test(value))) throw new Error('Unsafe CLI argument');
  const windows = process.platform === 'win32';
  const command = windows ? (process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe') : 'npx';
  const parameters = windows
    ? ['/d', '/s', '/c', `npx --yes supabase@2.120.0 ${args.join(' ')} --output-format json`]
    : ['--yes', 'supabase@2.120.0', ...args, '--output-format', 'json'];
  const result = spawnSync(command, parameters, {
    encoding: 'utf8', env: environment, timeout: 180_000, windowsHide: true,
  });
  if (result.status !== 0) {
    const raw = String(result.stdout || result.stderr || result.error?.message || 'Supabase command failed');
    const redacted = Object.values(values).filter(value => value.length > 12).reduce((text, value) => text.replaceAll(value, '[redacted]'), raw);
    if (redacted.includes('maximum limits') && redacted.includes('2 project limit')) {
      throw new Error('FREE_PROJECT_LIMIT: Supabase rejected creation because the account already has two active free projects. Owner must choose an existing project to pause or authorize an upgrade. No existing project was changed.');
    }
    throw new Error(redacted.slice(0, 1800));
  }
  return JSON.parse(result.stdout);
}

function save(changes) {
  let content = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
  for (const [key, value] of Object.entries(changes)) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(key) || /[\r\n]/.test(value)) throw new Error('Invalid environment setting');
    const expression = new RegExp(`^${key}=.*$`, 'm');
    content = expression.test(content) ? content.replace(expression, `${key}=${value}`) : `${content.trimEnd()}\n${key}=${value}\n`;
    values[key] = value;
    environment[key] = value;
  }
  writeFileSync(envPath, content, { mode: 0o600 });
}

try {
  const listed = cli(['orgs', 'list']);
  const organizations = Array.isArray(listed) ? listed : listed.organizations || listed.orgs || [];
  const target = organizations.find(item => item.slug === organization || item.id === organization);
  if (!target || target.name !== 'peter') throw new Error('Target organization peter was not verified');
  console.log('Verified organization: peter');
  const listedProjects = cli(['projects', 'list']);
  const projects = Array.isArray(listedProjects) ? listedProjects : listedProjects.projects || [];
  let project = projects.find(item => item.name === name && (item.organization_slug === organization || item.organization_id === organization));
  if (!project) {
    const password = values.SUPABASE_DB_PASSWORD || randomBytes(30).toString('hex');
    save({ SUPABASE_DB_PASSWORD: password });
    const created = cli(['projects', 'create', name, '--org-id', organization, '--region', 'eu-central-1', '--db-password', password]);
    project = created.project || created;
  }
  const ref = project.ref || project.id;
  if (!/^[a-z]{20}$/.test(ref || '')) throw new Error('Invalid created project reference');
  save({ SUPABASE_PROJECT_REF: ref, SUPABASE_URL: `https://${ref}.supabase.co` });
  console.log(`Project ready for initialization: ${name} (${ref})`);
  console.log(`Dashboard: https://supabase.com/dashboard/project/${ref}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
