// Thin adaptation of tdx-portfolio src/lib/blog-query.ts at c73bc49 (MIT).
// Match every normalized search token; categories/tags come from author data.
import type { Post, Text } from './content';
export type BlogSort = 'newest' | 'oldest' | 'title';
export type BlogQuery = { query: string; tag: string; sort: BlogSort };
export const normalizeQuery = (value: string) => value.normalize('NFKC').toLocaleLowerCase().replace(/\s+/gu, ' ').trim();
export const tagKey = (tag: Text) => normalizeQuery(tag.en);
export function blogTags(items: readonly Post[]): Text[] {
  return [...new Map(items.flatMap(post => post.tags).map(tag => [tagKey(tag), tag])).values()];
}
export function queryPosts(items: readonly Post[], state: BlogQuery, locale: 'en' | 'zh') {
  const tokens = normalizeQuery(state.query).split(' ').filter(Boolean);
  return items.map((p, i) => ({ p, i }))
    .filter(({ p }) => state.tag === 'all' || p.tags.some(tag => tagKey(tag) === state.tag))
    .filter(({ p }) => {
      const text = normalizeQuery([p.title.en, p.title.zh, p.summary.en, p.summary.zh, p.category.en, p.category.zh, ...p.tags.flatMap(t => [t.en, t.zh])].join(' '));
      return tokens.every(token => text.includes(token));
    })
    .sort((a, b) => state.sort === 'title' ? a.p.title[locale].localeCompare(b.p.title[locale], locale === 'zh' ? 'zh-CN' : 'en') : (state.sort === 'oldest' ? 1 : -1) * a.p.date.localeCompare(b.p.date));
}
