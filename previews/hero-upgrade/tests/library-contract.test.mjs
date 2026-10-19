import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const sourceRoot = fileURLToPath(new URL('../', import.meta.url));
const packageURL = new URL('../package.json', import.meta.url).href;
const mainOrigin = 'https://www.sansphase.com';
const mediaId = 'c57acd8d-a84c-459b-9eb3-6e7f84a82a2e';
let loading;
let handlerLoading;

async function bundle(contents) {
  const result = await build({
    stdin: { contents, resolveDir: sourceRoot, loader: 'ts' },
    bundle: true, platform: 'node', target: 'node24', format: 'esm', write: false,
    banner: { js: `import {createRequire as __libraryTestRequire} from 'node:module';const require=__libraryTestRequire(${JSON.stringify(packageURL)});` },
  });
  return import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].contents).toString('base64'));
}

async function load() {
  loading ||= bundle(`
    export {libraryQuery,parseLibraryList,libraryMainURL} from './src/library-model.ts';
    export {libraryRelayQuery} from './server-model.ts';
    export {contentQuery} from '../../src/content-reader.ts';
  `);
  return loading;
}

async function loadHandler() {
  handlerLoading ||= (async () => {
    const source = await readFile(new URL('../server.ts', import.meta.url), 'utf8');
    const prefix = 'const server = createServer(';
    const start = source.indexOf(prefix), end = source.indexOf('\nserver.listen', start);
    assert.ok(start >= 0 && end > start, 'exercise the actual server callback without starting its listener');
    const callback = source.slice(start + prefix.length, end).trim().replace(/\);\s*$/, '');
    return bundle(`
      import {resolve} from 'node:path';
      import {libraryRelayQuery,relayTarget,staticTarget,publicOrigin,preparePublicArticle} from './server-model.ts';
      import {parseLibraryList} from './src/library-model.ts';
      const sourceRoot='',generatedRoot='',mime={};
      export function makeHandler(ports){
        const fetch=ports.fetch,finish=ports.finish,readFile=ports.readFile;
        return ${callback};
      }
    `);
  })();
  return handlerLoading;
}

async function serve({ method = 'GET', path = '/api/content?view=list&kind=resource-center', status = 200, payload = catalog() } = {}) {
  const { makeHandler } = await loadHandler();
  const requests = [], response = {};
  const handler = makeHandler({
    async fetch(url, options) {
      requests.push({ url: String(url), options });
      return { ok: status >= 200 && status < 300, status,
        headers: new Headers({ 'content-type': 'application/json' }),
        async json() { return structuredClone(payload); }, async text() { return JSON.stringify(payload); } };
    },
    finish(_res, code, type, body, head) { Object.assign(response, { status: code, type, body, head }); },
    async readFile() { throw new Error('A content request must not read static files'); },
  });
  await handler({ method, url: path, headers: { host: '127.0.0.1:4285', cookie: 'local_session=DO_NOT_FORWARD', authorization: 'Bearer DO_NOT_FORWARD' } }, response);
  return { response, requests };
}

function book(overrides = {}) {
  return { id: 'contract-guide', title: '离线契约夹具', summary: '仅用于接口测试', category: '教程',
    tags: ['阅读', '测试'], date: '2026-10-18T00:00:00.000Z',
    coverSrc: `/api/media/${mediaId}?w=960&view=content`, vipOnly: false, locked: false,
    ...overrides };
}

function catalog(overrides = {}) {
  return { items: [book()], total: 1, page: 1, pages: 1, totalPublished: 1, categories: ['教程'], ...overrides };
}

function relayURL(query, pathname = '/api/content') {
  return new URL(`${pathname}?${typeof query === 'string' ? query : new URLSearchParams(query)}`, 'http://127.0.0.1:4285');
}

test('library query follows the existing resource-center list contract and preserves encoded search text', async () => {
  const { libraryQuery, contentQuery } = await load();
  for (const options of [{}, { query: 'C++ & 中文/#%?', category: '入门 教程', page: 2 }]) {
    const actual = new URLSearchParams(libraryQuery(options));
    const expected = contentQuery({ page: 'resource-center' }, options);
    for (const key of ['view', 'kind', 'page', 'category', 'q']) assert.equal(actual.get(key), expected.get(key), key);
    for (const key of actual.keys()) assert.ok(['view', 'kind', 'page', 'category', 'q', 'public'].includes(key), key);
    if (actual.has('public')) assert.equal(actual.get('public'), '1');
    assert.equal(actual.has('id'), false);
    assert.equal(actual.has('preview'), false);
  }
});

