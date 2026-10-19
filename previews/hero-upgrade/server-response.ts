// Node's maintained zlib implementation handles encoding; only immutable static
// assets retain compressed representations. Catalogs/identity/errors never do.
import type { ServerResponse } from 'node:http';
import { createHash } from 'node:crypto';
import { brotliCompress, gzip, constants } from 'node:zlib';
import { promisify } from 'node:util';

const brotli = promisify(brotliCompress), gzipBody = promisify(gzip);
export type StaticCache = 'immutable' | 'revalidate';
const compressed = new Map<string, Promise<Buffer>>();

export function encodingFor(header: string): 'br' | 'gzip' | null {
  const values = header.toLowerCase().split(',').map(value => {
    const [name, ...parameters] = value.trim().split(';');
    const quality = parameters.find(value => value.trim().startsWith('q='))?.trim().slice(2);
    const q = quality === undefined ? 1 : Number(quality);
    return { name, q: Number.isFinite(q) && q >= 0 && q <= 1 ? q : 0 };
  });
  const q = (name: string) => values.find(value => value.name === name)?.q ?? values.find(value => value.name === '*')?.q ?? 0;
  const br = q('br'), gz = q('gzip');
  return br > 0 && br >= gz ? 'br' : gz > 0 ? 'gzip' : null;
}

export async function finishResponse(res: ServerResponse, status: number, type: string, body: string | Uint8Array, head = false, cache?: StaticCache) {
  if (res.destroyed || res.writableEnded) return;
  const bytes = Buffer.isBuffer(body) ? body : Buffer.from(body);
  // A weak validator intentionally covers gzip, Brotli and identity variants.
  const etag = cache && status === 200 ? `W/"${createHash('sha256').update(bytes).digest('base64url')}"` : undefined;
  const headers: Record<string, string> = {
    'content-type': type, 'cache-control': cache === 'immutable' ? 'public, max-age=31536000, immutable' : cache ? 'no-cache' : 'no-store',
    'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin',
  };
  if (etag) headers.etag = etag;
  if (status === 405) headers.allow = 'GET, HEAD';
  const accepts = res.req.headers['accept-encoding'];
  const encoding = bytes.byteLength >= 1024 && /^(?:text\/|application\/(?:json|javascript))/.test(type)
    ? encodingFor(Array.isArray(accepts) ? accepts.join(',') : accepts ?? '') : null;
  if (/^(?:text\/|application\/(?:json|javascript))/.test(type)) headers.vary = 'Accept-Encoding';
  const validator = res.req.headers['if-none-match'];
  if (etag && typeof validator === 'string' && validator.split(',').some(value => value.trim() === '*' || value.trim().replace(/^W\//, '') === etag.replace(/^W\//, ''))) {
    res.writeHead(304, headers); res.end(); return;
  }
  let output = bytes;
  if (encoding) {
    const key = cache === 'immutable' && etag ? `${encoding}:${etag}` : '';
    let pending = key ? compressed.get(key) : undefined;
    if (!pending) {
      pending = encoding === 'br' ? brotli(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 4 } }) : gzipBody(bytes, { level: 6 });
      if (key) {
        // The build includes a finite set of immutable files. Retain at most
        // 32 encodings so live rebuilds cannot grow this development cache.
        if (compressed.size >= 32) compressed.delete(compressed.keys().next().value!);
        compressed.set(key, pending);
        void pending.catch(() => compressed.delete(key));
      }
    }
    try { output = await pending; headers['content-encoding'] = encoding; }
    catch { output = bytes; }
  }
  if (res.destroyed || res.writableEnded) return;
  headers['content-length'] = String(output.byteLength);
  res.writeHead(status, headers); res.end(head ? undefined : output);
}
