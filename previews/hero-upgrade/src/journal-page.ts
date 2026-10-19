/**
 * Thin DOM adaptation of TDX About / Portrait / Story / Timeline / Publications,
 * DingxinTao0417/tdx-portfolio @ c73bc4966f0ba808b978e22eccf5a063fc649751.
 * MIT, copyright (c) 2026 Dingxin Tao. See vendor/tdx/LICENSE.
 * The reference supplies the composition and interaction; this journal uses
 * SANSPHASE's public articles and existing editorial groupings, not a biography.
 */
import { posts, profile, sections, numbers } from './content';
import { practices } from './practice-content';
import { lang, pick } from './i18n';
import { esc, pad2 } from './util';
import { icon } from './icons';
import { isSiteIntegration, localContentURL } from './integration-context';

const arrow = `<i aria-hidden="true">${icon('arrow-up-right')}</i>`;
const copy = (zh: string, en: string) => lang() === 'en' ? en : zh;

// Fixed upstream split.ts auto mode, also used by the existing manifesto.
const CJK_RANGE = '\u2e80-\u2fff\u3000-\u303f\u3040-\u30ff\u3100-\u312f\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\ufe30-\ufe4f\uff00-\uffef';
const CLOSING = '\u3002\uff0c\u3001\uff1b\uff1a\uff1f\uff01\uff09\u300d\u300f\u3011\u300b\u3009\u2026\u2014\uff05,.;:?!)\\]}\u201d\u2019';
const OPENING = '\uff08\u300c\u300e\u3010\u300a\u3008(\\[{\u201c\u2018';
const TOKENS = new RegExp(`\\s+|[${OPENING}]*(?:[${CJK_RANGE}][${CLOSING}]*|[^\\s${CJK_RANGE}]+[${CLOSING}]*)`, 'g');

function reading(text: string) {
  let index = 0;
  const markup = (text.match(TOKENS) ?? []).map(token => /^\s+$/.test(token) ? ' '
    : `<span class="journal-word"><span class="journal-unit" style="--journal-unit:${index++}">${esc(token)}</span></span>`).join('');
  return { count: index, markup };
}

/**
 * Inner fragment; the existing router supplies its .page wrapper and Reader.
 * catalogMarkup is the Publications-style article index. Query state and
 * controls remain owned by the page module; no legacy blog layout is embedded.
 */