test('library list accepts the real string categories and returns only validated metadata', async () => {
  const { parseLibraryList } = await load();
  const input = catalog({ items: [book({ bodyHTML: '<p>PRIVATE_BODY</p>', attachments: [{ url: 'PRIVATE_ATTACHMENT' }],
    downloadUrl: 'PRIVATE_DOWNLOAD', file: 'PRIVATE_FILE', externalUrl: 'PRIVATE_EXTERNAL',
    recordId: 'PRIVATE_RECORD', book: { chapters: ['PRIVATE_CHAPTER'] }, reader: { email: 'PRIVATE_IDENTITY' } })],
    categories: ['教程', '笔记'], highlights: ['PRIVATE_HIGHLIGHT'], author: { email: 'PRIVATE_AUTHOR' } });
  const before = structuredClone(input);
  const output = parseLibraryList(input);
  assert.ok(output);
  assert.deepEqual(Object.keys(output).sort(), ['items', 'total', 'page', 'pages', 'totalPublished', 'categories'].sort());
  assert.deepEqual(Object.keys(output.items[0]).sort(), ['id', 'title', 'summary', 'category', 'tags', 'date', 'coverSrc', 'vipOnly', 'locked'].sort());
  assert.deepEqual(output.categories, ['教程', '笔记']);
  assert.deepEqual(output.items[0], book({coverSrc:`/media/${mediaId}`}));
  assert.doesNotMatch(JSON.stringify(output), /PRIVATE_/);
  assert.deepEqual(input, before, 'the relay parser must not mutate the response DTO');
});

test('an actual empty result is distinct from malformed or unrelated content responses', async () => {
  const { parseLibraryList } = await load();
  assert.deepEqual(parseLibraryList(catalog({ items: [], total: 0, totalPublished: 0, categories: [] })),
    { items: [], total: 0, page: 1, pages: 1, totalPublished: 0, categories: [] });
  for (const input of [null, [], {}, { error: 'Sign in first' }, { code: 'VIP_REQUIRED', item: book() },
    catalog({ items: null }), catalog({ items: {} }), catalog({ categories: [{ name: '教程', count: 1 }] }),
    catalog({ categories: ['教程', null] }), catalog({ total: '1' }), catalog({ total: -1 }),
    catalog({ page: 0 }), catalog({ pages: NaN }), catalog({ totalPublished: Infinity })]) {
    assert.equal(parseLibraryList(input), null, JSON.stringify(input));
  }
});

test('library item identities and text cannot be supplied by objects or malformed array members', async () => {
  const { parseLibraryList } = await load();
  for (const entry of [null, [], 'not-an-item', book({ id: '' }), book({ id: {} }), book({ title: {} })]) {
    assert.equal(parseLibraryList(catalog({ items: [entry] })), null, JSON.stringify(entry));
  }
});

test('VIP and locked flags are true only for explicit booleans', async () => {
  const { parseLibraryList } = await load();
  for (const value of [false, undefined, null, 'false', 'true', 0, 1]) {
    const output = parseLibraryList(catalog({ items: [book({ vipOnly: value, locked: value })] }));
    assert.ok(output);
    assert.equal(output.items[0].vipOnly, false, String(value));
    assert.equal(output.items[0].locked, false, String(value));
  }
  const output = parseLibraryList(catalog({ items: [book({ vipOnly: true, locked: true })] }));
  assert.equal(output.items[0].vipOnly, true);
  assert.equal(output.items[0].locked, true);
});

test('book covers normalize exact public UUID media to the existing local image relay idempotently', async () => {
  const { parseLibraryList } = await load();
  for (const coverSrc of [`/api/media/${mediaId}`, `/api/media/${mediaId}?w=960&view=content`,
    `${mainOrigin}/api/media/${mediaId}?w=960&view=content`, `/media/${mediaId}`,
    `${mainOrigin}/media/${mediaId}?w=1600&view=content`]) {
    const output = parseLibraryList(catalog({ items: [book({ coverSrc })] }));
    assert.ok(output);
    assert.equal(output.items[0].coverSrc, `/media/${mediaId}`);
    assert.deepEqual(parseLibraryList(output), output, 'server and browser parsing must retain the same safe local cover');
  }
});

