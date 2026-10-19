// Local-only development server. Generated bundles stay in outputs/hero-upgrade.
// Only explicit public GET requests are relayed; browser cookies are never sent.
import { context } from 'esbuild';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { publicOrigin, preparePublicArticle, relayTarget, staticTarget, libraryRelayQuery, catalogRelayQuery } from './server-model.ts';
import { parseLibraryList } from './src/library-model.ts';
import { parseCatalogList } from './src/catalog-model.ts';
import { createBuildOptions } from './scripts/build-config.ts';
import { finishResponse as finish } from './server-response.ts';

const sourceRoot = dirname(fileURLToPath(import.meta.url));
const generatedRoot = resolve(sourceRoot, '../../outputs/hero-upgrade');
const port = Number(process.env.PORT || '4285');
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid preview port');

const builder = await context(createBuildOptions({ development: process.env.PREVIEW_DEBUG === '1' }));
await builder.rebuild();
await builder.watch();

const mime: Record<string, string> = { html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8', txt: 'text/plain; charset=utf-8', map: 'application/json', woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf' };

const server = createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return finish(res, 405, 'text/plain; charset=utf-8', 'This preview is read-only.');
  const head = req.method === 'HEAD';
  try {
    const pathname = decodeURIComponent((req.url ?? '/').split('?')[0]);
    const library = libraryRelayQuery(req.url ?? '/');
    if (library) {
      const upstream = await fetch(`${publicOrigin}/api/content?${library}`, { credentials: 'omit', signal: AbortSignal.timeout(15000), redirect: 'error' });
      if (upstream.status === 401 || upstream.status === 403) return finish(res, upstream.status, 'application/json; charset=utf-8', JSON.stringify({ error: 'Reading access required.' }), head);
      if (!upstream.ok) return finish(res, 502, 'application/json; charset=utf-8', JSON.stringify({ error: 'Library temporarily unavailable.' }), head);
      const catalog = parseLibraryList(await upstream.json());
      if (!catalog) return finish(res, 502, 'application/json; charset=utf-8', JSON.stringify({ error: 'Invalid library response.' }), head);
      return finish(res, 200, 'application/json; charset=utf-8', JSON.stringify(catalog), head);
    }
    const requestedKind = new URL(req.url ?? '/', 'http://127.0.0.1').searchParams.get('kind');
    if (requestedKind === 'resources' || requestedKind === 'software') {
      const query = catalogRelayQuery(req.url ?? '/');
      if (!query) return finish(res, 404, 'text/plain; charset=utf-8', 'Not found.', head);
      const upstream = await fetch(`${publicOrigin}/api/content?${query}`, { credentials: 'omit', signal: AbortSignal.timeout(15000), redirect: 'error' });
      if (upstream.status === 401 || upstream.status === 403) return finish(res, upstream.status, 'application/json; charset=utf-8', JSON.stringify({ error: 'Catalog access required.' }), head);
      if (!upstream.ok) return finish(res, 502, 'application/json; charset=utf-8', JSON.stringify({ error: 'Catalog temporarily unavailable.' }), head);
      const catalog = parseCatalogList(await upstream.json(), requestedKind);
      if (!catalog) return finish(res, 502, 'application/json; charset=utf-8', JSON.stringify({ error: 'Invalid catalog response.' }), head);
      return finish(res, 200, 'application/json; charset=utf-8', JSON.stringify(catalog), head);
    }
    const relay = relayTarget(pathname);
    if (relay) {
      const upstreamURL = relay.kind === 'media'
        ? `${publicOrigin}/api/media/${relay.id}?w=1600&view=content`
        : `${publicOrigin}/api/content?public=1&view=detail&kind=notes&id=${encodeURIComponent(relay.id)}`;
      const upstream = await fetch(upstreamURL, { credentials: 'omit', signal: AbortSignal.timeout(15000), redirect: 'error' });
      if (!upstream.ok) return finish(res, 502, 'text/plain; charset=utf-8', 'Public content is temporarily unavailable.', head);
      if (relay.kind === 'article') {
        const data: unknown = await upstream.json();
        return finish(res, 200, 'application/json; charset=utf-8', JSON.stringify(preparePublicArticle(data, relay.id)), head);
      }
      const type = upstream.headers.get('content-type') ?? '';
      if (!/^image\/(?:png|jpeg|webp|avif|gif)(?:;|$)/i.test(type)) return finish(res, 502, 'text/plain; charset=utf-8', 'Unsupported public image.', head);
      const body = new Uint8Array(await upstream.arrayBuffer());
      if (body.byteLength > 16 * 1024 * 1024) return finish(res, 502, 'text/plain; charset=utf-8', 'Public image exceeds the preview limit.', head);
      return finish(res, 200, type, body, head);
    }
    const asset = staticTarget(pathname);
    if (!asset) return finish(res, 404, 'text/plain; charset=utf-8', 'Not found.', head);
    // Previous development maps may exist in the generated directory. A normal
    // delivery server never publishes them merely because a file was left over.
    if (asset.area === 'generated' && asset.relative.endsWith('.map') && process.env.PREVIEW_DEBUG !== '1') return finish(res, 404, 'text/plain; charset=utf-8', 'Not found.', head);
    const root = asset.area === 'source' ? generatedRoot : resolve(generatedRoot, 'build');
    const body = await readFile(resolve(root, asset.relative));
    const immutable = asset.area === 'generated' && /-[A-Z0-9]{8}\.(?:js|css|woff2?|ttf)$/.test(asset.relative);
    return finish(res, 200, mime[asset.relative.split('.').pop() ?? ''] ?? 'application/octet-stream', body, head, immutable ? 'immutable' : 'revalidate');
  } catch (error: unknown) {
    const code = error !== null && typeof error === 'object' && 'code' in error ? error.code : undefined;
    return finish(res, code === 'ENOENT' ? 404 : 502, 'text/plain; charset=utf-8', code === 'ENOENT' ? 'Not found.' : 'The local preview could not load this resource.', head);
  }
});
server.listen(port, '127.0.0.1', () => console.log(`SANSPHASE hero exploration: http://127.0.0.1:${port}/`));
async function shutdown() { server.close(); await builder.dispose(); }
process.once('SIGINT', () => { void shutdown(); });
process.once('SIGTERM', () => { void shutdown(); });