export function renderJournalPage(articlePath: (index: number) => string, catalogMarkup: string): string {
  const local = isSiteIntegration();
  const description = pick(sections[0].description);
  const paragraphs = [description, ...practices.map(practice => pick(practice.summary))];
  const units = reading(description);
  const ordered = posts.map((p, i) => ({ p, i })).sort((a, b) => a.p.date.localeCompare(b.p.date));
  const latest = ordered[ordered.length - 1];
  return `<div class="journal-page" data-journal-page>
    <header class="journal-hero-full" data-journal-ambient data-journal-section>
      <nav class="journal-crumb container" aria-label="${copy('面包屑', 'Breadcrumb')}"><a href="/" data-journal-focus="home">${copy('首页', 'Home')}</a><span aria-hidden="true">/</span><span aria-current="page">${copy('博客', 'Blog')}</span><small aria-hidden="true">SANSPHASE / JOURNAL</small></nav>
      <div class="journal-hero-grid container"><div class="journal-hero-copy" data-journal-hero-copy>
        <p class="journal-eyebrow" data-journal-enter>${copy('实践 · 学习 · 复盘', 'PRACTICE · LEARN · REFLECT')}</p>
        <h1 data-journal-enter>${copy('博客，', 'The journal. ')}<em>${copy('记录实践。', 'Notes in progress.')}<svg class="journal-underline" viewBox="0 0 300 14" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="M3 9.6C58 4.9 127 3.2 196 5.3S283 9.6 297 4.4" pathLength="1"/></svg></em></h1>
        <p class="journal-intro" data-journal-enter>${esc(pick(profile.tagline))}<br>${esc(description)}</p>
      </div>${latest ? `<a class="journal-feature" href="${esc(articlePath(latest.i))}" data-post="${latest.i}" data-journal-feature data-journal-enter="feature" data-journal-focus="featured-${latest.p.slug}" aria-label="${esc(`${copy('阅读最新文章：', 'Read the latest: ')}${pick(latest.p.title)}`)}">
        <div class="journal-feature-tilt"><div class="journal-feature-media"><img src="${esc(latest.p.cover)}" alt="" decoding="async" fetchpriority="high" draggable="false"><span class="journal-scanlines" aria-hidden="true"></span><span class="journal-foil" aria-hidden="true"></span><span class="journal-glare" aria-hidden="true"></span><span class="journal-scan-band" aria-hidden="true"></span><div class="journal-feature-caption"><h2>${esc(pick(latest.p.title))}</h2><p class="journal-feature-foot"><time datetime="${latest.p.date.replaceAll('.', '-')}">${latest.p.date}</time><span>${copy('阅读原文', 'READ NOTE')}${arrow}</span></p></div><span class="journal-feature-beam" aria-hidden="true"></span></div>
        <span class="journal-feature-edge" aria-hidden="true"></span><div class="journal-feature-hud" aria-hidden="true">${['tl','tr','bl','br'].map((corner, index) => `<span class="journal-corner" data-c="${corner}" style="--journal-corner:${index}"></span>`).join('')}</div><div class="journal-feature-chips" aria-hidden="true"><span class="journal-feature-chip"><i></i><span data-journal-count>${pad2(numbers.posts)}</span> ${copy('篇公开文章', 'PUBLIC NOTES')}</span><span class="journal-feature-chip">${copy('最新文章', 'LATEST NOTE')}</span></div></div>
      </a>` : `<div class="journal-feature"><p class="journal-intro">${copy('文章发布后会出现在这里。', 'Published notes will appear here.')}</p></div>`}</div>
    </header>
    <section class="journal-story container" data-journal-section data-journal-story aria-labelledby="journal-story-title">
      <aside class="journal-story-rail"><h2 id="journal-story-title" class="journal-eyebrow">${copy('主题导读', 'READING THE JOURNAL')}</h2><div class="journal-story-meter" aria-hidden="true"><span class="journal-story-rule"><i></i></span><span class="journal-counter"><span class="journal-digits" data-journal-current>${paragraphs.map((_, i) => `<span>${pad2(i + 1)}</span>`).join('')}</span></span><span>/ ${pad2(paragraphs.length)}</span></div></aside>
      <div class="journal-story-copy"><p class="journal-story-lead" data-journal-story-lead data-journal-paragraph="0" style="--journal-units:${units.count}"><span class="visually-hidden">${esc(description)}</span><span aria-hidden="true">${units.markup}</span></p>${paragraphs.slice(1).map((paragraph, i) => `<p class="journal-story-paragraph" data-journal-paragraph="${i + 1}" data-journal-enter>${esc(paragraph)}</p>`).join('')}</div>
    </section>
    <section id="journal-records" class="journal-records" data-journal-section aria-labelledby="journal-records-title"><div class="container">
      <div class="journal-section-heading" data-journal-enter><p class="journal-eyebrow">${copy('公开记录', 'PUBLISHED FIELD NOTES')}</p><h2 id="journal-records-title">${copy('每一次实践，', 'Each experiment,')} <em>${copy('都有来路。', 'with its record.')}</em></h2><p>${copy('按真实发表日期，回看知识库与 AI 视频工作流的尝试、整理和复盘。', 'Follow the publication dates through the knowledge base and AI video workflow: attempts, consolidation and reflection.')}</p></div>
      <div class="journal-timeline" data-journal-timeline><span class="journal-timeline-spine" aria-hidden="true"><i></i><b></b></span><ol>${ordered.map(({ p, i }, index) => `<li class="journal-milestone-wrap"><span class="journal-timeline-node" aria-hidden="true"></span><a class="journal-milestone" href="${esc(articlePath(i))}" data-post="${i}" data-journal-milestone data-journal-focus="timeline-${p.slug}"><p class="journal-eyebrow">${esc(pick(p.category))} / ${pad2(index + 1)}</p><time datetime="${p.date.replaceAll('.', '-')}">${p.date}</time><h3>${esc(pick(p.title))}</h3><p class="journal-record-summary">${esc(pick(p.summary))}</p><span class="journal-record-action">${copy('阅读原文', 'Read the original')}${arrow}</span></a><span class="journal-timeline-date" aria-hidden="true"><b>${p.date.slice(5)}</b><span>${p.date.slice(0, 4)}</span></span></li>`).join('')}</ol></div>
    </div></section>
    <section id="journal-catalog" class="journal-catalog container" data-journal-section aria-labelledby="journal-catalog-title"><div class="journal-section-heading" data-journal-enter><p class="journal-eyebrow">${copy('文章浏览', 'ARTICLE CATALOG')}</p><h2 id="journal-catalog-title">${copy('从这里，', 'Find your')} <em>${copy('继续阅读。', 'next read.')}</em></h2></div><div class="journal-catalog-content">${catalogMarkup}</div></section>
    <section class="journal-focus container" data-journal-section aria-labelledby="journal-focus-title"><div class="journal-section-heading" data-journal-enter><p class="journal-eyebrow">${copy('按主题接着看', 'FOLLOW A THREAD')}</p><h2 id="journal-focus-title">${copy('连起文章，', 'Connect the notes,')} <em>${copy('看见过程。', 'follow the process.')}</em></h2><p>${copy('两个阅读专题，按实践的先后串起已有原文。', 'Two reading tracks connecting the existing articles in the order the work unfolded.')}</p></div><div class="journal-track-grid">${practices.map((practice, i) => `<a class="journal-track" href="${local ? localContentURL('resources') : `/learning#track-${practice.id}`}" data-journal-track data-journal-enter data-journal-focus="track-${practice.id}"><span class="journal-eyebrow">${pad2(i + 1)} / ${esc(pick(practice.category))}</span><h3>${esc(pick(practice.title))}</h3><p>${esc(pick(practice.summary))}</p><span class="journal-record-action">${copy('查看阅读专题', 'Explore the reading track')}${arrow}</span></a>`).join('')}</div></section>
  </div>`;
}
