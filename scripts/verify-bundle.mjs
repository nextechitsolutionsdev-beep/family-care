import {readFileSync,readdirSync} from 'node:fs';
import {env} from './supabase.mjs';

const bundle=readdirSync('dist/assets').filter(file=>file.endsWith('.js')).map(file=>readFileSync(`dist/assets/${file}`,'utf8')).join('');
for(const key of ['SUPABASE_SERVER_KEY','SUPABASE_ACCESS_TOKEN','SUPABASE_DB_PASSWORD','OWNER_PASSWORD']){
  const secret=env[key];
  if(secret&&secret.length>=8&&bundle.includes(secret))throw new Error(`Private setting leaked into browser bundle: ${key}`);
}
console.log('Browser bundle contains no configured server credentials.');
