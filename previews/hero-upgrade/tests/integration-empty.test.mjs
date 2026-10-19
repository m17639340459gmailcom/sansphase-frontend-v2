import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';

const sourceRoot=fileURLToPath(new URL('../',import.meta.url));
let bundled;
async function fixture(){
 bundled??=build({
  stdin:{contents:'export {renderJournalPage} from "./src/journal-page.ts"; export {renderIntegratedJournal} from "./src/integration-journal.ts"; export {mountShowcase} from "./src/showcase.ts"; export {posts,numbers} from "./src/content.ts"; export {setLang} from "./src/i18n.ts";',resolveDir:sourceRoot},
  bundle:true,write:false,platform:'browser',format:'iife',globalName:'EmptyContentBridge',target:'es2022',loader:{'.css':'empty'},
  plugins:[{name:'empty-content-animation-fixture',setup(builder){
   builder.onResolve({filter:/^gsap(?:\/SplitText)?$/},args=>({path:args.path,namespace:'empty-content-animation'}));
   builder.onLoad({filter:/.*/,namespace:'empty-content-animation'},args=>({contents:args.path.endsWith('SplitText')
    ?'export const SplitText={create(){throw new Error("Reduced-motion rendering must not split text.")}};'
    :'export default {registerPlugin(){},killTweensOf(){},set(){}};'}));
  }}],
 }).then(output=>output.outputFiles[0].text);
 const dom=new JSDOM('<main id="journal"></main><section id="showcase"></section>',{url:'http://localhost/blog',runScripts:'outside-only',pretendToBeVisual:true});
 dom.window.matchMedia=query=>Object.assign(new dom.window.EventTarget(),{matches:query.includes('reduced-motion'),media:query});
 dom.window.IntersectionObserver=class{observe(){}disconnect(){}};
 vm.runInContext(await bundled,dom.getInternalVMContext());
 const api=vm.runInContext('EmptyContentBridge',dom.getInternalVMContext());api.setLang('zh');
 const post={...api.posts[0],slug:'local-published-note',title:{zh:'本地真实文章',en:'Local published note'},summary:{zh:'服务器返回的文章摘要。',en:'A server-provided article summary.'}};
 return{dom,api,post,journal:dom.window.document.getElementById('journal'),showcase:dom.window.document.getElementById('showcase'),close(){dom.window.close();}};
}

test('journal first screen renders no invented article for zero posts and recovers its latest feature for one',async()=>{
 const f=await fixture();try{
  f.api.posts.splice(0);f.api.numbers.posts=0;
  let pathCalls=0;
  assert.doesNotThrow(()=>{f.journal.innerHTML=f.api.renderJournalPage(()=>{pathCalls++;throw new Error('An empty journal has no detail path.');},'<p data-catalog-fixture>目录</p>');});
  assert.equal(pathCalls,0);assert.equal(f.journal.querySelector('[data-journal-feature]'),null);
  assert.equal(f.journal.querySelectorAll('a[data-post]').length,0);assert.ok(f.journal.querySelector('[data-catalog-fixture]'));
  assert.match(f.journal.querySelector('.journal-feature').textContent,/文章发布后/);
  assert.doesNotThrow(()=>{f.journal.innerHTML=f.api.renderIntegratedJournal();});
  assert.ok(f.journal.querySelector('[data-integrated-journal]'));
  f.api.posts.push(f.post);f.api.numbers.posts=1;
  f.journal.innerHTML=f.api.renderIntegratedJournal();
  const featured=f.journal.querySelector('[data-journal-feature]');
  assert.ok(featured);assert.equal(featured.getAttribute('href'),'/blog/local-published-note');assert.equal(featured.dataset.post,'0');
  assert.equal(featured.querySelector('h2').textContent,'本地真实文章');assert.equal(featured.querySelector('[data-journal-count]').textContent,'01');
  assert.equal(f.journal.querySelectorAll('[data-journal-milestone]').length,1);
 }finally{f.close();}
});

test('showcase starts empty, survives one-to-zero refresh and restores a usable single article',async()=>{
 const f=await fixture();let bridge;const reads=[];try{
  f.api.posts.splice(0);
  assert.doesNotThrow(()=>{bridge=f.api.mountShowcase(f.showcase,{reduced:true,readPost:index=>reads.push(index)});});
  assert.equal(f.showcase.querySelector('.showcase-count').textContent,'00 / 00');
  assert.equal(f.showcase.querySelector('.showcase-read').hidden,true);assert.equal(f.showcase.querySelectorAll('a[data-post]').length,0);
  f.api.posts.push(f.post);assert.doesNotThrow(()=>bridge.refresh());
  let read=f.showcase.querySelector('.showcase-read');
  assert.equal(read.hidden,false);assert.equal(read.getAttribute('href'),'/blog/local-published-note');assert.equal(f.showcase.querySelector('.showcase-count').textContent,'01 / 01');
  assert.equal(f.showcase.querySelectorAll('.showcase-card').length,1);
  read.click();assert.deepEqual(reads,[0]);
  f.api.posts.splice(0);assert.doesNotThrow(()=>bridge.refresh());
  assert.equal(f.showcase.querySelector('.showcase-count').textContent,'00 / 00');assert.equal(f.showcase.querySelectorAll('a[data-post]').length,0);
  for(const name of ['prev','next'])assert.doesNotThrow(()=>f.showcase.querySelector(`[data-action="${name}"]`).click());
  assert.equal(f.showcase.dataset.active,'0');assert.deepEqual(reads,[0]);
  f.api.posts.push(f.post);assert.doesNotThrow(()=>bridge.refresh());
  read=f.showcase.querySelector('.showcase-read');assert.equal(read.hidden,false);assert.equal(read.getAttribute('href'),'/blog/local-published-note');
  assert.equal(f.showcase.querySelector('.showcase-title').textContent,'本地真实文章');read.click();assert.deepEqual(reads,[0,0]);
 }finally{bridge?.dispose();f.close();}
});
