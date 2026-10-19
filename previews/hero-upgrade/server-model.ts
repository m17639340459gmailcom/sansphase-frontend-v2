// Local read-only adapter. The public paths are copied from the committed V4
// preview; no account, write, admin, or unpublished-content relay exists here.
import sanitizeHtml from 'sanitize-html';
import { posts } from './src/content.ts';
import { libraryQuery } from './src/library-model.ts';
import { catalogQuery } from './src/catalog-model.ts';

export const publicOrigin = 'https://www.sansphase.com';
export const allowedArticleSlugs = new Set(posts.map((post) => post.slug));
// Read-only catalog metadata only. This local preview has no identity relay.
export function libraryRelayQuery(rawURL: string): URLSearchParams | null {
  let url: URL;
  try { url = new URL(rawURL, 'http://127.0.0.1'); } catch { return null; }
  if (url.pathname !== '/api/content') return null;
  const params = url.searchParams;
  const allowed = ['view', 'kind', 'page', 'category', 'q', 'public'];
  if ([...params.keys()].some(key => !allowed.includes(key) || params.getAll(key).length !== 1)) return null;
  if (params.get('view') !== 'list' || params.get('kind') !== 'resource-center') return null;
  const page = params.get('page') ?? '1';
  if (!/^[1-9]\d{0,5}$/.test(page) || (params.get('q')?.length ?? 0) > 200 || (params.get('category')?.length ?? 0) > 200) return null;
  const query = libraryQuery({ page: Number(page), query: params.get('q') ?? '', category: params.get('category') ?? 'all' });
  query.set('public','1');
  return query;
}
// Only independent learning-material/software list metadata. This does not
// extend the resource-center book contract or relay authenticated content.
export function catalogRelayQuery(rawURL: string): URLSearchParams | null {
  let url: URL;
  try { url = new URL(rawURL, 'http://127.0.0.1'); } catch { return null; }
  if (url.pathname !== '/api/content' || url.hash) return null;
  const params = url.searchParams;
  const allowed = ['view', 'kind', 'page', 'category', 'q', 'public'];
  if ([...params.keys()].some(key => !allowed.includes(key) || params.getAll(key).length !== 1)) return null;
  const kind = params.get('kind');
  if (params.get('view') !== 'list' || (kind !== 'resources' && kind !== 'software')) return null;
  const page = params.get('page') ?? '1';
  if (!/^[1-9]\d{0,5}$/.test(page) || (params.get('q')?.length ?? 0) > 200 || (params.get('category')?.length ?? 0) > 200) return null;
  const query = catalogQuery(kind, { page: Number(page), query: params.get('q') ?? '', category: params.get('category') ?? 'all' });
  query.set('public', '1');
  return query;
}
const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const mediaPath = new RegExp(`^/(?:api/)?media/(${uuid})$`);

export function relayTarget(pathname: string): { kind: 'article' | 'media'; id: string } | null {
  const media = mediaPath.exec(pathname);
  if (media && pathname.startsWith('/media/')) return { kind: 'media', id: media[1] };
  const slug = /^\/api\/article\/([a-z0-9-]+)$/.exec(pathname)?.[1];
  return slug && allowedArticleSlugs.has(slug) ? { kind: 'article', id: slug } : null;
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function localMedia(raw: string): string | null {
  try {
    const url = new URL(raw, publicOrigin);
    if (url.origin !== publicOrigin) return null;
    const match = mediaPath.exec(url.pathname);
    return match ? `/media/${match[1]}` : null;
  } catch { return null; }
}

export function preparePublicArticle(data: unknown, slug: string): { slug: string; bodyHTML: string; attachments: never[] } {
  if (!allowedArticleSlugs.has(slug)) throw new Error('Unknown public article');
  const response = record(data);
  const item = record(response.item ?? response);
  const html = typeof item.bodyHTML === 'string' ? item.bodyHTML : '';
  const bodyHTML = sanitizeHtml(html, {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, 'img', 'figure', 'figcaption'],
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      '*': ['id', 'class'],
      img: ['src', 'alt', 'width', 'height', 'loading', 'decoding'],
      a: ['href', 'title', 'target', 'rel'],
    },
    allowedSchemes: ['https', 'http', 'mailto'],
    allowProtocolRelative: false,
    transformTags: {
      img: (_tagName, attribs) => ({ tagName: 'img', attribs: { alt: attribs.alt ?? '', src: localMedia(attribs.src ?? '') ?? '', loading: 'lazy', decoding: 'async' } }),
      a: (_tagName, attribs) => ({ tagName: 'a', attribs: { ...attribs, rel: 'noopener noreferrer' } }),
    },
    exclusiveFilter: (frame) => frame.tag === 'img' && !frame.attribs.src,
  });
  return { slug, bodyHTML, attachments: [] };
}

export function staticTarget(pathname: string): { area: 'source' | 'generated'; relative: string } | null {
  if (pathname.includes('..') || pathname.includes('\\') || pathname.includes('\0')) return null;
  if (pathname === '/style.css') return { area: 'source', relative: 'style.css' };
  if (pathname === '/third-party-notices.txt') return { area: 'source', relative: 'third-party-notices.txt' };
  const asset = /^\/build\/([a-zA-Z0-9._-]+)$/.exec(pathname);
  if (asset && /\.(?:js|css|map|woff2?|ttf)$/.test(asset[1])) return { area: 'generated', relative: asset[1] };
  if (pathname.startsWith('/api/') || pathname.startsWith('/media/') || /\.[^/]+$/.test(pathname)) return null;
  return { area: 'source', relative: 'index.html' };
}
