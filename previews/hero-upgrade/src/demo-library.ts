/** Sample book outlines only; no real resource-center book, access grant or CMS
 * request is generated here. The original library reader remains authoritative.
 */
import type { Lang } from './content';
import type { LibraryBook, LibraryCatalog, LibraryQuery } from './library-model';
import { demoEntry } from './demo-catalog';
import type { DemoSection } from './demo-catalog';

export type DemoBookDetail = { book: LibraryBook; sections: DemoSection[]; sourceURL: string; sourceLabel: string; license: string };
const books = [
  { id: 'demo-book-genai', sourceID: 'demo-generative-ai' },
  { id: 'demo-book-web', sourceID: 'demo-web-foundations' },
  { id: 'demo-book-mermaid', sourceID: 'demo-mermaid' },
] as const;
const normalized = (value: string) => value.normalize('NFKC').trim().toLocaleLowerCase();

export function demoBook(id: string, language: Lang = 'zh'): DemoBookDetail | null {
  const record = books.find(book => book.id === id);
  const source = record && demoEntry('resources', record.sourceID, language);
  if (!source) return null;
  return { book: { id, title: `${source.entry.title}${language === 'zh' ? ' · 示例书目' : ' · Sample book'}`, summary: language === 'zh' ? `本地示例书目：${source.entry.summary}` : `Local sample book: ${source.entry.summary}`, category: source.entry.category, tags: [...source.entry.tags], date: '', coverSrc: '', vipOnly: false, locked: false },
    sections: source.sections.map(section => ({ ...section })), sourceURL: source.sourceURL, sourceLabel: source.sourceLabel, license: source.license };
}

export function demoLibrary(query: LibraryQuery = {}, language: Lang = 'zh'): LibraryCatalog {
  const all = books.map(record => demoBook(record.id, language)!.book);
  const words = normalized((query.query ?? '').slice(0, 200)).split(/\s+/).filter(Boolean);
  const category = query.category ?? 'all';
  const items = all.filter(book => (category === 'all' || category === book.category) && words.every(word => normalized([book.title, book.summary, ...book.tags].join(' ')).includes(word)));
  return { items, total: items.length, totalPublished: all.length, page: 1, pages: 1, categories: [...new Set(all.map(book => book.category))] };
}

export function demoLibraryHref(id: string): string {
  if (!books.some(book => book.id === id)) throw new TypeError('Unknown sample book identifier');
  return `/resources?sample=${encodeURIComponent(id)}`;
}