test('cover presentation metadata never widens the public relay into private or ambiguous media', async () => {
  const { parseLibraryList } = await load();
  for (const suffix of ['?preview=1','?download=1','?w=960&w=1600','?view=content&view=content','?w=0','?w=4097','?w=960px','?view=private','#private']) {
    const output=parseLibraryList(catalog({items:[book({coverSrc:`/api/media/${mediaId}${suffix}`})]}));
    assert.equal(output.items[0].coverSrc,'',suffix);
  }
  for (const coverSrc of [`https://user:pass@www.sansphase.com/api/media/${mediaId}`, `api/media/${mediaId}`, `/api/media/${mediaId}\n`]) {
    assert.equal(parseLibraryList(catalog({items:[book({coverSrc})]})).items[0].coverSrc,'',coverSrc);
  }
});

test('untrusted cover protocols, host lookalikes and non-media paths cannot become image sources', async () => {
  const { parseLibraryList } = await load();
  for (const coverSrc of [`http://www.sansphase.com/api/media/${mediaId}`, `//evil.example/api/media/${mediaId}`,
    `${mainOrigin}.evil.example/api/media/${mediaId}`, `https://www.sansphase.com@evil.example/api/media/${mediaId}`,
    `https://evil.example/api/media/${mediaId}`, 'javascript:alert(1)', 'data:image/svg+xml,<svg/>',
    `/api/author/media/${mediaId}`, '/api/media/not-a-uuid', `/api/media/${mediaId}/extra`,
    `/api/media/${mediaId}%2Fextra`, `/api/media\\${mediaId}`, `${mainOrigin}/account`, '/build/private.png']) {
    const output = parseLibraryList(catalog({ items: [book({ coverSrc })] }));
    assert.ok(output === null || output.items[0].coverSrc === '', coverSrc);
  }
});

test('main-site reading links encode a slug once and keep it inside the resource-center route', async () => {
  const { libraryMainURL } = await load();
  assert.equal(libraryMainURL(), `${mainOrigin}/#/resource-center`);
  for (const slug of ['contract-guide', '章节 /?x=1#frag%中文', '%2Falready-encoded', 'https://evil.example/?x=1']) {
    assert.equal(libraryMainURL(slug), `${mainOrigin}/#/resource-center/${encodeURIComponent(slug)}`);
    const url = new URL(libraryMainURL(slug));
    assert.equal(url.origin, mainOrigin);
    assert.equal(url.pathname, '/');
    assert.equal(url.search, '');
  }
});

test('library relay accepts only the read-only book list and fixes the public cache hint', async () => {
  const { libraryRelayQuery } = await load();
  const text = 'C++ & 中文/#%?';
  const output = libraryRelayQuery(relayURL({ view: 'list', kind: 'resource-center', page: '2', category: '入门 教程', q: text }));
  assert.ok(output instanceof URLSearchParams);
  assert.equal(output.get('view'), 'list');
  assert.equal(output.get('kind'), 'resource-center');
  assert.equal(output.get('page'), '2');
  assert.equal(output.get('category'), '入门 教程');
  assert.equal(output.get('q'), text);
  assert.equal(output.get('public'), '1');
  for (const key of output.keys()) assert.ok(['view', 'kind', 'page', 'category', 'q', 'public'].includes(key), key);
  const untrustedPublic = libraryRelayQuery(relayURL('view=list&kind=resource-center&public=0'));
  assert.ok(untrustedPublic === null || untrustedPublic.get('public') === '1');
});

test('library relay refuses detail, fragments, other collections and non-content paths', async () => {
  const { libraryRelayQuery } = await load();
  for (const query of ['view=detail&kind=resource-center&id=contract-guide', 'view=book-part&kind=resource-center&chapter=one',
    'view=bootstrap&kind=resource-center', 'view=list&kind=resources', 'view=list&kind=notes',
    'kind=resource-center', 'view=list', 'view=&kind=resource-center']) {
    assert.equal(libraryRelayQuery(relayURL(query)), null, query);
  }
  for (const pathname of ['/api/author/content/resource-center', '/api/reader/session', '/api/content/', '/api/content/extra', '/resources']) {
    assert.equal(libraryRelayQuery(relayURL('view=list&kind=resource-center', pathname)), null, pathname);
  }
});

