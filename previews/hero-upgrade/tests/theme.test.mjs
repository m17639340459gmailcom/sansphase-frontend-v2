import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const bundled=await build({entryPoints:[fileURLToPath(new URL('../src/theme.ts',import.meta.url))],bundle:true,write:false,platform:'browser',format:'iife',globalName:'ThemeTest'});
const defer=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject}};
function fixture(start){
 const dom=new JSDOM('<!doctype html><html data-theme="light"><head><meta name="theme-color" content="#f5f6f8"></head><body><button id="theme" aria-pressed="false"></button></body></html>',{url:'http://localhost/',runScripts:'outside-only'});
 const timers=new Map(),animations=[];let timer=0;
 dom.window.setTimeout=(cb)=>{timers.set(++timer,cb);return timer};dom.window.clearTimeout=id=>timers.delete(id);
 dom.window.document.startViewTransition=start;
 dom.window.document.documentElement.animate=(...args)=>{animations.push(args)};
 vm.runInContext(bundled.outputFiles[0].text,dom.getInternalVMContext());
 const api=vm.runInContext('ThemeTest',dom.getInternalVMContext());api.setTheme('light');
 return{dom,api,timers,animations,flush(){for(const callback of [...timers.values()])callback()},close(){dom.window.close()}};
}

test('theme applies even when the native snapshot never calls its update callback',async()=>{
 let update,skipped=0;const ready=defer();const f=fixture(cb=>{update=cb;return{ready:ready.promise,skipTransition(){skipped++}}});
 try{
  f.api.setTheme('dark',{x:10,y:10});assert.equal(f.api.theme(),'light');await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.timers.size,1);f.flush();
  assert.equal(f.api.theme(),'dark');assert.equal(f.dom.window.document.documentElement.dataset.theme,'dark');
  assert.equal(f.dom.window.document.getElementById('theme').getAttribute('aria-pressed'),'true');
  assert.equal(f.dom.window.localStorage.getItem('sansphase-hero-theme'),'dark');assert.equal(skipped,1);
  update();assert.equal(f.api.theme(),'dark');
 }finally{f.close()}
});

test('native transition readiness failure applies the theme without an unhandled rejection',async()=>{
 const ready=defer();const f=fixture(()=>({ready:ready.promise,skipTransition(){}}));
 try{
  f.api.setTheme('dark',{x:10,y:10});await new Promise(resolve=>setImmediate(resolve));ready.reject(new Error('snapshot unavailable'));await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.api.theme(),'dark');assert.equal(f.timers.size,0);assert.equal(f.animations.length,0);
 }finally{f.close()}
});

test('a delayed update from an older transition cannot reverse a newer theme choice',async()=>{
 const updates=[],ready=defer();const f=fixture(cb=>{updates.push(cb);return{ready:ready.promise,skipTransition(){}}});
 try{
  f.api.setTheme('dark',{x:10,y:10});await new Promise(resolve=>setImmediate(resolve));f.api.setTheme('light');updates[0]();f.flush();
  assert.equal(f.api.theme(),'light');assert.equal(f.dom.window.document.getElementById('theme').getAttribute('aria-pressed'),'false');
 }finally{f.close()}
});

test('normal native transitions keep the circular reveal and synchronous API failures degrade safely',async()=>{
 const ready=defer();const f=fixture(cb=>{cb();return{ready:ready.promise,skipTransition(){}}});
 try{
  f.api.setTheme('dark',{x:10,y:10});await new Promise(resolve=>setImmediate(resolve));assert.equal(f.api.theme(),'dark');ready.resolve();await Promise.resolve();
  assert.equal(f.animations.length,1);assert.equal(f.timers.size,0);
  f.dom.window.document.startViewTransition=()=>{throw new Error('capture unavailable')};
  f.api.setTheme('light',{x:20,y:20});await new Promise(resolve=>setImmediate(resolve));assert.equal(f.api.theme(),'light');
 }finally{f.close()}
});
