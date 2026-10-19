// Thin view adapter: all credential, verification, upload, profile and membership
// behavior stays in the formal site's reader module. No second auth client.
import { readerPage, mountReaderUI } from '../../../src/reader-ui.ts';
import { adminConsoleHref } from '../../../src/admin-console-navigation.ts';
import { escapeHTML } from '../../../src/core.ts';

export type ReaderIdentity = NonNullable<Parameters<typeof readerPage>[2]>;
export type AuthorIdentity = NonNullable<Parameters<typeof readerPage>[5]>;
export interface AccountState {
  reader: ReaderIdentity | null;
  author: AuthorIdentity | null;
  readerRegistrationEnabled?: boolean;
}
export type AccountPage = 'account' | 'verify' | 'reset';
export interface AccountIntegrationOptions {
  english: () => boolean;
  readState: () => AccountState;
  onIdentity: () => Promise<void> | void;
  navigate: (path: string) => void;
  changed?: () => Promise<void> | void;
}

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** Project only checked server identity fields; UI data never grants access. */
export function parseAccountState(value: unknown): AccountState {
  if (!object(value)) throw new Error('Invalid account bootstrap.');
  let reader: ReaderIdentity | null = null;
  let author: AuthorIdentity | null = null;
  if (value.reader !== undefined && value.reader !== null) {
    if (!object(value.reader) || typeof value.reader.nickname !== 'string' || typeof value.reader.email !== 'string') throw new Error('Invalid reader identity.');
    const source = value.reader;
    reader = { nickname: source.nickname as string, email: source.email as string };
    for (const key of ['uid', 'phone', 'signature', 'role', 'message'] as const) {
      const field = source[key];
      if (field !== undefined) {
        if (typeof field !== 'string') throw new Error('Invalid reader identity field.');
        reader[key] = field;
      }
    }
    for (const key of ['pendingNickname', 'pendingSignature', 'avatar', 'frame', 'frameImage', 'vipUntil'] as const) {
      const field = source[key];
      if (field !== undefined) {
        if (field !== null && typeof field !== 'string') throw new Error('Invalid reader identity field.');
        reader[key] = field;
      }
    }
    if (reader.vipUntil && !Number.isFinite(Date.parse(reader.vipUntil))) throw new Error('Invalid membership expiry.');
    for (const key of ['pendingAvatar', 'vip', 'reviewPending'] as const) {
      const field = source[key];
      if (field !== undefined) {
        if (typeof field !== 'boolean') throw new Error('Invalid reader identity flag.');
        reader[key] = field;
      }
    }
    if (source.ownerReader !== undefined) {
      if (source.ownerReader !== true) throw new Error('Invalid owner reader flag.');
      reader.ownerReader = true;
    }
  }
  if (value.author !== undefined && value.author !== null) {
    if (!object(value.author) || value.author.name !== undefined && typeof value.author.name !== 'string') throw new Error('Invalid author identity.');
    author = typeof value.author.name === 'string' ? { name: value.author.name } : {};
  }
  if (value.readerRegistrationEnabled !== undefined && typeof value.readerRegistrationEnabled !== 'boolean') throw new Error('Invalid registration setting.');
  return { reader, author, readerRegistrationEnabled: value.readerRegistrationEnabled as boolean | undefined };
}

export function renderAccountPage(page: AccountPage, id: string, state: AccountState, english = false): string {
  return `<div class="integration-account" data-account-surface>${readerPage(page, id, state.reader, english, state.readerRegistrationEnabled !== false, state.author)}</div>`;
}

/** Mount once for this document, just as the original app mounts readerUI once. */
export function mountAccountIntegration(options: AccountIntegrationOptions) {
  let currentPage = 'home';
  let currentId = '';
  let pendingIdentity: Promise<void> = Promise.resolve();
  const failure = (error: unknown) => {
    const message = document.querySelector('[data-reader-message]');
    if (message) message.textContent = error instanceof Error ? error.message : options.english() ? 'Could not refresh your account. Please retry.' : '暂时无法刷新账号，请重试。';
  };
  const identityChanged = () => {
    // The runtime clears protected caches synchronously before awaiting its own
    // same-origin bootstrap. Wait for it before rerendering the account page.
    try { pendingIdentity = Promise.resolve(options.onIdentity()).catch(failure); }
    catch (error) { failure(error); pendingIdentity = Promise.resolve(); }
  };
  const readerUI = mountReaderUI({
    english: options.english,
    readIdentity: () => options.readState().reader,
    onIdentity(value) {
      window.dispatchEvent(new CustomEvent('reader:identity', { detail: value }));
      identityChanged();
    },
    render: async () => { await pendingIdentity; await options.changed?.(); },
  });
  // The original sign-in form recognizes author credentials itself. Keep that
  // event contract, then route its author button to the existing console.
  window.addEventListener('author:identity', identityChanged);
  document.addEventListener('click', event => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('[data-account-surface] [data-author-login]')) {
      event.preventDefault();
      options.navigate(adminConsoleHref());
    }
  });
  return {
    route(page: string, id = '') {
      currentPage = page;
      currentId = id;
      readerUI.route(page, id);
    },
    refresh() { readerUI.route(currentPage, currentId); },
    navMarkup() {
      const state = options.readState();
      const english = options.english();
      const label = state.reader ? state.reader.nickname : state.author ? (english ? 'Owner' : '作者') : (english ? 'Sign in' : '登录');
      const vip = state.reader?.vip === true ? '<span class="account-nav-vip">VIP</span>' : '';
      return `<a class="account-nav-link" href="/account" data-account-nav aria-label="${english ? 'Your account' : '我的账号'}"><span>${escapeHTML(label)}</span>${vip}</a>${state.author ? `<a class="account-nav-console" href="${adminConsoleHref()}" data-account-console>${english ? 'Console' : '作者后台'} <span aria-hidden="true">↗</span></a>` : ''}`;
    },
  };
}
