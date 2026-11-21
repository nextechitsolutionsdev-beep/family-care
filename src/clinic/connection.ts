// Public Supabase connection details. A Docker host writes /config.js when the container starts (from its
// environment), so one image serves staging and production; builds that set VITE_ variables keep working.
type RuntimeConfig={supabaseUrl?:string;supabaseKey?:string};
const runtime:RuntimeConfig=(globalThis as {__FC_CONFIG__?:RuntimeConfig}).__FC_CONFIG__??{};
export const supabaseUrl:string=runtime.supabaseUrl||import.meta.env.VITE_SUPABASE_URL;
export const supabaseKey:string=runtime.supabaseKey||import.meta.env.VITE_SUPABASE_ANON_KEY;
