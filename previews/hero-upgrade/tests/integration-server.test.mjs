import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer, request } from 'node:http';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const output = resolve('..', '..', 'outputs', 'hero-upgrade', 'tests', 'integration-server.mjs');
await build({entryPoints:[resolve('integration-server.ts')],outfile:output,bundle:true,platform:'node',format:'esm',target:'node24'});
const { createIntegrationMiddleware } = await import(pathToFileURL(output).href);

test('local integration serves the new shell while retaining the real API, original UI and admin', async t => {
  const root=await mkdtemp(join(tmpdir(),'sansphase-ui-test-'));
  await mkdir(join(root,'build'));
  await writeFile(join(root,'index.html'),'<html><head></head><body>new frontend</body></html>');
  await writeFile(join(root,'style.css'),'body {color:blue}');
  await writeFile(join(root,'build','main-ABCDEFGH.js'),'export {};');
  await writeFile(join(root,'build','photoswipe.esm-ABCDEFGH.js'),'export const viewer = true;');
  let middleware;
  const server=createServer((req,res)=>middleware(req,res,async()=>{res.setHeader('Content-Type','text/plain');res.end(`original:${req.url}:${req.method}`);}));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const origin=`http://127.0.0.1:${server.address().port}`;
  middleware=createIntegrationMiddleware({origin,generatedRoot:root});
  for(const path of ['/','/blog/local-note','/learning/item-1','/resources/book-1','/account','/reset/local-token']) {
    const response=await fetch(origin+path);
    assert.equal(response.status,200,path);
    assert.match(await response.text(),/site-integration.*"mode":"local"/);
    assert.match(response.headers.get('cache-control'),/no-store/);
  }
  for(const path of ['/api/content','/api/reader/login','/api/media/a','/admin-console/']) {
    const response=await fetch(origin+path,{method:path.endsWith('/login')?'POST':'GET'});
    assert.match(await response.text(),new RegExp(`^original:${path}:`));
  }
  assert.equal(await (await fetch(origin+'/original')).text(),'original:/:GET');
  const versionOne=await fetch(origin+'/v1',{redirect:'manual'});
  assert.equal(versionOne.status,302);
  assert.equal(versionOne.headers.get('location'),'/original');
  const versionTwo=await fetch(origin+'/v2',{redirect:'manual'});
  assert.equal(versionTwo.status,302);
  assert.equal(versionTwo.headers.get('location'),'/');
  assert.equal(await (await fetch(origin+'/build/main-ABCDEFGH.js')).text(),'export {};');
  assert.equal(await (await fetch(origin+'/build/photoswipe.esm-ABCDEFGH.js')).text(),'export const viewer = true;');
  const head=await fetch(origin+'/resources',{method:'HEAD'});
  assert.equal(head.status,200);assert.equal(await head.text(),'');
  assert.equal((await fetch(origin+'/resources',{method:'POST'})).status,405);
  assert.equal((await fetch(origin+'/build/private.map')).status,404);
  assert.equal((await fetch(origin+'/build/a%2Fprivate.js')).status,404);
  const foreignHost=await new Promise((resolve,reject)=>{
    request(origin+'/account',{headers:{Host:'evil.test'}},response=>{response.resume();resolve(response.statusCode);}).on('error',reject).end();
  });
  assert.equal(foreignHost,403);
});

test('existing local data is identified separately from a disposable fixture environment', async t => {
  const root=await mkdtemp(join(tmpdir(),'sansphase-ui-data-'));
  await writeFile(join(root,'index.html'),'<html><head></head><body>version 2</body></html>');
  let middleware;
  const server=createServer((req,res)=>middleware(req,res,()=>res.end('version 1')));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const origin=`http://127.0.0.1:${server.address().port}`;
  middleware=createIntegrationMiddleware({origin,generatedRoot:root,dataSource:'existing-local'});
  const html=await (await fetch(origin+'/')).text();
  const marker=JSON.parse(html.match(/id="site-integration">([^<]+)</)[1]);
  assert.deepEqual(marker,{mode:'local',origin,dataSource:'existing-local',frontendVersion:2,originalVersion:1});
  assert.equal((await fetch(origin+'/v1',{method:'POST'})).status,405);
});