test('library relay rejects every unknown, preview, identity and write parameter instead of dropping it', async () => {
  const { libraryRelayQuery } = await load();
  for (const key of ['preview', 'previewKind', 'id', 'chapter', 'part', 'block', 'offset', 'auth', 'token', 'cookie',
    'authorization', 'action', 'method', 'url', 'redirect', 'sort', 'unknown', 'View', '__proto__']) {
    const url = relayURL({ view: 'list', kind: 'resource-center', [key]: 'untrusted' });
    assert.equal(libraryRelayQuery(url), null, key);
  }
});

test('library relay rejects decoded duplicate keys even when their values match', async () => {
  const { libraryRelayQuery } = await load();
  const base = 'view=list&kind=resource-center&page=1&category=all&q=read&public=1';
  for (const pair of ['view=list', '%76iew=detail', 'kind=resource-center', 'page=1', 'category=all', 'q=read', '%71=read', 'public=1']) {
    assert.equal(libraryRelayQuery(relayURL(`${base}&${pair}`)), null, pair);
  }
});

test('the actual server callback forwards a metadata-only GET without local cookies or authorization', async () => {
  const payload = catalog({ items: [book({ bodyHTML: 'PRIVATE_BODY', downloadUrl: 'PRIVATE_DOWNLOAD' })], reader: { email: 'PRIVATE_READER' } });
  const { response, requests } = await serve({ payload });
  assert.equal(response.status, 200);
  assert.equal(requests.length, 1);
  const request = requests[0], url = new URL(request.url);
  assert.equal(url.origin, mainOrigin);
  assert.equal(url.pathname, '/api/content');
  assert.equal(url.searchParams.get('view'), 'list');
  assert.equal(url.searchParams.get('kind'), 'resource-center');
  assert.equal(url.searchParams.get('public'), '1');
  assert.equal(request.options.credentials, 'omit');
  assert.equal(request.options.redirect, 'error');
  const headers = new Headers(request.options.headers);
  assert.equal(headers.has('cookie'), false);
  assert.equal(headers.has('authorization'), false);
  assert.doesNotMatch(JSON.stringify(request), /DO_NOT_FORWARD/);
  const output = JSON.parse(response.body);
  assert.deepEqual(output.items, [book({coverSrc:`/media/${mediaId}`})]);
  assert.doesNotMatch(response.body, /PRIVATE_/);
});

test('the actual server preserves access-denied status instead of publishing an empty catalog', async () => {
  for (const status of [401, 403]) {
    const { response, requests } = await serve({ status, payload: { code: status === 403 ? 'VIP_REQUIRED' : 'LOGIN_REQUIRED' } });
    assert.equal(requests.length, 1);
    assert.equal(response.status, status);
    assert.notEqual(response.status, 200);
    assert.doesNotMatch(String(response.body), /"items"\s*:\s*\[\]/);
  }
});

test('the actual server refuses writes and protected query variants before any network call', async () => {
  for (const options of [{ method: 'POST' }, { method: 'PATCH' }, { method: 'DELETE' },
    { path: '/api/content?view=detail&kind=resource-center&id=contract-guide' },
    { path: '/api/content?view=list&kind=resource-center&preview=private' },
    { path: '/api/content?view=list&kind=resource-center&view=list' },
    { path: '/api/content?view=list&kind=resource-center&unknown=1' }]) {
    const { response, requests } = await serve(options);
    assert.equal(requests.length, 0, JSON.stringify(options));
    assert.ok(response.status >= 400, JSON.stringify(options));
  }
});

test('the actual server handles HEAD and rejects malformed upstream DTOs without inventing inventory', async () => {
  const head = await serve({ method: 'HEAD' });
  assert.equal(head.response.status, 200);
  assert.equal(head.response.head, true);
  assert.equal(head.requests.length, 1);
  const malformed = await serve({ payload: { message: 'not a catalog' } });
  assert.ok(malformed.response.status >= 400);
  assert.notEqual(malformed.response.status, 200);
});
