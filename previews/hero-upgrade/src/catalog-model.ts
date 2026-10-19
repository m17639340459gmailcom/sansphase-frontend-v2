// Production list DTO adapter. These are managed library/software records,
// not editorial blog topics; no reader identity or full body is exposed here.
import { contentQuery } from '../../../src/content-reader.ts';

export type CatalogKind = 'resources' | 'software';
export type CatalogEntry = {
  id: string; title: string; summary: string; category: string; tags: string[];
  date: string; coverSrc: string; format: string; file: string; fileSize: string;
  externalUrl: string; downloadUrl: string;
};
export type CatalogList = {
  items: CatalogEntry[]; total: number; page: number; pages: number;
  totalPublished: number; categories: string[]; highlights: CatalogEntry[];
};
export type CatalogQuery = { query?: string; category?: string; page?: number };

const origin = 'https://www.sansphase.com';
const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const mediaPath = new RegExp(`^/(?:api/)?media/(${uuid})$`, 'i');
const unsafeURLCharacters = /[\u0000-\u0020\u007f\\]/;
const isKind = (value: unknown): value is CatalogKind => value === 'resources' || value === 'software';
const record = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const text = (value: unknown, maximum = 2000): string => typeof value === 'string' ? value.slice(0, maximum) : '';
const integer = (value: unknown, minimum: number): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum;

function publicMedia(value: unknown): URL | null {
  if (typeof value !== 'string' || !value || value.length > 4000 || unsafeURLCharacters.test(value) || value.startsWith('//')) return null;
  // Reject relative text and protocol-relative URLs, even if URL() could make
  // them look like local paths. Only the existing main-site media path is valid.
  if (!value.startsWith('/') && !/^https:\/\//i.test(value)) return null;
  try {
    const url = new URL(value, origin);
    if (url.origin !== origin || url.username || url.password || url.hash || !mediaPath.test(url.pathname)) return null;
    return url;
  } catch { return null; }
}

function cover(value: unknown): string {
  const url = publicMedia(value);
  if (!url || [...url.searchParams.keys()].some(key => !['w', 'view'].includes(key) || url.searchParams.getAll(key).length !== 1)) return '';
  const width = url.searchParams.get('w'), view = url.searchParams.get('view');
  if ((width !== null && (!/^[1-9]\d{0,3}$/.test(width) || Number(width) > 4096)) || (view !== null && view !== 'content')) return '';
  const id = mediaPath.exec(url.pathname)?.[1];
  // The preview already has this public image relay. Do not introduce an
  // authenticated /api/media or /api/author/media relay for this catalog.
  return id ? `/media/${id}` : '';
}

function externalLink(value: unknown): string {
  if (typeof value !== 'string' || value.length > 4000 || unsafeURLCharacters.test(value) || !/^https?:\/\//i.test(value)) return '';
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}

function downloadLink(value: unknown): string {
  const url = publicMedia(value);
  if (!url || !url.pathname.startsWith('/api/media/') || [...url.searchParams.keys()].some(key => key !== 'download') || url.searchParams.getAll('download').length !== 1 || url.searchParams.get('download') !== '1') return '';
  // Metadata only. The UI uses catalogMainURL for actions; downloads remain
  // behind the production site's normal access checks.
  return `${origin}${url.pathname}?download=1`;
}

function fileSize(value: unknown): string {
  if (integer(value, 0)) return String(value);
  if (typeof value === 'string' && /^\d{1,30}$/.test(value)) return value.replace(/^0+(?=\d)/, '');
  return '';
}

function entry(value: unknown): CatalogEntry | null {
  const item = record(value);
  if (!item || typeof item.id !== 'string' || !item.id.trim() || item.id.length > 500 || typeof item.title !== 'string' || !item.title.trim() || item.title.length > 1000 || !Array.isArray(item.tags) || item.tags.some(tag => typeof tag !== 'string')) return null;
  return {
    id: item.id, title: item.title, summary: text(item.summary), category: text(item.category, 200),
    tags: item.tags.slice(0, 50).map(tag => text(tag, 200)), date: text(item.date, 100),
    coverSrc: cover(item.coverSrc), format: text(item.format, 100), file: text(item.file, 500),
    fileSize: fileSize(item.fileSize), externalUrl: externalLink(item.externalUrl), downloadUrl: downloadLink(item.downloadUrl),
  };
}

export function catalogQuery(kind: CatalogKind, options: CatalogQuery = {}): URLSearchParams {
  if (!isKind(kind)) throw new TypeError('Unsupported catalog kind');
  const page = integer(options.page, 1) && options.page <= 999999 ? options.page : 1;
  return contentQuery({ page: kind }, { page, query: (options.query ?? '').slice(0, 200), category: (options.category ?? 'all').slice(0, 200) })!;
}

export function catalogMainURL(kind: CatalogKind, id?: string): string {
  if (!isKind(kind)) throw new TypeError('Unsupported catalog kind');
  return `${origin}/#/${kind}${id ? `/${encodeURIComponent(id)}` : ''}`;
}

export function parseCatalogList(value: unknown, kind: CatalogKind): CatalogList | null {
  if (!isKind(kind)) return null;
  const data = record(value);
  if (!data || !Array.isArray(data.items) || !Array.isArray(data.categories) || !Array.isArray(data.highlights) || !integer(data.total, 0) || !integer(data.page, 1) || !integer(data.pages, 1) || !integer(data.totalPublished, 0)) return null;
  if (data.items.length > 12 || data.items.length > data.total || data.total > data.totalPublished || data.page > data.pages || data.categories.length > 100 || data.categories.some(category => typeof category !== 'string') || data.highlights.length > 3 || (kind === 'software' && data.highlights.length !== 0)) return null;
  const items: CatalogEntry[] = [], highlights: CatalogEntry[] = [];
  for (const raw of data.items) { const parsed = entry(raw); if (!parsed) return null; items.push(parsed); }
  for (const raw of data.highlights) { const parsed = entry(raw); if (!parsed) return null; highlights.push(parsed); }
  return {
    items, total: data.total, page: data.page, pages: data.pages, totalPublished: data.totalPublished,
    categories: data.categories.filter((category): category is string => typeof category === 'string' && category.length > 0).map(category => category.slice(0, 200)), highlights,
  };
}
