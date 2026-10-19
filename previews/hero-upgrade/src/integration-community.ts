// The existing community keeps its own UI and identity handoff. This adapter
// exposes that entry only after the original bootstrap has confirmed it.
import { createCommunityEntry, communityEntryPost } from '../../../src/community-entry.ts';
import type { CommunityEntryState } from '../../../src/community-entry.ts';
import type { AccountState } from './integration-account.ts';
import type { IntegratedCommunity } from './integration-runtime.ts';
import { isLocalIntegration, isSiteIntegration } from './integration-context.ts';
import { esc } from './util.ts';

type Options = {
  english: () => boolean;
  readState: () => AccountState;
  readCommunity: () => IntegratedCommunity;
  navigate: (path: string) => void;
};

export function mountIntegratedCommunity(root: HTMLElement, options: Options): { dispose: () => void } {
  const doc = root.ownerDocument, view = doc.defaultView;
  if (!view || !isSiteIntegration(doc)) return { dispose() {} };
  const t = (zh: string, en: string) => options.english() ? en : zh;
  const context = options.readCommunity();
  // Loopback previews never consume production handoff destinations, even if
  // an unexpected bootstrap response contains the public production origin.
  const bridge = context.mode === 'bridge' && !context.local && !isLocalIntegration(doc);
  const legacy = context.mode === 'legacy';
  const post = communityEntryPost(view.location.search);
  const returnPath = '/community' + (post ? `?post=${post}` : '');
  const accountPath = `/account?return=${encodeURIComponent(returnPath)}`;
  const authenticated = () => Boolean(options.readState().reader || options.readState().author);
  const status = bridge || legacy ? t('现有社区', 'Existing community') : context.local || isLocalIntegration(doc) ? t('本地未连接', 'Not connected locally') : t('暂未开放', 'Not open yet');
  const title = bridge || legacy ? t('进入现有社区。', 'Join the community.') : context.local || isLocalIntegration(doc) ? t('本地社区桥接未启用。', 'The local community bridge is disabled.') : t('社区暂未开放。', 'The community is not open yet.');
  const description = bridge ? t('沿用原站账号进入现有社区，讨论、星尘与个人资料继续由原社区提供。', 'Use your existing account. Discussions, stardust and profiles continue in the original community.')
    : legacy ? t('现有社区继续使用原版界面，账号与社区内容沿用原流程。', 'The existing community continues in its original interface, with the same account and content.')
    : context.local || isLocalIntegration(doc) ? t('当前本地联调没有启用社区身份桥接，无法在这里验证进入社区；这里不会连接线上社区。', 'This local preview has no community identity bridge, so entry cannot be verified here. It does not connect to the live community.')
    : t('原站服务目前未开放社区入口，开放状态以原站后台为准。', 'The original service currently has no open community entry. Availability follows its server configuration.');
  root.innerHTML = `<div class="page" data-page="community"><header class="page-head container"><nav class="page-crumb" aria-label="${t('面包屑','Breadcrumb')}"><a href="/">${t('首页','Home')}</a><span aria-hidden="true">/</span><span aria-current="page">${t('社区交流','Community')}</span><small>/community</small></nav><span class="page-watermark" aria-hidden="true">CONNECT</span><div class="page-head-row"><div class="heading"><p class="eyebrow"><i></i><span>COMMUNITY / 05</span></p><h1 class="page-title">${t('社区交流。','Community.')}</h1><p class="body">${esc(description)}</p></div><span class="status">${status}</span></div></header><div class="container page-body"><section class="publication-status" data-page-card data-page-reveal data-integrated-community><span class="status-monogram" aria-hidden="true">05</span><div class="publication-copy"><p class="caption-meta">COMMUNITY / ${bridge || legacy ? 'ENTRY' : 'STATUS'}</p><h2>${title}</h2><p class="body" role="status" aria-live="polite" data-community-entry-status></p><div class="page-actions" data-community-entry-actions></div></div></section></div></div>`;
  const actions = root.querySelector<HTMLElement>('[data-community-entry-actions]')!;
  const feedback = root.querySelector<HTMLElement>('[data-community-entry-status]')!;
  const signIn = () => `<a class="btn primary" href="${esc(accountPath)}" data-community-account>${t('登录后进入社区', 'Sign in to enter')} ↗</a>`;
  function display(state: CommunityEntryState) {
    if (bridge) {
      feedback.textContent = state === 'auth' ? t('请先登录原站账号，再进入社区。', 'Sign in with your existing account to continue.')
        : state === 'error' ? t('暂时无法进入社区，请重试。', 'Community entry is unavailable. Please retry.')
        : state === 'pending' || state === 'leaving' ? t('正在验证社区身份…', 'Verifying your community identity…')
        : t('点击后通过原站验证身份，再进入现有社区。', 'Continue through the original account verification to enter the community.');
      if (state === 'auth' || !authenticated()) actions.innerHTML = signIn();
      else {
        let button = actions.querySelector<HTMLButtonElement>('[data-community-entry-enter]');
        if (!button) { actions.innerHTML = `<button class="btn primary" type="button" data-community-entry-enter>${t('进入现有社区', 'Enter the community')} ↗</button>`; button = actions.querySelector<HTMLButtonElement>('button')!; }
        button.disabled = state === 'pending' || state === 'leaving';
      }
    } else {
      feedback.textContent = description;
      actions.innerHTML = legacy ? `<a class="btn primary" href="/original${post ? `?post=${post}` : ''}#/community/home" data-community-original>${t('进入现有社区', 'Enter the community')} ↗</a>`
        : `<a class="btn ghost" href="/blog">${t('先读博客', 'Read the journal')} →</a>`;
    }
  }
  const entry = createCommunityEntry({
    config: () => bridge ? { communityDestination: options.readCommunity().destination } : null,
    post: () => communityEntryPost(view.location.search),
    request: (url, init) => fetch(url, init),
    fadeOut: async () => {},
    navigate: url => {
      const current = new URL(view.location.href);current.searchParams.delete('post');
      view.history.replaceState(view.history.state, '', current.pathname + current.search + current.hash);
      options.navigate(url);
    },
    changed: display,
  });
  const click = (event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || !(event.target instanceof view.Element)) return;
    const button = event.target.closest<HTMLButtonElement>('[data-community-entry-enter]');
    if (button && root.contains(button) && !button.disabled) { event.preventDefault(); void entry.enter(authenticated()); return; }
    const account = event.target.closest<HTMLAnchorElement>('[data-community-account]');
    if (account && root.contains(account)) { event.preventDefault(); options.navigate(accountPath); }
  };
  const restore = (event: PageTransitionEvent) => { if (event.persisted) { entry.cancel(); display('idle'); } };
  display('idle');root.addEventListener('click', click);view.addEventListener('pageshow', restore);
  return { dispose() { entry.cancel();root.removeEventListener('click', click);view.removeEventListener('pageshow', restore); } };
}
