// Creates the owner account on FC_TARGET when none exists. Email comes from the target env file (or the legacy .env);
// a random password is generated and written only to the target env file.
import { readFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { env, query, setEnv, target, projectName, envFile } from './supabase.mjs';

if (target === 'legacy') throw new Error('Set FC_TARGET=staging or FC_TARGET=production');
const legacy = existsSync('.env') ? dotenv.parse(readFileSync('.env')) : {};
const email = env.OWNER_EMAIL || legacy.OWNER_EMAIL;
if (!email) throw new Error(`Set OWNER_EMAIL in ${envFile}`);
if (query("select id from public.profiles where role='owner' and active;").length) {
  console.log(`${projectName} already has an active owner; nothing changed.`);
} else {
  const password = env.OWNER_PASSWORD || `FC!${randomBytes(18).toString('base64url')}`;
  const auth = createClient(env.SUPABASE_URL, env.SUPABASE_SERVER_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await auth.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`Owner creation failed: ${error.code || error.status}`);
  const { error: profileError } = await auth.from('profiles').insert({ id: data.user.id, role: 'owner', display_name: 'مالك فاميلي كير' });
  if (profileError) throw new Error(`Owner profile failed: ${profileError.code}`);
  setEnv({ OWNER_EMAIL: email, OWNER_PASSWORD: password });
  console.log(`Owner created on ${projectName}; sign-in details are in ${envFile}.`);
}
