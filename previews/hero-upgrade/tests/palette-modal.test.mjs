import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const root = fileURLToPath(new URL('../', import.meta.url));
const bundle = await build({ stdin: { contents: `export {Palette} from './src/palette';`, resolveDir: root }, bundle:true, platform:'node', format:'esm', write:false,
  plugins:[{name:'palette-animation-noop',setup(b){b.onResolve({filter:/^gsap$/},()=>({path:'gsap',namespace:'stub'}));b.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:'export default {fromTo(){}}'}));}}] });
const {Palette}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`);

test('a nested image viewer keeps command shortcuts and direct search from taking focus',()=>{
  const dom=new JSDOM('<html><body><main id="main"></main><article id="reader"><button id="image-opener">view image</button></article><div id="palette" aria-hidden="true"><input id="palette-input"><ul id="palette-list"></ul></div></body></html>',{pretendToBeVisual:true});
  const keys=['window','document','HTMLElement','addEventListener','requestAnimationFrame'];
  const previous=Object.fromEntries(keys.map(key=>[key,globalThis[key]]));
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,addEventListener:dom.window.addEventListener.bind(dom.window),requestAnimationFrame:callback=>{callback();return 1;}});
  try{
    let viewerOpen=true;
    const palette=new Palette(()=>[],true,()=>!viewerOpen);
    const opener=dom.window.document.getElementById('image-opener'); opener.focus();
    const key=new dom.window.KeyboardEvent('keydown',{key:'k',ctrlKey:true,bubbles:true,cancelable:true});
    opener.dispatchEvent(key);
    assert.equal(palette.open,false);
    assert.equal(dom.window.document.activeElement,opener);
    assert.equal(key.defaultPrevented,true,'reserved shortcut must not leak to the browser');
    palette.show(); assert.equal(palette.open,false,'direct search entry is gated too');
    viewerOpen=false; palette.show(); assert.equal(palette.open,true);
    assert.equal(dom.window.document.activeElement.id,'palette-input');
    palette.close(); assert.equal(dom.window.document.activeElement,opener);
  }finally{dom.window.close();Object.assign(globalThis,previous);}
});
