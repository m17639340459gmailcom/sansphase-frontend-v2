// Reuse the production query contract. Never mix blog records into the library.
import { contentQuery } from '../../../src/content-reader.ts';

export type LibraryBook = { id: string; title: string; summary: string; category: string; tags: string[]; date: string; coverSrc: string; vipOnly: boolean; locked: boolean };
export type LibraryCatalog = { items: LibraryBook[]; total: number; page: number; pages: number; totalPublished: number; categories: string[] };
export type LibraryQuery = { query?: string; category?: string; page?: number };
const origin = 'https://www.sansphase.com';
const record = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const text = (value: unknown, max = 2000) => typeof value === 'string' ? value.slice(0, max) : '';
const integer = (value: unknown, minimum: number) => typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum;
const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const publicMediaPath = new RegExp(`^/(?:api/)?media/(${uuid})$`, 'i');
function cover(value: unknown) {
  if (typeof value !== 'string' || !value || value.length > 4000 || /[\u0000-\u0020\u007f\\]/.test(value) || value.startsWith('//')) return '';
  if (!value.startsWith('/') && !/^https:\/\//i.test(value)) return '';
  try {
    const url = new URL(value, origin);
    const id = publicMediaPath.exec(url.pathname)?.[1];
    if (url.origin !== origin || url.username || url.password || url.hash || !id) return '';
    if ([...url.searchParams.keys()].some(key => !['w', 'view'].includes(key) || url.searchParams.getAll(key).length !== 1)) return '';
    const width = url.searchParams.get('w'), view = url.searchParams.get('view');
    if ((width !== null && (!/^[1-9]\d{0,3}$/.test(width) || Number(width) > 4096)) || (view !== null && view !== 'content')) return '';
    // Both the metadata relay and browser validate this DTO. Keep normalization
    // idempotent and use the existing public image relay, never /api/media.
    return `/media/${id}`;
  } catch { return ''; }
}
export function libraryQuery(options: LibraryQuery = {}): URLSearchParams {
  return contentQuery({ page: 'resource-center' }, { page: options.page ?? 1, query: (options.query ?? '').slice(0, 200), category: (options.category ?? 'all').slice(0, 200) })!;
}
export function libraryMainURL(slug?: string) {
  return `${origin}/#/resource-center${slug ? `/${encodeURIComponent(slug)}` : ''}`;
}
export function parseLibraryList(value: unknown): LibraryCatalog | null {
  const data = record(value);
  if (!data || !Array.isArray(data.items) || !Array.isArray(data.categories) || !integer(data.total, 0) || !integer(data.page, 1) || !integer(data.pages, 1) || !integer(data.totalPublished, 0)) return null;
  if (data.items.length > 12 || (data.page as number) > (data.pages as number) || data.categories.some(category => typeof category !== 'string')) return null;
  const items: LibraryBook[] = [];
  for (const raw of data.items) {
    const book = record(raw);
    if (!book || typeof book.id !== 'string' || !book.id || typeof book.title !== 'string' || !book.title) return null;
    items.push({ id: book.id, title: book.title, summary: text(book.summary), category: text(book.category, 200), tags: Array.isArray(book.tags) ? book.tags.filter((tag): tag is string => typeof tag === 'string').slice(0, 50) : [], date: text(book.date, 100), coverSrc: cover(book.coverSrc), vipOnly: book.vipOnly === true, locked: book.locked === true });
  }
  return { items, total: data.total as number, page: data.page as number, pages: data.pages as number, totalPublished: data.totalPublished as number, categories: data.categories.filter((category): category is string => typeof category === 'string' && category.length > 0).slice(0, 100) };
}
