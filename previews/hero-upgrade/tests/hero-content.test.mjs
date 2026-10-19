import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { createHash } from 'node:crypto';

const root = new URL('../', import.meta.url);
const html = await readFile(new URL('www/index.html', root), 'utf8');
const compiled = await build({ entryPoints: [fileURLToPath(new URL('src/hero-sources.ts', root))], bundle: true, platform: 'node', format: 'esm', write: false });
const { heroSources, postForHeroSource } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].contents).toString('base64')}`);

test('hero keeps the introduction and two actions clear, without archive controls filling the copy', () => {
  const document = new JSDOM(html).window.document;
  const copy = document.querySelector('#hero-copy');
  assert.equal(copy.querySelectorAll('h1').length, 1);
  assert.equal(copy.querySelectorAll('.hero-actions a').length, 2);
  assert.equal(copy.querySelector('[role="tablist"], [data-hero-source], #hero-record, .hero-detail, .hero-stats'), null);
});

test('hero removes the auxiliary form, pause and record strips instead of hiding them', () => {
  const document = new JSDOM(html).window.document;
  const stage = document.querySelector('#hero-stage');
  assert.equal(stage.querySelector('.hero-source-row, #hero-source-choices, [data-hero-source], #hero-pause, .hero-record-row, #hero-record, #hero-art-caption'), null);
  assert.ok(stage.querySelector('#hero-input'), 'direct interaction stays on the particle surface');
  assert.ok(stage.querySelector('#hero-art-status.visually-hidden'), 'keyboard instructions remain available without a visible helper strip');
});

test('particle surface restores a keyboard-operable stage, instrument frame and honest live telemetry', () => {
  const document = new JSDOM(html).window.document;
  const stage = document.querySelector('#hero-stage');
  const surface = stage.querySelector('#hero-input');
  assert.equal(surface.tagName, 'BUTTON', 'the particle action uses a native keyboard-operable button');
  assert.equal(surface.getAttribute('type'), 'button');
  assert.equal(surface.getAttribute('data-cursor'), 'explore');
  const canvas = stage.querySelector('#hero-canvas');
  assert.equal(canvas.getAttribute('aria-hidden'), 'true', 'the enlarged drawing surface is only visual');
  assert.equal(canvas.hasAttribute('tabindex'), false);
  assert.equal(canvas.hasAttribute('data-cursor'), false);
  assert.equal(canvas.closest('[data-particle-surface]'), null, 'drawing headroom cannot silence the background');
  assert.equal(surface.getAttribute('aria-describedby'), 'hero-art-status');
  assert.equal(document.querySelector('#hero-art-status').getAttribute('role'), 'status');
  const hud = stage.querySelector('.hero-hud');
  assert.equal(hud.getAttribute('aria-hidden'), 'true', 'live visual instruments must not repeatedly announce themselves');
  assert.equal(hud.querySelectorAll('.hero-corner').length, 4, 'all four targeting brackets are retained');
  assert.equal(hud.querySelectorAll('.hero-ruler').length, 2, 'top and right rulers are retained');
  for (const id of ['hero-index', 'hero-shape', 'hero-phase', 'hero-count', 'hero-fps', 'hero-mode', 'hero-pointer', 'hero-progress']) {
    assert.ok(hud.querySelector(`#${id}`), `missing live instrument: ${id}`);
  }
  assert.doesNotMatch(hud.querySelector('#hero-fps').textContent, /\d/, 'FPS starts unknown until measured by the running renderer');
  assert.doesNotMatch(hud.querySelector('#hero-count').textContent, /\d/, 'particle count starts unknown until the engine reports its active budget');
});

test('three semantic form choices bind to real public records and the author identity', () => {
  assert.equal(heroSources.length, 3);
  assert.equal(heroSources[0].kind, 'record');
  assert.equal(postForHeroSource(0).slug, 'ai-short-video-workflow-consolidation');
  assert.equal(postForHeroSource(1).slug, 'personal-knowledge-base-completed');
  assert.equal(heroSources[2].kind, 'identity');
  assert.equal(postForHeroSource(2), undefined);
  assert.equal(postForHeroSource(-1), undefined);
  assert.equal(postForHeroSource(99), undefined);
  const document = new JSDOM(html).window.document;
  assert.equal(document.querySelectorAll('[data-hero-source]').length, 0, 'form selection is owned by the scene surface');
  assert.ok(document.querySelector('.hero-actions a[href="/blog"]'), 'the primary journal entry remains available');
});

test('retained TDX engine bytes match the pinned original and explicit configuration manifest', async () => {
  const vendor = new URL('vendor/tdx/', root);
  const manifest = JSON.parse(await readFile(new URL('provenance.json', vendor), 'utf8'));
  assert.equal(manifest.repository, 'https://github.com/DingxinTao0417/tdx-portfolio');
  assert.equal(manifest.commit, 'c73bc4966f0ba808b978e22eccf5a063fc649751');
  for (const file of manifest.files) {
    const bytes = await readFile(new URL(file.file, vendor));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, file.file);
  }
  const adapted = manifest.files.filter(file => file.modifications?.length);
  assert.deepEqual(adapted.map(file => file.file), ['hero-cycle.ts']);
});
