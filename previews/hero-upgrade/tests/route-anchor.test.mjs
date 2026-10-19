import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

let loaded;
async function load() {
  loaded ||= build({
    stdin: { contents: 'export {mountRouteAnchor} from "./src/route-anchor.ts";', resolveDir: fileURLToPath(new URL('../', import.meta.url)), loader: 'ts' },
    bundle: true, platform: 'node', format: 'esm', write: false,
  }).then(result=>import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].contents).toString('base64')));
  return loaded;
}
function deferred() { let resolve;const promise=new Promise(done=>{resolve=done});return {promise,resolve}; }
async function fixture() {
  const {mountRouteAnchor}=await load();
  const dom=new JSDOM('<main><section id="view-page"><h2 id="track-knowledge">Knowledge</h2><h2 id="track-film">Film</h2></section></main><h2 id="outside">Outside</h2>');
  const root=dom.window.document.querySelector('main'),calls=[];
  const anchor=mountRouteAnchor(root,{scrollTo:target=>calls.push(target)});
  return {dom,root,calls,anchor,knowledge:root.querySelector('#track-knowledge'),film:root.querySelector('#track-film'),close(){anchor.dispose();dom.window.close()}};
}

test('route anchors wait for the completed entrance before resolving the current DOM target',async()=>{
  const f=await fixture();
  try {
    const ready=deferred(),finish=f.anchor.prepare('#track-knowledge');
    assert.deepEqual(f.calls,[]);
    const result=finish(ready.promise);await Promise.resolve();assert.deepEqual(f.calls,[]);
    ready.resolve(true);assert.equal(await result,true);assert.deepEqual(f.calls,[f.knowledge]);
    assert.equal(await finish(true),false,'one navigation cannot apply its anchor twice');
  }finally{f.close()}
});

test('a newer preparation wins immediately even if the obsolete route finishes first',async()=>{
  const f=await fixture();
  try {
    const ready=deferred(),obsolete=f.anchor.prepare('#track-knowledge')(ready.promise);
    const latest=f.anchor.prepare('#track-film');
    ready.resolve(true);assert.equal(await obsolete,false);assert.deepEqual(f.calls,[]);
    assert.equal(await latest(true),true);assert.deepEqual(f.calls,[f.film]);
  }finally{f.close()}
});

test('ordinary navigation and canceled transitions invalidate a pending fragment',async()=>{
  const f=await fixture();
  try {
    const ready=deferred(),obsolete=f.anchor.prepare('#track-knowledge')(ready.promise);
    const plain=f.anchor.prepare('');ready.resolve(true);
    assert.equal(await obsolete,false);assert.equal(await plain(true),false);
    assert.equal(await f.anchor.prepare('#track-film')(false),false);assert.deepEqual(f.calls,[]);
  }finally{f.close()}
});

test('initial and history fragments resolve decoded IDs literally and never run a selector',async()=>{
  const f=await fixture();
  try {
    const special=f.dom.window.document.createElement('h2');special.id='主题:["]';f.root.append(special);
    assert.equal(await f.anchor.prepare('#'+encodeURIComponent(special.id))(true),true);
    assert.deepEqual(f.calls,[special]);
    for(const hash of ['#%E0%A4%A','#','#missing','#outside','track-film'])assert.equal(await f.anchor.prepare(hash)(true),false);
    assert.equal(f.calls.length,1);
  }finally{f.close()}
});

test('resolve after rendering and refuse hidden or inert targets without moving keyboard focus',async()=>{
  const f=await fixture();
  try {
    const focus=f.dom.window.document.createElement('button');f.root.append(focus);focus.focus();
    for(const attr of ['hidden','inert','aria-hidden']) {
      f.root.setAttribute(attr,attr==='aria-hidden'?'true':'');
      assert.equal(await f.anchor.prepare('#track-film')(true),false);f.root.removeAttribute(attr);
    }
    const finish=f.anchor.prepare('#track-knowledge');
    const replacement=f.knowledge.cloneNode(true);f.knowledge.replaceWith(replacement);
    assert.equal(await finish(true),true);assert.deepEqual(f.calls,[replacement]);
    assert.equal(f.dom.window.document.activeElement,focus);
  }finally{f.close()}
});

test('disposal cancels waiting navigation and makes later callbacks harmless',async()=>{
  const f=await fixture();
  try {
    const ready=deferred(),pending=f.anchor.prepare('#track-knowledge')(ready.promise);
    f.anchor.dispose();f.anchor.dispose();ready.resolve(true);assert.equal(await pending,false);
    assert.equal(await f.anchor.prepare('#track-film')(true),false);assert.deepEqual(f.calls,[]);
  }finally{f.close()}
});
