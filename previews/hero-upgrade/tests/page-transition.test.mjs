import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const sourceRoot = fileURLToPath(new URL('../', import.meta.url));
const bundled = await build({
  stdin: { contents: 'export {mountPageTransition} from "./src/page-transition.ts";', resolveDir: sourceRoot, loader: 'ts' },
  bundle: true, platform: 'node', format: 'esm', write: false,
  plugins: [{ name: 'controlled-transition-clock', setup(plugin) {
    plugin.onResolve({ filter: /^gsap$/ }, () => ({ path: 'gsap', namespace: 'controlled-clock' }));
    plugin.onResolve({ filter: /^gsap\/CustomEase$/ }, () => ({ path: 'custom-ease', namespace: 'controlled-ease' }));
    plugin.onLoad({ filter: /.*/, namespace: 'controlled-ease' }, () => ({ contents: 'export const CustomEase = { create: (name, data) => data };' }));
    plugin.onLoad({ filter: /.*/, namespace: 'controlled-clock' }, () => ({ contents: `
      function set(target, vars) {
        const probe = globalThis.__pageTransitionProbe;
        if (vars.clearProps) {
          probe.clears++;
          for (const name of vars.clearProps.split(',')) target.style.removeProperty(name.replace(/[A-Z]/g, letter => '-' + letter.toLowerCase()));
        }
        for (const name of ['opacity', 'clipPath', 'willChange']) if (name in vars) target.style[name] = String(vars[name]);
        if ('y' in vars || 'scale' in vars) target.style.transform = 'translateY(' + (vars.y ?? 0) + ') scale(' + (vars.scale ?? 1) + ')';
      }
      function tween(target, vars, from) {
        if (from) set(target, from);
        const value = { target, vars, from, killed: false, kill() { this.killed = true; vars.onInterrupt?.(); }, complete() { vars.onComplete?.(); }, interrupt() { vars.onInterrupt?.(); } };
        globalThis.__pageTransitionProbe.tweens.push(value);
        return value;
      }
      export default { registerPlugin() {}, set, to: (target,vars) => tween(target,vars), fromTo: (target,from,vars) => tween(target,vars,from) };
    ` }));
  } }],
});
const { mountPageTransition } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].contents).toString('base64')}`);

function fixture({ reduced = false } = {}) {
  const dom = new JSDOM('<!doctype html><main><p>Home</p></main>');
  const main = dom.window.document.querySelector('main');
  const probe = globalThis.__pageTransitionProbe = { tweens: [], clears: 0 };
  let preference = reduced;
  const transition = mountPageTransition(main, { reduced: () => preference });
  return {
    main, probe, transition,
    reduce(value) { preference = value; },
    close() { transition.dispose(); dom.window.close(); delete globalThis.__pageTransitionProbe; },
  };
}

function visible(main) {
  for (const property of ['transform', 'opacity', 'clipPath', 'willChange']) assert.equal(main.style[property], '', `${property} must not leave the page hidden or promoted`);
}

test('quick home → work → home cancels the obsolete update and resolves its promise promptly', async () => {
  const f = fixture();
  try {
    const updates = [];
    let obsoleteResult;
    const obsolete = f.transition.run(() => { updates.push('work'); f.main.textContent = 'Work'; }, true);
    obsolete.then(value => { obsoleteResult = value; });
    const oldExit = f.probe.tweens[0];
    const latest = f.transition.run(() => { updates.push('home'); f.main.textContent = 'Home'; }, true);
    await Promise.resolve();
    assert.equal(obsoleteResult, false, 'canceling a GSAP tween must also settle the navigation promise');
    assert.equal(oldExit.killed, true);
    oldExit.complete();
    assert.deepEqual(updates, [], 'a late callback cannot commit the previous destination');
    f.probe.tweens[1].complete();
    assert.deepEqual(updates, ['home']);
    f.probe.tweens[2].complete();
    assert.equal(await latest, true);
    assert.equal(await obsolete, false);
    assert.equal(f.main.textContent, 'Home');
    assert.equal(f.transition.pending, false);
    visible(f.main);
  } finally { f.close(); }
});

test('the upstream exit and clipped entrance surround one content update', async () => {
  const f = fixture();
  try {
    let updates = 0;
    const completion = f.transition.run(() => { updates++; }, true);
    assert.equal(f.transition.pending, true);
    const exit = f.probe.tweens[0];
    assert.equal(updates, 0);
    assert.equal(exit.vars.y, '-2.5rem');
    assert.equal(exit.vars.scale, .985);
    assert.equal(exit.vars.opacity, 0);
    assert.equal(exit.vars.duration, .26);
    assert.equal(exit.vars.ease, '0.5,0,0.75,0');
    exit.complete();
    assert.equal(updates, 1);
    assert.equal(f.transition.pending, true);
    const enter = f.probe.tweens[1];
    assert.equal(enter.from.y, '3.5rem');
    assert.equal(enter.from.clipPath, 'inset(100vh 0 0 0)', 'the source uses viewport height because the full document can be much taller');
    assert.equal(enter.vars.y, 0);
    assert.equal(enter.vars.clipPath, 'inset(0 0 0 0)');
    assert.equal(enter.vars.duration, .6);
    assert.equal(enter.vars.delay, .04);
    assert.equal(enter.vars.ease, '0.16,1,0.3,1');
    enter.complete();
    assert.equal(await completion, true);
    assert.equal(f.transition.pending, false);
    visible(f.main);
  } finally { f.close(); }
});

test('replacing an entrance ignores its late cleanup while the latest exit is active', async () => {
  const f = fixture();
  try {
    const first = f.transition.run(() => {}, true);
    f.probe.tweens[0].complete();
    const oldEnter = f.probe.tweens[1];
    const next = f.transition.run(() => {}, true);
    assert.equal(await first, false);
    const clears = f.probe.clears;
    oldEnter.complete();
    assert.equal(f.transition.pending, true);
    assert.equal(f.probe.clears, clears, 'an obsolete entrance cannot clear styles belonging to the latest transition');
    f.probe.tweens[2].complete();
    f.probe.tweens[3].complete();
    assert.equal(await next, true);
    visible(f.main);
  } finally { f.close(); }
});

test('initial navigation and reduced motion update immediately without creating animation', async () => {
  for (const reduced of [false, true]) {
    const f = fixture({ reduced });
    try {
      let updates = 0;
      const result = f.transition.run(() => { updates++; }, reduced);
      assert.equal(updates, 1);
      assert.equal(f.transition.pending, false);
      assert.equal(f.probe.tweens.length, 0);
      assert.equal(await result, true);
      visible(f.main);
    } finally { f.close(); }
  }
});

test('reduced motion enabled during exit skips the entrance and reveals the updated destination', async () => {
  const f = fixture();
  try {
    let updates = 0;
    const result = f.transition.run(() => { updates++; }, true);
    f.reduce(true);
    f.probe.tweens[0].complete();
    assert.equal(updates, 1);
    assert.equal(await result, true);
    assert.equal(f.probe.tweens.length, 1);
    visible(f.main);
  } finally { f.close(); }
});

test('settle cancels an unfinished navigation without committing its destination', async () => {
  const f = fixture();
  try {
    let updates = 0;
    const result = f.transition.run(() => { updates++; }, true);
    const exit = f.probe.tweens[0];
    f.transition.settle();
    assert.equal(await result, false);
    assert.equal(f.transition.pending, false);
    assert.equal(updates, 0);
    exit.complete();
    assert.equal(updates, 0);
    visible(f.main);
  } finally { f.close(); }
});

test('settle after the update keeps the destination visible and never repeats its update', async () => {
  const f = fixture();
  try {
    let updates = 0;
    const result = f.transition.run(() => { updates++; }, true);
    f.probe.tweens[0].complete();
    const enter = f.probe.tweens[1];
    f.transition.settle();
    assert.equal(await result, false);
    enter.complete();
    assert.equal(updates, 1);
    assert.equal(f.transition.pending, false);
    visible(f.main);
  } finally { f.close(); }
});

test('external interruption also settles the promise and restores visibility', async () => {
  const f = fixture();
  try {
    const result = f.transition.run(() => {}, true);
    f.probe.tweens[0].interrupt();
    assert.equal(await result, false);
    assert.equal(f.transition.pending, false);
    visible(f.main);
  } finally { f.close(); }
});

test('a throwing update rejects normally and restores a usable page', async () => {
  const f = fixture();
  try {
    const failure = new Error('render failed');
    const result = f.transition.run(() => { throw failure; }, true);
    const rejected = assert.rejects(result, failure);
    f.probe.tweens[0].complete();
    await rejected;
    assert.equal(f.transition.pending, false);
    visible(f.main);
    await assert.rejects(f.transition.run(() => { throw failure; }, false), failure);
    assert.equal(f.transition.pending, false);
    visible(f.main);
  } finally { f.close(); }
});

test('disposal is idempotent, resolves pending work, and prevents late updates or remounting', async () => {
  const f = fixture();
  try {
    let updates = 0;
    const result = f.transition.run(() => { updates++; }, true);
    const exit = f.probe.tweens[0];
    f.transition.dispose(); f.transition.dispose();
    assert.equal(await result, false);
    exit.complete();
    assert.equal(await f.transition.run(() => { updates++; }, false), false);
    assert.equal(updates, 0);
    assert.equal(f.transition.pending, false);
    visible(f.main);
  } finally { f.close(); }
});
