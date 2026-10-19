/** Thin access copy only; permissions and the author contact remain in the original modules. */
import { vipContactURL } from '../../../src/vip-book-prompt.mjs';
import { esc } from './util';

export function vipContactAction(english = false): string {
  return `<a class="btn primary" data-vip-contact href="${esc(vipContactURL)}" target="_blank" rel="noopener noreferrer">${english ? 'Contact the author to activate VIP' : '联系作者开通 VIP'}</a>`;
}

export function integratedAccessContent(status: 401 | 403 | 404, english: boolean, returnPath: string): string {
  const t = (zh: string, en: string) => english ? en : zh;
  const title = status === 401 ? t('登录后，继续探索。','Sign in to continue.') : status === 403 ? t('当前内容需要相应权限。','Check your membership.') : t('暂时无法打开内容。','This content is unavailable.');
  const message = status === 403 ? t('VIP 内容需要有效会员；权限由原站后台核验。','VIP content requires an active membership, verified by the original service.') : status === 401 ? t('使用原来的账号登录，返回后即可继续。','Sign in with your existing account, then return to continue.') : t('内容可能尚未发布或已撤回，请返回目录或重试。','This content may not be published or may have been withdrawn. Return to the collection or try again.');
  return `<p class="eyebrow">SANSPHASE / YOUR ACCESS</p><h1>${title}</h1><p>${message}</p><div class="page-actions">${status===403?vipContactAction(english):''}<a class="btn ${status===403?'ghost':'primary'}" href="/account?return=${encodeURIComponent(returnPath)}">${t('我的账号','Your account')} ↗</a><a class="btn ghost" href="/blog">${t('阅读博客','Read the journal')} →</a></div>`;
}
