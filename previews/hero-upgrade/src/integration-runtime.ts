import { createContentReader, contentQuery } from '../../../src/content-reader.ts';
import { posts, numbers, sections, profile, community } from './content.ts';
import type { Post } from './content.ts';
import { litDays, parseDate } from './util.ts';
import type { AccountState } from './integration-account.ts';
import { integratedDateLabel } from './integration-date.ts';
import { clearIntegratedArticle, primeIntegratedArticle } from './integration-article-source.ts';
import { communityEntryDestination } from '../../../src/community-entry.ts';
import { isLocalIntegration, localIntegrationMetadata } from './integration-context.ts';
import { ui } from './i18n.ts';

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const reader = createContentReader(fetch, { maxEntries: 0 });
export let integrationState: AccountState = { reader: null, author: null };
export let integrationError = '';
export let homeIntegrationReady = false;
/** A local-only notice belongs to the optional integration runtime, not the universal entry. */
export function mountLocalEnvironment(doc: Document = document) {
  doc.querySelector('.integration-environment')?.remove();
  const metadata = localIntegrationMetadata(doc);
  if (!metadata) return;
  const status = doc.createElement('aside'); status.className = 'integration-environment';
  const dataSource = metadata.dataSource === 'existing-local' ? '本地主站数据' : metadata.dataSource === 'isolated-test' ? '隔离测试数据' : '本地联调';
  status.innerHTML = `<a href="/__local-test">版本2 · 新版前端 · ${dataSource}</a><a href="/original">版本1 · 原主站 ↗</a>`;
  doc.body.append(status);
  if (integrationError) status.insertAdjacentHTML('beforeend', '<span role="alert">内容读取失败，请刷新重试。</span>');
}
export type IntegratedCommunity = { mode: 'bridge' | 'legacy' | 'disabled'; local: boolean; destination: string | null };
export let integrationCommunity: IntegratedCommunity = { mode: 'disabled', local: false, destination: null };
/** Community availability is a server setting, never a publication count or a demo URL. */
function updateIntegratedCommunity(value: unknown) {
  const local = isLocalIntegration();
  const destination = object(value) ? communityEntryDestination(value) : null;
  const mode = destination && !local ? 'bridge' : object(value) && value.communityEnabled === true && value.communityOnly !== true ? 'legacy' : 'disabled';
  integrationCommunity = { mode, local, destination: mode === 'bridge' ? destination : null };
  const status = mode !== 'disabled' ? { zh: '进入现有社区', en: 'Enter the community' }
    : local ? { zh: '本地未连接', en: 'Not connected locally' } : { zh: '暂未开放', en: 'Not open yet' };
  ui['community.note'] = mode !== 'disabled'
    ? { zh: '沿用原站账号，从这里进入现有社区。', en: 'Enter the existing community with your original account.' }
    : local ? { zh: '本地联调未启用社区身份桥接，这里不会连接线上社区。', en: 'The local community identity bridge is disabled. This preview does not connect to the live community.' }
    : { zh: '原站服务暂未开放社区入口。', en: 'The original service currently has no open community entry.' };
  community.status = status;
  const section = sections.find(item => item.id === 'community');
  if (section) { section.status = status; section.open = mode !== 'disabled'; }
}
let generation = 0;
let bootstrapController: AbortController | null = null;
let notesTask: Promise<boolean> | null = null;
let notesHandoff: {value: unknown; expires: number} | null = null;
/** One bounded metadata batch may seed the immediate journal mount. It never
 * retains bodies or identity, and cannot be reused as a directory cache. */
