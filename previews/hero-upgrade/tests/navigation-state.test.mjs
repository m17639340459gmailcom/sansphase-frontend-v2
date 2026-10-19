import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';

const bundled = await build({ stdin: { contents: 'export * from "./src/navigation-state.ts";', resolveDir: fileURLToPath(new URL('../', import.meta.url)), loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', write: false });
const { createHistoryPositions, mountNavigationRestore, samePageRoute } = await import('data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].contents).toString('base64'));

function fixture() {
  const dom = new JSDOM('<main><section id="page"><p>Content</p></section></main>', { url: 'http://localhost/software', pretendToBeVisual: true });
  const win = dom.window, root = win.document.querySelector('main');
  let y = 0, ready = true, limit = 5000, unavailable = false;
  const calls = [], positions = createHistoryPositions(win, () => y);
  const restore = mountNavigationRestore(root, { ready: () => ready, unavailable: () => unavailable, limit: () => limit, scrollTo: top => { calls.push(top); y = Math.min(limit, top); }, timeout: 150 });
  return { dom, win, root, calls, positions, restore, y(value) { y = value; }, ready(value) { ready = value; }, unavailable(value) { unavailable = value; }, limit(value) { limit = value; }, content() { root.dispatchEvent(new win.CustomEvent('page:content', { bubbles: true })); }, close() { restore.dispose(); positions.dispose(); win.close(); } };
}
const tick = () => new Promise(resolve => setTimeout(resolve, 35));

test('only page and detail identity require a page replacement; reader paths stay independent', () => {
  assert.equal(samePageRoute({ page: 'software' }, { page: 'software' }), true);
  assert.equal(samePageRoute({ page: 'software' }, { page: 'software', id: 'codex' }), false);
  assert.equal(samePageRoute({ page: 'software', id: 'codex' }, { page: 'software', id: 'dify' }), false);
  assert.equal(samePageRoute({ page: 'resources' }, { page: 'software' }), false);
  assert.equal(samePageRoute({ page: 'blog', slug: 'article' }, { page: 'blog' }), false);
});

test('duplicate URLs do not create entries and every pushed entry owns its own scroll position', async () => {
  const f = fixture();
  try {
    f.y(840); const previous = f.win.history.state;
    assert.equal(f.positions.navigate('/software'), false);
    assert.equal(f.win.history.state, previous);
    assert.equal(f.positions.navigate('/software/codex'), true);
    f.y(0); f.positions.complete(); f.y(420);
    assert.equal(f.positions.navigate('/software'), true);
    f.y(0); f.positions.complete(); f.y(1300);
    const popped = new Promise(resolve => f.win.addEventListener('popstate', () => resolve(f.positions.pop()), { once: true }));
    f.win.history.back(); assert.equal(await popped, 420);
    f.positions.complete();
  } finally { f.close(); }
});

test('back preserves the source entry during a pending navigation and does not overwrite it with a loading position', async () => {
  const f = fixture();
  try {
    f.y(900); f.positions.navigate('/work'); f.y(0);
    const popped = new Promise(resolve => f.win.addEventListener('popstate', () => resolve(f.positions.pop()), { once: true }));
    f.win.history.back(); assert.equal(await popped, 900);
  } finally { f.close(); }
});

test('replacing a cold reader entry preserves its external-entry provenance, while ordinary pushes remain internal', () => {
  const f = fixture();
  try {
    f.positions.navigate('/blog/second', true);
    assert.notEqual(f.win.history.state.fromApp, true, 'next article must not turn a direct visit into a Back-to-previous-app-page entry');
    f.positions.complete(); f.positions.navigate('/blog'); f.positions.complete();
    f.positions.navigate('/blog/third', true);
    assert.equal(f.win.history.state.fromApp, true, 'replace retains an actual in-app predecessor');
  } finally { f.close(); }
});

test('reloading a saved fragment retains its own position without changing the current history URL', () => {
  const f = fixture();
  try {
    f.positions.navigate('/software#catalog-directory'); f.y(1440); f.positions.complete();
    const initialURL=f.win.location.href;
    const reload=createHistoryPositions(f.win,()=>0);
    assert.equal(reload.initialTop,1440);assert.equal(f.win.location.href,initialURL);
  } finally { f.close(); }
});

test('hash entries retain distinct history positions without replacing page content', async () => {
  const f = fixture();
  try {
    f.y(600); f.positions.navigate('/software#catalog-directory'); f.y(1200); f.positions.complete();
    const popped = new Promise(resolve => f.win.addEventListener('popstate', () => resolve(f.positions.pop()), { once: true }));
    f.win.history.back(); assert.equal(await popped, 600);
  } finally { f.close(); }
});

test('restoration waits for content readiness and measures the committed page height before scrolling once', async () => {
  const f = fixture();
  try {
    f.ready(false); f.limit(300); const pending = f.restore.to(1800);
    await tick(); assert.deepEqual(f.calls, []);
    f.limit(2500); f.ready(true); f.content(); assert.equal(await pending, true); assert.deepEqual(f.calls, [1800]);
    f.content(); await tick(); assert.deepEqual(f.calls, [1800]);
  } finally { f.close(); }
});

function controlledFrames(win) {
  const frames=new Map();let serial=0;
  win.requestAnimationFrame=callback=>{const id=++serial;frames.set(id,callback);return id;};
  win.cancelAnimationFrame=id=>frames.delete(id);
  return ()=>{const callbacks=[...frames.values()];frames.clear();callbacks.forEach(callback=>callback(0));};
}

test('a ready destination that became shorter clamps after two stable layout frames rather than the network deadline', async () => {
  const f=fixture();
  try {
    const frame=controlledFrames(f.win);f.limit(250);
    const pending=f.restore.to(2200);frame();assert.deepEqual(f.calls,[]);
    frame();assert.deepEqual(f.calls,[2200], 'the two completed layout frames must commit before any deadline timer');assert.equal(await pending,true);
  } finally { f.close(); }
});

test('a changing layout is measured again before a short-page fallback is committed', async () => {
  const f=fixture();
  try {
    const frame=controlledFrames(f.win);f.limit(250);
    const pending=f.restore.to(1800);frame();assert.deepEqual(f.calls,[]);
    f.limit(600);frame();assert.deepEqual(f.calls,[]);
    f.limit(2000);frame();assert.deepEqual(f.calls,[1800], 'a newly reachable saved position must commit in the current frame');assert.equal(await pending,true);
  } finally { f.close(); }
});

test('new navigation cancels an older restore before delayed content can pull the visitor back', async () => {
  const f = fixture();
  try {
    f.ready(false); const old = f.restore.to(2000), current = f.restore.to(400);
    assert.equal(await old, false); f.ready(true); f.content(); assert.equal(await current, true); assert.deepEqual(f.calls, [400]);
  } finally { f.close(); }
});

test('an unavailable or permission-gated destination cancels restoration without a delayed jump', async () => {
  const f = fixture();
  try {
    f.ready(false);f.limit(200);const pending=f.restore.to(2400);
    f.unavailable(true);f.ready(true);f.content();
    assert.equal(await pending,false);await tick();assert.deepEqual(f.calls,[]);
  } finally { f.close(); }
});

test('wheel, pointer, touch and scroll keys cancel a waiting restore', async () => {
  for (const [type, event] of [['wheel', 'WheelEvent'], ['pointerdown', 'Event'], ['touchstart', 'Event'], ['keydown', 'KeyboardEvent']]) {
    const f = fixture();
    try {
      f.ready(false); const pending = f.restore.to(2000);
      f.win.document.dispatchEvent(new f.win[event](type, { key: 'PageDown', bubbles: true }));
      assert.equal(await pending, false, type); f.ready(true); f.content(); await tick(); assert.deepEqual(f.calls, []);
    } finally { f.close(); }
  }
});

test('an unresolved loading state expires without jumping; dispose cancels all future work', async () => {
  const f = fixture();
  try {
    f.ready(false);f.limit(200); const pending = f.restore.to(2000);
    assert.equal(await pending, false); assert.deepEqual(f.calls, []);
    f.ready(false); const disposed = f.restore.to(1000); f.restore.dispose();
    assert.equal(await disposed, false); f.ready(true); f.content(); await tick(); assert.deepEqual(f.calls, []);
  } finally { f.close(); }
});
