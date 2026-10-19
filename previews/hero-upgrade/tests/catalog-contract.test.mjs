import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const sourceRoot = fileURLToPath(new URL('../', import.meta.url));
const packageURL = new URL('../package.json', import.meta.url).href;
const origin = 'https://www.sansphase.com';
const mediaId = 'c57acd8d-a84c-459b-9eb3-6e7f84a82a2e';
let loading, handlerLoading;
async function bundle(contents) {
  const result = await build({
    stdin: { contents, resolveDir: sourceRoot, loader: 'ts' }, bundle: true,
    platform: 'node', target: 'node24', format: 'esm', write: false,
    banner: { js: `import {createRequire as __catalogTestRequire} from 'node:module';const require=__catalogTestRequire(${JSON.stringify(packageURL)});` },
  });
  return import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].contents).toString('base64'));
}
async function load() {
  loading ||= bundle(`export {catalogQuery,catalogMainURL,parseCatalogList} from './src/catalog-model.ts';
    export {catalogRelayQuery,libraryRelayQuery} from './server-model.ts';
    export {contentQuery} from '../../src/content-reader.ts';`);
  return loading;
}
function entry(overrides = {}) {
  return { id: 'offline-contract', title: '离线接口测试夹具', summary: '不是站点真实内容', category: '教程',
    tags: ['测试'], date: '2026-10-19T00:00:00.000Z', coverSrc: `/api/media/${mediaId}?w=960&view=content`,
    format: 'PDF', file: 'guide.pdf', fileSize: 2048, externalUrl: 'https://example.org/guide',
    downloadUrl: `/api/media/${mediaId}?download=1`, ...overrides };
}
function catalog(overrides = {}) {
  return { items: [entry()], total: 1, page: 1, pages: 1, totalPublished: 1, categories: ['教程'], highlights: [], ...overrides };
}
async function serve({ method = 'GET', path = '/api/content?view=list&kind=resources', status = 200, payload = catalog() } = {}) {
  handlerLoading ||= (async () => {
    const source = await readFile(new URL('../server.ts', import.meta.url), 'utf8');
    const prefix = 'const server = createServer(';
    const start = source.indexOf(prefix), end = source.indexOf('\nserver.listen', start);
    assert.ok(start >= 0 && end > start);
    const callback = source.slice(start + prefix.length, end).trim().replace(/\);\s*$/, '');
    return bundle(`import {resolve} from 'node:path';
      import {libraryRelayQuery,catalogRelayQuery,relayTarget,staticTarget,publicOrigin,preparePublicArticle} from './server-model.ts';
      import {parseLibraryList} from './src/library-model.ts';
      import {parseCatalogList} from './src/catalog-model.ts';
      const sourceRoot='',generatedRoot='',mime={};
      export function makeHandler(ports){const fetch=ports.fetch,finish=ports.finish,readFile=ports.readFile;return ${callback};}`);
  })();
  const { makeHandler } = await handlerLoading;
  const requests = [], response = {};
  const handler = makeHandler({
    async fetch(url, options) { requests.push({ url: String(url), options }); return { ok: status >= 200 && status < 300, status,
      headers: new Headers({ 'content-type': 'application/json' }), async json() { return structuredClone(payload); } }; },
    finish(_res, status, type, body, head) { Object.assign(response, { status, type, body, head }); },
    async readFile() { throw new Error('A catalog request must not read static files'); },
  });
  await handler({ method, url: path, headers: { cookie: 'DO_NOT_FORWARD', authorization: 'Bearer DO_NOT_FORWARD' } }, response);
  return { requests, response };
}

test('catalog queries reuse the production list contract and keep kinds separate', async () => {
  const { catalogQuery, contentQuery } = await load();
  for (const kind of ['resources', 'software']) {
    for (const options of [{}, { query: 'C++ & 中文/#%?', category: '入门 教程', page: 2 }]) {
      assert.equal(String(catalogQuery(kind, options)), String(contentQuery({ page: kind }, options)));
      assert.equal(catalogQuery(kind, options).has('id'), false);
    }
  }
  assert.throws(() => catalogQuery('notes'), /kind/i);
});