export function takeIntegratedNotesList(): unknown {
  const pending=notesHandoff;notesHandoff=null;
  return pending && pending.expires>Date.now() ? pending.value : undefined;
}
export function parseIntegratedPost(value: unknown): Post | null {
  if (!object(value) || typeof value.id !== 'string' || !value.id || typeof value.title !== 'string' || !value.title || typeof value.date !== 'string' || !Array.isArray(value.tags) || value.tags.some(tag => typeof tag !== 'string')) return null;
  const date = integratedDateLabel(value.date);
  if (!date) return null;
  const text = (v: unknown) => typeof v === 'string' ? v : '';
  const bilingual = (v: string) => ({ zh: v, en: v });
  const cover = text(value.coverSrc);
  return { slug: value.id, title: bilingual(value.title), summary: bilingual(text(value.summary)), category: bilingual(text(value.category)), tags: value.tags.map(tag => bilingual(String(tag))), date, cover: /^\/api\/media\/[\da-f-]+(?:\?[^#]*)?$/i.test(cover) ? cover : '', url: `/original#/note/${encodeURIComponent(value.id)}` };
}
function clearPosts() {
  notesHandoff=null;
  posts.splice(0); litDays.clear(); numbers.posts = 0; numbers.tags = 0; numbers.latest = '—';
}
export function clearIntegration() {
  generation++; bootstrapController?.abort(); bootstrapController = null; reader.clear(); clearIntegratedArticle(); integrationState = { reader: null, author: null }; clearPosts();
  updateIntegratedCommunity(null);
  notesTask = null; homeIntegrationReady = false;
}
export function loadIntegratedNotes(): Promise<boolean> {
  if (homeIntegrationReady) return Promise.resolve(true);
  if (notesTask) return notesTask;
  const request = generation;
  const pending = (async () => {
    try {
      const list: unknown = await reader.read(contentQuery({ page: 'notes' })!);
      if (request !== generation) return false;
      if (!object(list) || !Array.isArray(list.items) || list.items.length > 12 || typeof list.totalPublished !== 'number') throw new Error('Invalid notes list');
      const next = list.items.map(parseIntegratedPost);
      if (next.some(post => !post)) throw new Error('Invalid note metadata');
      const items=list.items.filter(object).map(item=>({id:item.id,slug:item.slug,title:item.title,
        summary:item.summary,category:item.category,tags:item.tags,date:item.date,
        coverSrc:item.coverSrc,en:item.en,summaryEn:item.summaryEn}));
      notesHandoff={value:{items,total:list.total,totalPublished:list.totalPublished,page:list.page,
        pages:list.pages,categories:list.categories,highlights:[]},expires:Date.now()+5000};
      posts.splice(0, posts.length, ...next.filter((post): post is Post => post !== null));
      litDays.clear(); posts.forEach(post => litDays.add(parseDate(post.date)));
      numbers.posts = list.totalPublished;
      homeIntegrationReady = true;
      integrationError = '';
      return true;
    } catch (error) {
      if (request !== generation) return false;
      clearPosts(); integrationError = error instanceof Error ? error.message : 'Content unavailable';
      return false;
    }
  })();
  notesTask = pending;
  void pending.finally(() => { if (notesTask === pending) notesTask = null; });
  return pending;
}
export async function loadIntegration({ includeNotes = true }: { includeNotes?: boolean } = {}): Promise<boolean> {
  const request = ++generation;
  clearIntegratedArticle();
  reader.clear(); notesTask = null; homeIntegrationReady = false; clearPosts();
  bootstrapController?.abort();
  const controller = new AbortController(); bootstrapController = controller;
  const deadline = setTimeout(() => controller.abort(new DOMException('Account bootstrap timed out','TimeoutError')),12000);
  integrationError = '';
  updateIntegratedCommunity(null);
  let receivedIdentity = false;
  try {
    const response = await fetch('/api/content?view=bootstrap', { credentials: 'same-origin', cache: 'no-store',signal:controller.signal });
    if (!response.ok) throw new Error(`Bootstrap ${response.status}`);
    const value: unknown = await response.json();
    const { parseAccountState } = await import('./integration-account.ts');
    const account = parseAccountState(value);
    if (request !== generation) return false;
    integrationState = account; receivedIdentity = true;
    if (!object(value) || !object(value.collections)) throw new Error('Invalid content bootstrap');
    const notes = object(value.collections.notes) ? value.collections.notes : null;
    numbers.posts = typeof notes?.totalPublished === 'number' ? notes.totalPublished : 0;
    numbers.tags = typeof notes?.tagCount === 'number' ? notes.tagCount : 0;
    numbers.latest = integratedDateLabel(notes?.latest) || '—';
    for (const section of sections) {
      const metadata = value.collections[section.id];
      if (!object(metadata) || typeof metadata.totalPublished !== 'number' || !Number.isSafeInteger(metadata.totalPublished) || metadata.totalPublished < 0) continue;
      const count = metadata.totalPublished;
      section.status = { zh: `${count} 项已发布`, en: `${count} published` };
      section.open = count > 0;
    }
    updateIntegratedCommunity(value);
    if (object(value.profile)) {
      if (typeof value.profile.signature === 'string') profile.signature = value.profile.signature;
      if (typeof value.profile.bio === 'string' && value.profile.bio) profile.tagline = { zh: value.profile.bio, en: value.profile.bio };
    }
    clearTimeout(deadline);
    if (bootstrapController === controller) bootstrapController = null;
    return includeNotes ? await loadIntegratedNotes() : true;
  } catch (error) {
    if (request !== generation) return false;
    if (!receivedIdentity) integrationState = { reader: null, author: null };
    clearPosts(); integrationError = error instanceof Error ? error.message : 'Content unavailable';
    return false;
  } finally {
    clearTimeout(deadline);
    if (bootstrapController === controller) bootstrapController = null;
  }
}
export async function ensureIntegratedPost(slug: string): Promise<number> {
  const request = generation;
  const value: unknown = await primeIntegratedArticle(slug);
  if (request !== generation) throw new DOMException('Stale content request', 'AbortError');
  const post = object(value) ? parseIntegratedPost(value.item) : null;
  if (!post || post.slug !== slug) { clearIntegratedArticle(); throw new Error('Invalid article detail'); }
  const index = posts.findIndex(p => p.slug === slug);
  if (index < 0) { posts.push(post); return posts.length - 1; }
  posts[index] = post; return index;
}

/** Translate links emitted by the existing reader forms; no second auth router. */
export function legacyIntegrationPath(hash: string, search = ''): string | null {
  if (!hash.startsWith('#/')) return null;
  const [raw, query] = hash.slice(2).split('?');
  const [page, ...rest] = raw.split('/');
  const base: Record<string, string> = { home:'/',notes:'/blog',note:'/blog',works:'/work',work:'/work',resources:'/learning',software:'/software','resource-center':'/resources',account:'/account',verify:'/verify',reset:'/reset',community:'/community' };
  if (page === 'admin') return rest.length ? null : '/admin-console/';
  if (!Object.hasOwn(base,page) || rest.length > 1 || rest.length && !['note','work','works','resources','software','resource-center','verify','reset'].includes(page)) return null;
  if (rest.length) {
    let segment: string;
    try { segment = decodeURIComponent(rest[0]); } catch { return null; }
    if (!segment || /[\\/\u0000-\u0020]/.test(segment)) return null;
  }
  const merged = new URLSearchParams(search);
  for (const [key,value] of new URLSearchParams(query)) merged.set(key,value);
  if (!['account','verify','reset'].includes(page)) {
    for (const key of ['return','invite','adminReturn']) merged.delete(key);
  }
  return base[page] + (rest.length ? `/${rest[0]}` : '') + (merged.size ? `?${merged}` : '');
}

export function safeIntegrationReturn(target: string | null, origin: string): string | null {
  if (!target?.startsWith('/') || target.startsWith('//') || /[\\\u0000-\u0020]/.test(target)) return null;
  try {
    const url = new URL(target,origin);
    return url.origin === origin && !/^\/account(?:\/|$)/.test(url.pathname) ? url.pathname+url.search+url.hash : null;
  } catch { return null; }
}
