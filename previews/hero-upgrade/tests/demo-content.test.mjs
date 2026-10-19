import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

let modulePromise;
function load() {
  return modulePromise ??= build({ stdin: { contents: `export * from './src/demo-catalog.ts'; export * from './src/demo-library.ts';`, resolveDir: fileURLToPath(new URL('../', import.meta.url)), loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', target: 'node24', write: false }).then(result => import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].contents).toString('base64')));
}

test('demo inventories are complete, bilingual and independent of author CMS records', async () => {
  const { demoCatalog, demoEntry } = await load();
  for (const kind of ['resources', 'software']) {
    const zh = demoCatalog(kind, {}, 'zh'), en = demoCatalog(kind, {}, 'en');
    assert.equal(zh.items.length, 6); assert.equal(zh.totalPublished, 6); assert.equal(zh.total, 6);
    assert.equal(new Set(zh.items.map(item => item.id)).size, 6);
    assert.equal(zh.categories.length >= 3, true);
    assert.deepEqual(zh.items.map(item => item.id), en.items.map(item => item.id));
    assert.notEqual(zh.items[0].summary, en.items[0].summary);
    for (const item of zh.items) {
      assert.match(item.id, /^demo-/); assert.ok(item.title && item.summary && item.category && item.tags.length);
      assert.equal(item.coverSrc, ''); assert.equal(item.downloadUrl, ''); assert.equal(item.fileSize, ''); assert.equal(item.file, '');
      const detail = demoEntry(kind, item.id, 'zh');
      assert.deepEqual(detail.entry, item); assert.ok(detail.sections.length >= 3);
      assert.match(detail.sourceURL, /^https:\/\/github\.com\//); assert.ok(detail.license && detail.sourceLabel);
      assert.ok(detail.sections.every(section => section.title && section.body && !section.body.includes('<')));
      assert.match(detail.sections.map(section => section.body).join(' '), /演示|示例/);
    }
  }
});

test('query, category, page and highlights have deterministic catalog behavior', async () => {
  const { demoCatalog } = await load();
  const all = demoCatalog('resources', {}, 'zh');
  const category = all.categories[0];
  const filtered = demoCatalog('resources', { category }, 'zh');
  assert.ok(filtered.total > 0 && filtered.total < all.total);
  assert.ok(filtered.items.every(item => item.category === category));
  assert.deepEqual(filtered.categories, all.categories);
  assert.equal(demoCatalog('software', { query: '  ＶＳ Ｃｏｄｅ  ' }, 'zh').items[0].id, 'demo-vscode');
  assert.equal(demoCatalog('resources', { query: '这份资料不存在' }, 'zh').total, 0);
  assert.equal(demoCatalog('resources', { category: '不存在' }, 'zh').total, 0);
  assert.equal(demoCatalog('resources', { page: 999999 }, 'zh').page, 1);
  assert.equal(demoCatalog('resources', { page: NaN }, 'zh').page, 1);
  assert.equal(all.highlights.length, 3);
  assert.equal(demoCatalog('software', {}, 'zh').highlights.length, 0);
});

test('demo entries are copied and consumers cannot corrupt later reads', async () => {
  const { demoCatalog, demoEntry, demoLibrary, demoBook } = await load();
  const list = demoCatalog('resources', {}, 'zh');
  const id = list.items[0].id;
  list.items[0].tags.length = 0; list.items[0].title = 'changed'; list.categories.length = 0;
  const detail = demoEntry('resources', id, 'zh'); detail.sections[0].body = 'changed';
  assert.notEqual(demoEntry('resources', id, 'zh').entry.title, 'changed');
  assert.notEqual(demoEntry('resources', id, 'zh').sections[0].body, 'changed');
  assert.ok(demoCatalog('resources', {}, 'zh').items[0].tags.length);
  const books = demoLibrary({}, 'zh'), bookID = books.items[0].id;
  books.items[0].tags.length = 0; demoBook(bookID, 'zh').sections.length = 0;
  assert.ok(demoBook(bookID, 'zh').sections.length >= 3);
  assert.ok(demoLibrary({}, 'zh').items[0].tags.length);
});

test('local detail links do not introduce an API, authenticated route or unsafe URL', async () => {
  const { demoHref, demoLibraryHref, demoEntry, demoBook, demoCatalog } = await load();
  for (const kind of ['resources', 'software']) {
    for (const item of demoCatalog(kind, {}, 'zh').items) {
      const link = new URL(demoHref(kind, item.id), 'http://127.0.0.1:4285');
      assert.equal(link.pathname, kind === 'resources' ? '/learning' : '/software');
      assert.equal(link.searchParams.get('sample'), item.id);
    }
    assert.equal(demoEntry(kind, '../unknown', 'zh'), null);
    assert.throws(() => demoHref(kind, 'unsafe/identifier'), /demo|sample|identifier/i);
  }
  assert.equal(demoBook('private-book', 'zh'), null);
  assert.equal(new URL(demoLibraryHref('demo-book-genai'), 'https://example.test').pathname, '/resources');
  assert.throws(() => demoLibraryHref('unsafe/identifier'), /demo|sample|identifier/i);
});

test('sample library exposes three usable book outlines without real VIP claims', async () => {
  const { demoLibrary, demoBook } = await load();
  for (const language of ['zh', 'en']) {
    const list = demoLibrary({}, language);
    assert.equal(list.items.length, 3); assert.equal(list.total, 3); assert.equal(list.pages, 1);
    for (const book of list.items) {
      assert.match(book.id, /^demo-book-/); assert.equal(book.vipOnly, false); assert.equal(book.locked, false);
      assert.match(book.title + book.summary, language === 'zh' ? /示例|演示/ : /sample|demo/i);
      const detail = demoBook(book.id, language);
      assert.ok(detail.sections.length >= 3); assert.match(detail.sourceURL, /^https:\/\/github\.com\//);
    }
    assert.equal(demoLibrary({ query: 'mermaid' }, language).total, 1);
    assert.equal(demoLibrary({ query: 'no-such-book' }, language).total, 0);
    const category = list.categories[0];
    assert.ok(demoLibrary({ category }, language).items.every(book => book.category === category));
  }
});

test('demo mode reports its boundary, source date and distribution licence distinction', async () => {
  const { DEMO_CONTENT_NOTICE, DEMO_VERIFIED_AT, demoEntry } = await load();
  assert.match(DEMO_CONTENT_NOTICE.zh, /演示/); assert.match(DEMO_CONTENT_NOTICE.zh, /主站|正式/);
  assert.match(DEMO_CONTENT_NOTICE.en, /demo/i); assert.equal(DEMO_VERIFIED_AT, '2026-10-19');
  assert.match(demoEntry('software', 'demo-vscode', 'zh').license, /MIT/);
  assert.match(demoEntry('software', 'demo-vscode', 'zh').sections.map(section => section.body).join(' '), /安装包.*许可|产品许可/);
});
