// One route authorization may hand its detail to the Reader that opens next.
// This is a short-lived, single-use handoff, never a cross-navigation body cache.
// Requests, deadlines and cancellation remain owned by the original reader.
import { contentQuery, createContentReader } from '../../../src/content-reader.ts';

const reader = createContentReader(fetch, { maxEntries: 0 });
let generation = 0;
let prepared: { slug: string; value: unknown } | null = null;
let expiry: ReturnType<typeof setTimeout> | null = null;

function discardPrepared() {
  if (expiry !== null) clearTimeout(expiry);
  expiry = null;
  prepared = null;
}

export function clearIntegratedArticle() {
  generation++;
  discardPrepared();
  reader.clear();
}

async function requestDetail(slug: string): Promise<unknown> {
  const request = ++generation;
  const value: unknown = await reader.read(contentQuery({ page: 'note', id: slug })!);
  if (request !== generation) throw new DOMException('Stale article request', 'AbortError');
  return value;
}

export async function primeIntegratedArticle(slug: string): Promise<unknown> {
  discardPrepared();
  const value = await requestDetail(slug);
  prepared = { slug, value };
  // A cancelled route must not leave a privately authorized body waiting around.
  expiry = setTimeout(discardPrepared, 1000);
  return value;
}

export function readIntegratedArticle(slug: string): Promise<unknown> {
  const ready = prepared;
  discardPrepared();
  if (ready?.slug === slug) {
    const request = generation;
    return Promise.resolve().then(() => {
      if (request !== generation) throw new DOMException('Stale article handoff', 'AbortError');
      return ready.value;
    });
  }
  return requestDetail(slug);
}
