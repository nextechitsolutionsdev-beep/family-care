import { cli, env, setEnv, ref, organization, projectName, envFile, query } from './supabase.mjs';

const result = cli(['projects', 'list']);
const project = result.projects.find(item => item.ref === ref);
if (!project || project.organization_slug !== organization || project.name!==projectName) throw new Error('Project/organization verification failed');
const response = cli(['projects', 'api-keys', '--project-ref', ref, '--reveal']);
const keys = Array.isArray(response) ? response : response.keys || response.api_keys || [];
const publishable = keys.find(key => key.type === 'publishable') || keys.find(key => key.name === 'anon');
const server = keys.find(key => key.type === 'secret') || keys.find(key => key.name === 'service_role');
if (!publishable || !server) throw new Error('Required project API keys not available');
const keyValue = key => key.api_key || key.key || key.value;
const url=`https://${ref}.supabase.co`;
setEnv({ SUPABASE_PROJECT_REF: ref, SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: keyValue(publishable), SUPABASE_SERVER_KEY: keyValue(server), SUPABASE_DB_PASSWORD: env.SUPABASE_DB_PASSWORD, VITE_SUPABASE_URL:url, VITE_SUPABASE_ANON_KEY:keyValue(publishable) });
const tables = query("select schemaname, tablename from pg_tables where schemaname in ('public','private') order by 1,2;");
console.log(`Verified ${projectName}; ${tables.length} existing application tables; credentials stored in ${envFile}.`);