test('catalog DTO projection normalizes bytes, removes private fields and uses the existing public cover relay', async () => {
  const { parseCatalogList } = await load();
  const input = catalog({ items: [entry({ recordId: 'PRIVATE_RECORD', bodyHTML: 'PRIVATE_BODY', attachments: ['PRIVATE_ATTACHMENT'] })],
    highlights: [entry({ recordId: 'PRIVATE_HIGHLIGHT' })], author: 'PRIVATE_AUTHOR' });
  const before = structuredClone(input), output = parseCatalogList(input, 'resources');
  assert.ok(output);
  assert.deepEqual(Object.keys(output).sort(), ['items', 'total', 'page', 'pages', 'totalPublished', 'categories', 'highlights'].sort());
  assert.deepEqual(Object.keys(output.items[0]).sort(), ['id', 'title', 'summary', 'category', 'tags', 'date', 'coverSrc', 'format', 'file', 'fileSize', 'externalUrl', 'downloadUrl'].sort());
  assert.equal(output.items[0].fileSize, '2048');
  assert.equal(output.items[0].coverSrc, `/media/${mediaId}`);
  assert.equal(output.items[0].downloadUrl, `${origin}/api/media/${mediaId}?download=1`);
  assert.equal(output.highlights[0].id, input.highlights[0].id);
  assert.doesNotMatch(JSON.stringify(output), /PRIVATE_/);
  assert.deepEqual(input, before);
  for (const [value, expected] of [['4096', '4096'], ['00012', '12'], [0, '0'], [null, ''], [undefined, ''], [-1, ''], [Infinity, ''], ['2 MB', '']]) {
    assert.equal(parseCatalogList(catalog({ items: [entry({ fileSize: value })] }), 'software').items[0].fileSize, expected);
  }
});

test('catalog parser distinguishes empty catalogs from malformed, unrelated or overlarge responses', async () => {
  const { parseCatalogList } = await load();
  const empty = catalog({ items: [], total: 0, totalPublished: 0, categories: [] });
  assert.deepEqual(parseCatalogList(empty, 'software'), empty);
  for (const invalid of [null, [], {}, { error: 'Sign in' }, { item: entry() }, catalog({ items: [null] }),
    catalog({ items: [entry({ id: {} })] }), catalog({ items: [entry({ title: '' })] }), catalog({ items: [entry({ tags: ['ok', {}] })] }),
    catalog({ categories: ['教程', null] }), catalog({ highlights: [null] }), catalog({ highlights: Array(4).fill(entry()) }),
    catalog({ items: Array(13).fill(entry()) }), catalog({ total: '1' }), catalog({ page: 0 }), catalog({ pages: 0 }),
    catalog({ page: 2 }), catalog({ totalPublished: Infinity }), catalog({ totalPublished: 0 })]) {
    assert.equal(parseCatalogList(invalid, 'resources'), null, JSON.stringify(invalid));
  }
  assert.equal(parseCatalogList(catalog(), 'notes'), null);
  assert.equal(parseCatalogList(catalog({ highlights: [entry()] }), 'software'), null);
});

test('catalog media and links reject active URLs, foreign/private media and ambiguous query keys', async () => {
  const { parseCatalogList } = await load();
  const invalidCovers = ['javascript:alert(1)', 'data:image/svg+xml,a', '//evil.test/x', `https://evil.test/api/media/${mediaId}`,
    `/api/author/media/${mediaId}`, '/api/media/not-a-uuid', `/api/media/${mediaId}?download=1`,
    `/api/media/${mediaId}?w=960&w=20`, `/api/media/${mediaId}?view=private`, `/api/media/${mediaId}?w=abc`,
    `/api/media/${mediaId}#private`, `https://u:p@www.sansphase.com/api/media/${mediaId}`];
  for (const coverSrc of invalidCovers) assert.equal(parseCatalogList(catalog({ items: [entry({ coverSrc })] }), 'resources').items[0].coverSrc, '', coverSrc);
  for (const externalUrl of ['javascript:alert(1)', 'data:text/plain,a', '//example.org/a', '/internal', 'https://user:secret@example.org/a', 'https://example.org/\nunsafe']) {
    assert.equal(parseCatalogList(catalog({ items: [entry({ externalUrl })] }), 'software').items[0].externalUrl, '', externalUrl);
  }
  for (const downloadUrl of ['https://evil.test/a', `/api/author/media/${mediaId}?download=1`, `/api/media/${mediaId}?download=1&preview=1`, `/api/media/${mediaId}?download=1&download=1`, `/api/media/${mediaId}`]) {
    assert.equal(parseCatalogList(catalog({ items: [entry({ downloadUrl })] }), 'resources').items[0].downloadUrl, '', downloadUrl);
  }
});

test('catalog main links point to the corresponding production detail and encode identities once', async () => {
  const { catalogMainURL } = await load();
  for (const kind of ['resources', 'software']) {
    assert.equal(catalogMainURL(kind), `${origin}/#/${kind}`);
    assert.equal(catalogMainURL(kind, 'C++ 中文/#%?'), `${origin}/#/${kind}/${encodeURIComponent('C++ 中文/#%?')}`);
  }
  assert.throws(() => catalogMainURL('resource-center'), /kind/i);
});

