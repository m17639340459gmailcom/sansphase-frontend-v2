/** Transport-only adapters. No DOM mounting, reader helpers, assets or styles. */
import { localContentURL } from './integration-context.ts';

export type IntegratedKind = 'works' | 'resources' | 'software' | 'resource-center';
export type IntegratedEntry = {
  id: string; title: string; summary: string; category: string; tags: string[];
  date: string; coverSrc: string; format: string; file: string; fileSize: string;
  externalUrl: string; downloadUrl: string; vipOnly: boolean; locked: boolean;
};
export type IntegratedList = {
  items: IntegratedEntry[]; total: number; page: number; pages: number;
  totalPublished: number; categories: string[]; highlights: IntegratedEntry[];
};
export type IntegratedBookHeading = { title: string; level: number; block: string; offset: number; part?: number };
export type IntegratedBookChapter = { id: string; title: string; parts: number; headings?: IntegratedBookHeading[] };
export type IntegratedItem = IntegratedEntry & {
  recordId?: string; bodyHTML: string; attachments: Array<{name: string; url: string}>;
  book?: {revision: string; chapters: IntegratedBookChapter[]};
};
export type IntegratedRoute = {kind: IntegratedKind; id?: string};
const kinds: readonly IntegratedKind[] = ['works','resources','software','resource-center'];
const media = /^\/api\/media\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const unsafe = /[\u0000-\u0020\u007f\\]/;
const record = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const text = (value: unknown, maximum = 2000): string => typeof value === 'string' ? value.slice(0, maximum) : '';
const integer = (value: unknown, minimum = 0): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum;
export const isIntegratedKind = (value: unknown): value is IntegratedKind => kinds.includes(value as IntegratedKind);

