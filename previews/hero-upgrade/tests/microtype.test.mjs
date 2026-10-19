import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

const files = ['www/style.css', 'src/hero.css', 'src/inner-pages.css', 'src/home-closing.css', 'src/journal-page.css', 'src/home-sections.css', 'src/directions.css', 'src/showcase.css', 'src/reader.css'];
const styles = (await Promise.all(files.map(path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')))).join('\n')
  .replace(/@import[^;]+;/g, '')
  .replace(/@property\s+[^\{]+\{[^}]+\}/g, '')
  .replace(/var\(--(?:mono|sans|cjk|display)\)/g, 'sans-serif');

test('desktop instructions, metadata and active controls retain a readable text size', () => {
  const dom = new JSDOM(`<style>${styles}</style><body>
    <nav class="links"><a>博客</a></nav><span class="keys"><kbd>Ctrl</kbd></span>
    <section class="hero"><div class="hero-copy"><p class="eyebrow">个人创作者</p></div><span class="hero-bottom-note">公开记录</span><a class="hero-cue">继续探索</a></section>
    <main class="page"><div class="page-crumb">资料<small>资料分类</small></div><dl class="page-meta"><dt>最近更新</dt></dl><p class="caption-meta">记录分类</p><div class="practice-meta">项目状态</div><ul class="practice-focus"><li>工作流程</li></ul><p class="catalog-count">共四项</p><span class="index-category">类别<small>更新时间</small></span><div class="reach-main"><small>联系方式</small></div><div class="view-toggle"><button>列表</button></div></main>
    <footer><p class="footer-label">探索</p><a class="to-top">返回顶部</a><span class="clock">当地时间</span><p class="footer-fonts">字体说明</p></footer>
    <main class="journal-page"><p class="journal-eyebrow">创作记录</p><span class="journal-feature-chip"><b data-journal-count>04</b> 篇公开文章</span><p class="journal-feature-foot">精选文章</p><div class="journal-milestone"><time>2026</time></div><span class="journal-record-action">阅读原文</span><label class="journal-sort">排序</label><p class="journal-result-count">文章数量</p><p class="journal-publication-meta">文章分类</p><a class="journal-publication-action">进入阅读</a></main>
    <div class="brand-text"><small>無相</small></div><span class="log-month">十月</span><span class="post-chip">创作过程</span><span class="archive-state">开放阅读</span>
    <section class="directions"><p class="eyebrow">开发方向</p></section><span class="showcase-url">sansphase.com</span><span class="showcase-tab-num">01</span><button class="reader-close">关闭<kbd>Esc</kbd></button>
    </body>`, { pretendToBeVisual: true });
  try {
    const { document } = dom.window;
    const informative = ['.keys kbd', '.hero-copy .eyebrow', '.hero-bottom-note', '.page-crumb', '.page-meta dt', '.caption-meta', '.practice-meta', '.practice-focus li', '.catalog-count', '.index-category', '.index-category small', '.reach-main small', '.footer-label', '.clock', '.footer-fonts', '.journal-eyebrow', '.journal-feature-chip', '.journal-feature-foot', '.journal-milestone time', '.journal-sort', '.journal-result-count', '.journal-publication-meta', '.brand-text small', '.log-month', '.post-chip', '.archive-state', '.directions .eyebrow', '.showcase-url', '.reader-close kbd'];
    const actionable = ['.links a', '.hero-cue', '.view-toggle button', '.to-top', '.journal-publication-action'];
    for (const [selectors, minimum] of [[informative, 12], [actionable, 13]]) {
      for (const selector of selectors) {
        const computed = dom.window.getComputedStyle(document.querySelector(selector));
        assert.ok(parseFloat(computed.fontSize) >= minimum, `${selector} needs at least ${minimum}px, received ${computed.fontSize}`);
      }
    }
    const crumb = dom.window.getComputedStyle(document.querySelector('.page-crumb small'));
    assert.ok(!crumb.opacity || Number(crumb.opacity) >= 1, 'meaningful breadcrumb metadata must not fade a passing muted color again');
    const ordinal = dom.window.getComputedStyle(document.querySelector('.showcase-tab-num'));
    assert.ok(parseFloat(ordinal.fontSize) >= 11, `decorative showcase ordinal needs at least 11px, received ${ordinal.fontSize}`);
    const journalAction = dom.window.getComputedStyle(document.querySelector('.journal-record-action'));
    assert.ok(parseFloat(journalAction.fontSize) >= 14, `journal timeline and topic actions need at least 14px, received ${journalAction.fontSize}`);
  } finally { dom.window.close(); }
});

test('resource and software catalog metadata stays readable without shrinking active controls',async()=>{
  const catalogStyles=(await readFile(new URL('../src/catalog-page.css',import.meta.url),'utf8')).replace(/var\(--(?:mono|sans|cjk|display)\)/g,'sans-serif');
  const dom=new JSDOM(`<style>${styles}\n${catalogStyles}</style><main class="page catalog-page" data-catalog-kind="resources">
    <p class="catalog-kicker">资料与工具</p><p class="catalog-caption">分类说明</p><p class="catalog-status">需要登录</p>
    <div class="catalog-route-top"><span class="catalog-caption">THE MATERIALS INDEX</span></div>
    <span class="catalog-category-label">知识管理</span><p class="catalog-entry-meta">教程 · 2026</p>
    <nav class="catalog-pagination"><button>上一页</button><span>1 / 3</span><button>下一页</button></nav>
    <p class="catalog-main-note">使用主站账号查看目录</p><a class="catalog-route-foot catalog-main-link" href="https://www.sansphase.com/#/resources">前往主站</a>
    <form class="catalog-search"><input type="search"><button>搜索</button></form>
    <div class="catalog-layout"><button data-catalog-layout="grid">卡片</button><button data-catalog-layout="list">列表</button></div>
    <div class="catalog-categories"><button>全部分类</button></div>
    </main>`,{pretendToBeVisual:true});
  try{
    const informative=['.catalog-kicker','.catalog-caption','.catalog-route-top .catalog-caption','.catalog-status','.catalog-category-label','.catalog-entry-meta','.catalog-pagination span','.catalog-main-note'];
    const actionable=['.catalog-main-link','.catalog-search button','.catalog-layout button','.catalog-pagination button','.catalog-categories button'];
    for(const [selectors,minimum]of[[informative,12],[actionable,13]])for(const selector of selectors){
      const computed=dom.window.getComputedStyle(dom.window.document.querySelector(selector));
      assert.ok(parseFloat(computed.fontSize)>=minimum,`${selector} needs at least ${minimum}px, received ${computed.fontSize}`);
    }
  }finally{dom.window.close();}
});

test('hero stage shape, runtime and phase readouts retain a readable desktop size', async () => {
  const hudStyles = await readFile(new URL('../src/hero-hud.css', import.meta.url), 'utf8');
  const dom = new JSDOM(`<style>${hudStyles}</style><div class="hero-hud">
    <p class="hero-hud-name">影像引擎</p><p class="hero-hud-stats">65,536 PTS · 118 FPS · GPGPU</p>
    <p class="hero-hud-meter">稳定</p></div>`, { pretendToBeVisual: true });
  try {
    for (const selector of ['.hero-hud', '.hero-hud-stats', '.hero-hud-meter']) {
      const computed = dom.window.getComputedStyle(dom.window.document.querySelector(selector));
      assert.ok(parseFloat(computed.fontSize) >= 12, `${selector} needs at least 12px, received ${computed.fontSize}`);
    }
    const name = dom.window.getComputedStyle(dom.window.document.querySelector('.hero-hud-name'));
    assert.ok(parseFloat(name.fontSize) >= 13, `shape name needs at least 13px, received ${name.fontSize}`);
  } finally { dom.window.close(); }
});