test('catalog relay permits only these two list contracts and leaves the library contract unchanged', async () => {
  const { catalogRelayQuery, libraryRelayQuery } = await load();
  for (const kind of ['resources', 'software']) {
    const query = catalogRelayQuery(`/api/content?view=list&kind=${kind}&page=2&q=C%2B%2B&category=教程`);
    assert.ok(query); assert.equal(query.get('kind'), kind); assert.equal(query.get('public'), '1');
    assert.equal(query.get('q'), 'C++'); assert.equal(query.get('page'), '2');
    assert.equal(libraryRelayQuery(`/api/content?view=list&kind=${kind}`), null);
  }
  assert.ok(libraryRelayQuery('/api/content?view=list&kind=resource-center'));
  for (const raw of ['/api/content?view=detail&kind=resources&id=x', '/api/content?view=bootstrap&kind=software',
    '/api/content?view=list&kind=notes', '/api/content?view=list&kind=resource-center', '/api/admin?view=list&kind=resources',
    '/api/content?view=list&kind=resources&page=0', '/api/content?view=list&kind=resources&page=1000000',
    '/api/content?view=list&kind=resources#hidden']) assert.equal(catalogRelayQuery(raw), null, raw);
});

test('catalog relay rejects every extra key, duplicate or oversized parameter before making network requests', async () => {
  const { catalogRelayQuery } = await load();
  for (const kind of ['resources', 'software']) {
    for (const key of ['id', 'preview', 'auth', 'token', 'cookie', 'authorization', 'action', 'method', 'url', 'redirect', 'sort', 'unknown', 'View', '__proto__']) {
      assert.equal(catalogRelayQuery(`/api/content?view=list&kind=${kind}&${key}=x`), null, key);
    }
    for (const suffix of ['view=list', 'kind=software', 'page=2&page=3', '%71=x&q=y', 'public=1&public=1', 'category=a&category=b', `q=${'a'.repeat(201)}`]) {
      assert.equal(catalogRelayQuery(`/api/content?view=list&kind=${kind}&${suffix}`), null, suffix);
    }
  }
});

test('actual server relays metadata only, omits identity and isolates software/resources requests', async () => {
  for (const kind of ['resources', 'software']) {
    const { requests, response } = await serve({ path: `/api/content?view=list&kind=${kind}&q=工具`, payload: catalog({ items: [entry({ bodyHTML: 'PRIVATE_BODY', recordId: 'PRIVATE_RECORD' })] }) });
    assert.equal(response.status, 200); assert.equal(requests.length, 1);
    const query = new URL(requests[0].url);
    assert.equal(query.origin, origin); assert.equal(query.searchParams.get('kind'), kind);
    assert.equal(query.searchParams.get('view'), 'list'); assert.equal(query.searchParams.get('public'), '1');
    assert.equal(requests[0].options.credentials, 'omit'); assert.equal(requests[0].options.redirect, 'error');
    assert.equal(requests[0].options.headers, undefined); assert.ok(requests[0].options.signal instanceof AbortSignal);
    assert.doesNotMatch(JSON.stringify({ requests, response }), /PRIVATE_|DO_NOT_FORWARD/);
    assert.equal(JSON.parse(response.body).items[0].fileSize, '2048');
  }
});

test('actual server preserves access denials and rejects writes, detail and malformed catalog responses', async () => {
  for (const status of [401, 403]) {
    const result = await serve({ status, payload: { error: 'PRIVATE_UPSTREAM_MESSAGE' } });
    assert.equal(result.response.status, status); assert.doesNotMatch(result.response.body, /PRIVATE_/);
  }
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    const result = await serve({ method }); assert.equal(result.response.status, 405); assert.equal(result.requests.length, 0);
  }
  for (const path of ['/api/content?view=detail&kind=resources&id=x', '/api/content?view=list&kind=software&preview=1', '/api/content?view=list&kind=resources&q=x&q=y']) {
    const result = await serve({ path }); assert.equal(result.response.status, 404); assert.equal(result.requests.length, 0);
  }
  const malformed = await serve({ payload: { items: [] } }); assert.equal(malformed.response.status, 502);
  const failure = await serve({ status: 500 }); assert.equal(failure.response.status, 502);
  const head = await serve({ method: 'HEAD' }); assert.equal(head.response.status, 200); assert.equal(head.response.head, true);
});