/** Same-origin publication media only; preserve the original access check. */
export function integratedMedia(value: unknown, download = false): string {
  if (typeof value !== 'string' || value.length > 4000 || unsafe.test(value) || !value.startsWith('/') || value.startsWith('//')) return '';
  try {
    const url = new URL(value, 'http://local.invalid');
    if (url.origin !== 'http://local.invalid' || !media.test(url.pathname) || url.hash) return '';
    const allowed = download ? ['download'] : ['w','view'];
    if ([...url.searchParams.keys()].some(key => !allowed.includes(key) || url.searchParams.getAll(key).length !== 1)) return '';
    if (download) return url.searchParams.get('download') === '1' ? url.pathname + url.search : '';
    const width = url.searchParams.get('w'), view = url.searchParams.get('view');
    if ((width !== null && (!/^[1-9]\d{0,3}$/.test(width) || Number(width) > 4096)) || (view !== null && view !== 'content')) return '';
    return url.pathname + url.search;
  } catch { return ''; }
}
function external(value: unknown): string {
  if (typeof value !== 'string' || value.length > 4000 || unsafe.test(value) || !/^https?:\/\//i.test(value)) return '';
  try { const url = new URL(value); return !url.username && !url.password ? url.href : ''; } catch { return ''; }
}
function entry(value: unknown): IntegratedEntry | null {
  const item = record(value);
  if (!item || typeof item.id !== 'string' || !item.id.trim() || item.id.length > 500 || typeof item.title !== 'string' || !item.title.trim() || item.title.length > 1000 || !Array.isArray(item.tags) || item.tags.some(tag => typeof tag !== 'string')) return null;
  const bytes = integer(item.fileSize) ? String(item.fileSize) : typeof item.fileSize === 'string' && /^\d{1,30}$/.test(item.fileSize) ? item.fileSize.replace(/^0+(?=\d)/,'') : '';
  return {id: item.id, title: item.title, summary: text(item.summary), category: text(item.category,200),
    tags: item.tags.slice(0,50).map(tag => text(tag,200)), date: text(item.date,100), coverSrc: integratedMedia(item.coverSrc),
    format: text(item.format,100), file: text(item.file,500), fileSize: bytes,
    externalUrl: external(item.externalUrl), downloadUrl: integratedMedia(item.downloadUrl,true), vipOnly: item.vipOnly === true, locked: item.locked === true};
}
export function integratedContentPath(kind: IntegratedKind, id?: string): string {
  if (!isIntegratedKind(kind)) throw new TypeError('Unsupported integration collection');
  return localContentURL(kind,id);
}
export function parseIntegratedList(value: unknown, kind: IntegratedKind): IntegratedList | null {
  if (!isIntegratedKind(kind)) return null;
  const data = record(value);
  if (!data || !Array.isArray(data.items) || !Array.isArray(data.categories) || !Array.isArray(data.highlights) || !integer(data.total) || !integer(data.page,1) || !integer(data.pages,1) || !integer(data.totalPublished)) return null;
  if (data.items.length > 12 || data.items.length > data.total || data.total > data.totalPublished || data.page > data.pages || data.highlights.length > 3 || data.categories.length > 100 || data.categories.some(category => typeof category !== 'string')) return null;
  const items: IntegratedEntry[] = [], highlights: IntegratedEntry[] = [];
  for (const raw of data.items) { const parsed=entry(raw); if (!parsed) return null; items.push(parsed); }
  for (const raw of data.highlights) { const parsed=entry(raw); if (!parsed) return null; highlights.push(parsed); }
  return {items, highlights, total:data.total, page:data.page, pages:data.pages, totalPublished:data.totalPublished,
    categories:data.categories.filter((category): category is string => typeof category === 'string' && category.length > 0).map(category=>category.slice(0,200))};
}
function book(value: unknown): IntegratedItem['book'] | null {
  const manifest=record(value);
  if (!manifest || typeof manifest.revision !== 'string' || !Array.isArray(manifest.chapters) || manifest.chapters.length > 10000) return null;
  const chapters: IntegratedBookChapter[]=[];
  for (const raw of manifest.chapters) {
    const chapter=record(raw);
    if (!chapter || typeof chapter.id !== 'string' || !chapter.id || typeof chapter.title !== 'string' || !integer(chapter.parts,1)) return null;
    const headings: IntegratedBookHeading[]=[];
    if (chapter.headings !== undefined) {
      if (!Array.isArray(chapter.headings)) return null;
      for (const rawHeading of chapter.headings) {
        const heading=record(rawHeading);
        if (!heading || typeof heading.title !== 'string' || !integer(heading.level,1) || heading.level>6 || typeof heading.block !== 'string' || !integer(heading.offset) || (heading.part!==undefined && !integer(heading.part))) return null;
        headings.push({title:heading.title,level:heading.level,block:heading.block,offset:heading.offset,...(heading.part===undefined?{}:{part:heading.part as number})});
      }
    }
    chapters.push({id:chapter.id,title:chapter.title,parts:chapter.parts,...(chapter.headings===undefined?{}:{headings})});
  }
  return {revision:manifest.revision,chapters};
}
export function parseIntegratedDetail(value: unknown, kind: IntegratedKind): IntegratedItem | null {
  if (!isIntegratedKind(kind)) return null;
  const raw=record(record(value)?.item), base=entry(raw);
  if (!raw || !base || base.locked) return null;
  const manifest=kind==='resource-center'?book(raw.book):undefined;
  if (kind==='resource-center' && !manifest) return null;
  const attachments: IntegratedItem['attachments']=[];
  for (const attachment of Array.isArray(raw.attachments)?raw.attachments:[]) {
    const file=record(attachment), url=integratedMedia(file?.url,true);
    if (file && url) attachments.push({name:text(file.name,500)||'附件',url});
  }
  return {...base, ...(typeof raw.recordId==='string'?{recordId:raw.recordId}:{}), bodyHTML:typeof raw.bodyHTML==='string'?raw.bodyHTML:'', attachments, ...(manifest?{book:manifest}:{})};
}
