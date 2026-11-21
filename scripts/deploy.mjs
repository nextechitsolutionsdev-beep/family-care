import {cli,ref,organization,projectName} from './supabase.mjs';

const project=cli(['projects','list']).projects.find(item=>item.ref===ref);
if(project?.organization_slug!==organization||project.name!==projectName)throw new Error('Unexpected deploy target');
cli(['functions','deploy','manage-users','--project-ref',ref,'--no-verify-jwt','--use-api'],false);
cli(['functions','deploy','experience-feedback','--project-ref',ref,'--no-verify-jwt','--use-api'],false);
console.log(`manage-users and experience-feedback deployed to ${projectName}.`);
