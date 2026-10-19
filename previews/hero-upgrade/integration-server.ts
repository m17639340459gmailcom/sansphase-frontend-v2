// The original application continues to own every business request. This
// middleware replaces only the document/assets on an isolated loopback server.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { resolve, sep, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { finishResponse } from './server-response.ts';

type Options = { origin: string; generatedRoot?: string; dataSource?: 'existing-local' };
const pageNames = new Set(['blog','work','learning','software','resources','community','contact','support','account','verify','reset']);
function isPage(path: string) {
  if (path === '/' || path === '/index.html') return true;
  const parts=path.replace(/\/$/,'').split('/').slice(1);
  if (!pageNames.has(parts[0]) || parts.length > 2) return false;
  if (parts.length === 1) return true;
  return ['blog','work','learning','software','resources','verify','reset'].includes(parts[0])
    && parts[1].length > 0 && parts[1].length <= 1000 && !/[\\\s\u0000-\u001f<>]/.test(parts[1]);
}
export function createIntegrationMiddleware({origin,generatedRoot=resolve(dirname(fileURLToPath(import.meta.url)),'../../outputs/hero-upgrade'),dataSource}:Options) {
  const configured=new URL(origin);
  if(configured.protocol!=='http:' || configured.hostname!=='127.0.0.1' || configured.username || configured.password || configured.pathname!=='/' || configured.search || configured.hash) throw new Error('Integration must use an explicit loopback origin');
  const root=resolve(generatedRoot);
  return async (req:IncomingMessage,res:ServerResponse,next:()=>void|Promise<void>) => {
    if(req.headers.host!==configured.host || !['127.0.0.1','::ffff:127.0.0.1','::1'].includes(req.socket.remoteAddress ?? '')) {
      await finishResponse(res,403,'text/plain; charset=utf-8','Local integration only.');return;
    }
    let path:string;
    try { path=decodeURIComponent(new URL(req.url ?? '/',origin).pathname); }
    catch { await finishResponse(res,400,'text/plain; charset=utf-8','Invalid URL.');return; }
    if (path==='/v1' || path==='/v1/' || path==='/v2' || path==='/v2/') {
      if(req.method!=='GET' && req.method!=='HEAD') { await finishResponse(res,405,'text/plain; charset=utf-8','Use the original application API.');return; }
      res.writeHead(302,{Location:(path.startsWith('/v1')?'/original':'/')+new URL(req.url ?? '/',origin).search,'Cache-Control':'no-store'});
      res.end();return;
    }
    if(path==='/original') { req.url='/'+new URL(req.url ?? '/',origin).search;await next();return; }
    const page=isPage(path);
    const staticFile=path==='/style.css'?'style.css':path==='/third-party-notices.txt'?'third-party-notices.txt'
      : /^\/build\/[A-Za-z0-9_][A-Za-z0-9_.-]*\.(?:js|css|woff2?|ttf)$/.test(path)?path.slice(1):null;
    if(!page && !staticFile) {
      if(path.startsWith('/build/'))await finishResponse(res,404,'text/plain; charset=utf-8','Not found.');
      else await next();
      return;
    }
    if(req.method!=='GET' && req.method!=='HEAD') { await finishResponse(res,405,'text/plain; charset=utf-8','Use the original application API.');return; }
    try {
      const file=await realpath(resolve(root,page?'index.html':staticFile!));
      const actualRoot=await realpath(root);
      if(!file.startsWith(actualRoot+sep)) {await finishResponse(res,404,'text/plain; charset=utf-8','Not found.');return;}
      const bytes=await readFile(file);
      if(page) {
        const marker=JSON.stringify({mode:'local',origin:configured.origin,...(dataSource==='existing-local'?{dataSource,frontendVersion:2,originalVersion:1}:{})}).replaceAll('<','\\u003c');
        const html=bytes.toString('utf8').replace('</head>',`<script type="application/json" id="site-integration">${marker}</script></head>`);
        await finishResponse(res,200,'text/html; charset=utf-8',html,req.method==='HEAD');return;
      }
      const types:Record<string,string>={'.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.txt':'text/plain; charset=utf-8','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf'};
      await finishResponse(res,200,types[extname(file)] ?? 'application/octet-stream',bytes,req.method==='HEAD',/-[A-Z0-9]{8}\./.test(file)?'immutable':'revalidate');
    }catch(error:unknown) {
      if(error && typeof error==='object' && 'code' in error && error.code==='ENOENT')await finishResponse(res,404,'text/plain; charset=utf-8','Not found.');
      else await finishResponse(res,503,'text/plain; charset=utf-8','Frontend build unavailable.');
    }
  };
}
