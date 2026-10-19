/** Integration is opt-in per document, and must be served at that origin.
 * A URL parameter or a stored browser flag cannot enable authenticated APIs.
 */
function integrationMode(doc:Document|undefined):'local'|'production'|null {
  if (!doc)return null;
  const marker=doc.getElementById('site-integration'),origin=doc.defaultView?.location.origin;
  if (!marker || !origin) return null;
  try {
    const value:unknown=JSON.parse(marker.textContent||'null');
    return value&&typeof value==='object'&&!Array.isArray(value)&&'mode' in value&&(value.mode==='local'||value.mode==='production')&&'origin' in value&&value.origin===origin?value.mode:null;
  } catch { return null; }
}
export function isSiteIntegration(doc:Document|undefined=typeof document==='undefined'?undefined:document):boolean {
  return integrationMode(doc)!==null;
}
export function isLocalIntegration(doc:Document|undefined=typeof document==='undefined'?undefined:document):boolean {
  return integrationMode(doc)==='local';
}
export type LocalIntegrationMetadata = {dataSource:'existing-local'|'isolated-test'|'unknown'};
/** Display-only whitelist; private marker fields never reach the UI. */
export function localIntegrationMetadata(doc:Document|undefined=typeof document==='undefined'?undefined:document):LocalIntegrationMetadata|null {
  if (!isLocalIntegration(doc))return null;
  try {
    const value:unknown=JSON.parse(doc!.getElementById('site-integration')?.textContent||'null');
    if (!value||typeof value!=='object'||Array.isArray(value))return null;
    return {dataSource:!Object.hasOwn(value,'dataSource')?'isolated-test':'dataSource' in value&&value.dataSource==='existing-local'?'existing-local':'unknown'};
  } catch { return null; }
}
export function localContentURL(kind:'works'|'resources'|'software'|'resource-center',id?:string):string {
  const base={works:'/work',resources:'/learning',software:'/software','resource-center':'/resources'}[kind];
  if (!base)throw new TypeError('Unsupported integration collection');
  return base+(id?`/${encodeURIComponent(id)}`:'');
}
