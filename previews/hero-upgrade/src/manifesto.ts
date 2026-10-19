/**
 * Native DOM adaptation of Dingxin Tao's MIT ScrollHighlight and split.ts,
 * DingxinTao0417/tdx-portfolio @ c73bc4966f0ba808b978e22eccf5a063fc649751.
 * Sources: src/components/projects/scroll-highlight.{tsx,module.css} and
 * src/components/fx/split.ts. Copyright (c) 2026 Dingxin Tao.
 * License: ../vendor/tdx/LICENSE. GSAP ScrollTrigger replaces Motion useScroll;
 * the source auto-tokenization, 90% / 55% reading zone and single --p clock
 * remain. Only the site's existing bio and emphasis words are rendered.
 */
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { profile } from './content';
import { lang } from './i18n';
import { clamp, esc } from './util';

gsap.registerPlugin(ScrollTrigger);

type ManifestoOptions = { reduced: boolean };
type SplitSegment = { type: 'space' } | { type: 'word'; units: { text: string; index: number }[] };

// Fixed upstream split.ts, auto mode. Latin words remain unbroken; CJK closing
// punctuation stays attached to the preceding glyph (kinsoku line breaking).
const CJK_RANGE = '\u2e80-\u2fff\u3000-\u303f\u3040-\u30ff\u3100-\u312f\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\ufe30-\ufe4f\uff00-\uffef';
const CLOSING = '\u3002\uff0c\u3001\uff1b\uff1a\uff1f\uff01\uff09\u300d\u300f\u3011\u300b\u3009\u2026\u2014\uff05,.;:?!)\\]}\u201d\u2019';
const OPENING = '\uff08\u300c\u300e\u3010\u300a\u3008(\\[{\u201c\u2018';
const TOKENS = new RegExp(`\\s+|[${OPENING}]*(?:[${CJK_RANGE}][${CLOSING}]*|[^\\s${CJK_RANGE}]+[${CLOSING}]*)`, 'g');

function splitText(text: string): SplitSegment[] {
  const segments: SplitSegment[] = [];
  let index = 0;
  for (const token of text.match(TOKENS) ?? []) {
    if (/^\s+$/.test(token)) {
      if (segments.length && segments.at(-1)?.type !== 'space') segments.push({ type: 'space' });
      continue;
    }
    segments.push({ type: 'word', units: [{ text: token, index: index++ }] });
  }
  if (segments.at(-1)?.type === 'space') segments.pop();
  return segments;
}

export function mountManifesto(root: HTMLElement, options: ManifestoOptions) {
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = options.reduced || motion.matches;
  let enabled = true;
  let windowFocused = true;
  let disposed = false;
  let generation = 0;
  let trigger: ScrollTrigger | null = null;
  const cleanups: (() => void)[] = [];
  const available = () => !disposed && enabled && windowFocused && !document.hidden && !reduced;

  function listen(target: EventTarget, type: string, handler: () => void) {
    target.addEventListener(type, handler);
    cleanups.push(() => target.removeEventListener(type, handler));
  }
  function stop() {
    generation++;
    const previous = trigger;
    trigger = null;
    previous?.kill();
    root.removeAttribute('data-live');
    root.style.setProperty('--p', '1');
  }
  function sync() {
    if (!available()) { stop(); return; }
    if (trigger) return;
    const current = ++generation;
    const update = (self: ScrollTrigger) => {
      if (current !== generation || !available()) return;
      root.style.setProperty('--p', (Number.isFinite(self.progress) ? clamp(0, 1, self.progress) : 1).toFixed(4));
    };
    // ScrollTrigger computes the present reading position synchronously. Write
    // it before enabling the CSS mask; translations never flash back to zero.
    const created = ScrollTrigger.create({
      trigger: root,
      start: 'top 90%',
      end: 'bottom 55%',
      scrub: true,
      onUpdate: update,
      onRefresh: update,
    });
    if (current !== generation || !available()) { created.kill(); return; }
    trigger = created;
    update(created);
    root.setAttribute('data-live', '');
  }
  function refresh() {
    if (disposed) return;
    stop();
    const language = lang();
    const text = profile.bio.map(line => line[language]).join(language === 'en' ? ' ' : '');
    const keys = profile.bioKeys[language];
    const emphasized = new Set<number>();
    for (const key of keys) {
      for (let at = text.indexOf(key); at >= 0; at = text.indexOf(key, at + key.length)) {
        for (let index = at; index < at + key.length; index++) emphasized.add(index);
      }
    }
    let cursor = 0;
    let count = 0;
    const visual = splitText(text).map(segment => {
      if (segment.type === 'space') return ' ';
      const units = segment.units.map(unit => {
        const start = text.indexOf(unit.text, cursor);
        cursor = start + unit.text.length;
        const key = Array.from({ length: unit.text.length }, (_, index) => start + index).some(index => emphasized.has(index));
        count++;
        return `<span class="manifesto-unit${key ? ' key' : ''}" style="--i:${unit.index}">${esc(unit.text)}</span>`;
      }).join('');
      return `<span class="manifesto-word">${units}</span>`;
    }).join('');
    root.classList.add('manifesto-scrub');
    root.lang = language === 'en' ? 'en' : 'zh-CN';
    root.style.setProperty('--n', String(count));
    root.innerHTML = `<span class="visually-hidden">${esc(text)}</span><span class="manifesto-visual" aria-hidden="true">${visual}</span>`;
    const alternate = root.closest('section')?.querySelector<HTMLElement>('#manifesto-alt');
    if (alternate) {
      const other = language === 'en' ? 'zh' : 'en';
      alternate.textContent = profile.bio.map(line => line[other]).join(other === 'en' ? ' ' : '');
      alternate.lang = other === 'en' ? 'en' : 'zh-CN';
    }
    sync();
  }

  listen(window, 'blur', () => { windowFocused = false; sync(); });
  listen(window, 'focus', () => { windowFocused = true; sync(); });
  listen(document, 'visibilitychange', sync);
  listen(motion, 'change', () => { reduced = motion.matches; sync(); });
  refresh();

  return {
    refresh,
    setActive(value: boolean) { if (disposed || enabled === value) return; enabled = value; sync(); },
    dispose() {
      if (disposed) return;
      disposed = true;
      cleanups.forEach(cleanup => cleanup());
      stop();
    },
  };
}
