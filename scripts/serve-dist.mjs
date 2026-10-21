// Serve the production build with the same response headers Cloudflare Pages applies from dist/_headers,
// so browser tests can prove the Content-Security-Policy does not break the app. Usage: node scripts/serve-dist.mjs [port]
import {createServer} from 'node:http';
import {readFileSync,existsSync,statSync} from 'node:fs';
import {extname,join,normalize} from 'node:path';

const port=Number(process.argv[2]??4173);
const root='dist';
const headers={};
for(const line of readFileSync(join(root,'_headers'),'utf8').split('\n').slice(1)){
 const match=/^\s+([^:]+):\s*(.+)$/.exec(line);if(match)headers[match[1]]=match[2];
}
if(!headers['Content-Security-Policy'])throw new Error('dist/_headers has no Content-Security-Policy');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.json':'application/json'};
createServer((request,response)=>{
 const path=normalize(decodeURIComponent(new URL(request.url,'http://local').pathname)).replace(/^([/\\])+/,'');
 let file=join(root,path);
 if(!file.startsWith(root)||!existsSync(file)||statSync(file).isDirectory())file=join(root,'index.html');
 response.writeHead(200,{...headers,'Content-Type':types[extname(file)]??'application/octet-stream'});
 response.end(readFileSync(file));
}).listen(port,'127.0.0.1',()=>console.log(`dist served with production headers on http://127.0.0.1:${port}`));
