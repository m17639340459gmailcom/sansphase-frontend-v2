// Composition only: irma-book owns the physical case; quick_flipbook owns
// Bend/Twist/PageCurve and sheet motion. This module supplies site typography,
// coordinate conversion, state and resource ownership, never paper physics.
import { CanvasTexture, Group, MeshStandardMaterial, SRGBColorSpace } from 'three';
import { createBookViewer as createCaseViewer } from '../vendor/irma-book/book3d/BookViewer.js';
import type { BookOptions, BookPageLayer, BookViewer } from '../vendor/irma-book/book3d/BookViewer.js';
import { FlipBook } from '../vendor/quick-flipbook/index.js';

type PageCopy = { label: string; title: string[]; body: string[] };
const copy: Record<'zh' | 'en', PageCopy[]> = {
  zh: [
    { label: 'THE READING ROOM', title: ['藏书，', '与阅读。'], body: ['SANSPHASE / 無相', '文字与插图，收藏成册。'] },
    { label: '01 / 藏书', title: ['从一本书开始。'], body: ['收藏成册的文字与插图，', '读到你想停留的地方。'] },
    { label: '02 / 目录', title: ['不必从头开始。'], body: ['先看介绍和章节目录，', '直接跳到想读的章节与小节。'] },
    { label: '03 / 文字', title: ['按章节阅读。'], body: ['正文按需加载。', '读完一节，再前往下一节。'] },
    { label: '04 / 插图', title: ['文字之外。'], body: ['书籍里的插图与附件，', '和文字一起组成阅读。'] },
    { label: '05 / 续读', title: ['回到上次读到的地方。'], body: ['当前浏览器会保留阅读位置。', '不必每次都从第一页开始。'] },
    { label: '06 / 书签', title: ['为段落留下书签。'], body: ['留下一处标记，', '下次回到值得重读的地方。'] },
    { label: '07 / 浏览', title: ['按书名寻找。'], body: ['在书库中搜索，', '也可以按分类浏览。'] },
    { label: '08 / 阅读', title: ['用你现有的账号。'], body: ['打开书籍，沿用原有阅读权限。', '阅读内容从现有书库进入。'] },
    { label: '09 / 留存', title: ['把位置留在这里。'], body: ['续读与书签保存在当前浏览器。', '更换设备时，不会自动同步。'] },
    { label: '10 / 发现', title: ['也藏下一次发现。'], body: ['从目录进入，', '读到你想停留的地方。'] },
    { label: 'SANSPHASE / LIBRARY', title: ['继续，阅读。'], body: ['浏览下方藏书，', '进入你想读的那一本。'] },
  ],
  en: [
    { label: 'THE READING ROOM', title: ['Words.', 'Ideas.', 'Discoveries.'], body: ['SANSPHASE / 無相', 'A place for books and illustrations.'] },
    { label: '01 / BOOKS', title: ['Start with a book.'], body: ['Books, words and illustrations.', 'Find a place to stay.'] },
    { label: '02 / CONTENTS', title: ['Choose your chapter.'], body: ['Read the introduction and contents.', 'Start with the section you want.'] },
    { label: '03 / WORDS', title: ['One section at a time.'], body: ['Content loads as you read.', 'Then move to the next section.'] },
    { label: '04 / ILLUSTRATIONS', title: ['Beyond words.'], body: ['Illustrations and attachments', 'belong to the same reading experience.'] },
    { label: '05 / RESUME', title: ['Keep your place.'], body: ['This browser remembers your position.', 'Continue where you left off.'] },
    { label: '06 / BOOKMARKS', title: ['A passage to return to.'], body: ['Bookmark a paragraph.', 'Come back when you want to read it again.'] },
    { label: '07 / BROWSE', title: ['Find your next book.'], body: ['Search by title', 'or browse the categories.'] },
    { label: '08 / ACCESS', title: ['Your existing account.'], body: ['Books use your current reading access.', 'Open them from the library below.'] },
    { label: '09 / LOCAL', title: ['Saved in this browser.'], body: ['Reading position and bookmarks stay here.', 'They do not sync across devices.'] },
    { label: '10 / DISCOVER', title: ['Another discovery.'], body: ['Start from the contents.', 'Find a place to stay.'] },
    { label: 'SANSPHASE / LIBRARY', title: ['Keep reading.'], body: ['Browse the collection below.', 'Open the book you want to read.'] },
  ],
};

function pageMaterial(doc: Document, content: PageCopy, index: number) {
  const canvas = doc.createElement('canvas');
  canvas.width = 672;canvas.height = 960;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Book typography requires a canvas context');
  ctx.fillStyle = '#f1ecdf';ctx.fillRect(0, 0, 672, 960);
  ctx.fillStyle = '#24366e';ctx.font = '500 42px "JetBrains Mono", monospace';
  ctx.fillText(content.label, 64, 88, 548);
  ctx.strokeStyle = '#b9bdc9';ctx.lineWidth = 1;ctx.beginPath();ctx.moveTo(64, 110);ctx.lineTo(608, 110);ctx.stroke();
  ctx.fillStyle = '#101725';ctx.font = '500 76px Georgia, "Noto Sans SC Variable", serif';
  let y = 280;
  for (const line of content.title) { ctx.fillText(line, 64, y, 548);y += 92; }
  ctx.fillStyle = '#252d3b';ctx.font = '500 48px "Inter Variable", "Noto Sans SC Variable", sans-serif';
  y = Math.max(530, y + 68);
  // Keep printed copy large at the compact 3D stage: wrap it instead of
  // shrinking whole sentences through fillText's maxWidth parameter.
  for (const paragraph of content.body) {
    let line = '';
    for (const word of new Intl.Segmenter(undefined, { granularity: 'word' }).segment(paragraph)) {
      if (line && ctx.measureText(line + word.segment).width > 548) { ctx.fillText(line.trim(), 64, y);y += 58;line = ''; }
      line += word.segment;
    }
    ctx.fillText(line.trim(), 64, y);y += 58;
  }
  ctx.fillStyle = '#3c4352';ctx.font = '38px "JetBrains Mono", monospace';
  ctx.fillText('SANSPHASE', 64, 890);ctx.textAlign = 'right';ctx.fillText(String(index + 1).padStart(2, '0'), 608, 890);
  const texture = new CanvasTexture(canvas);texture.colorSpace = SRGBColorSpace;texture.anisotropy = 4;
  return new MeshStandardMaterial({ map: texture, color: '#ffffff', roughness: .92, metalness: 0, envMapIntensity: .65 });
}

export function createBookViewer(container: HTMLElement, options: BookOptions = {}, caseFactory: typeof createCaseViewer = createCaseViewer): BookViewer {
  const notify = () => options.onStateChange?.();
  const book = caseFactory(container, { ...options, readingMode: true, openAngle: 180, cameraAzimuth: 0, cameraElevation: 0, idleSway: false, pointerParallax: false });
  const materials: MeshStandardMaterial[] = [];
  let paper: FlipBook | null = null, dead = false, settledLeaf = 0, targetLeaf = 0;
  let reduced = options.openSpeed === Infinity;
  try {
    const language = container.closest<HTMLElement>('[data-book-language]')?.dataset.bookLanguage === 'en' ? 'en' : 'zh';
    for (const [index, content] of copy[language].entries()) materials.push(pageMaterial(container.ownerDocument, content, index));
    const bounds = book.pageBounds;
    const width = (bounds.max.x - book.pageHingeX) * .01;
    const height = (bounds.max.y - bounds.min.y) * .01;
    const thickness = (bounds.max.z - bounds.min.z) * .01;
    const leafCount = materials.length / 2;
    const sheets = paper = new FlipBook({ flipDuration: .72, yBetweenPages: thickness / leafCount, pageSubdivisions: 22, autoCenter: false });
    const pivot = new Group();
    pivot.rotation.x = Math.PI / 2;
    pivot.position.set(book.pageHingeX * .01, (bounds.min.y + bounds.max.y) * .005, bounds.max.z * .01 + .003);
    pivot.scale.set(width, 1, height);
    pivot.add(sheets);pivot.visible = false;
    sheets.setPages([...materials]);
    const layer: BookPageLayer = {
      object: pivot,
      get progress() { return sheets.progress / leafCount; },
      // The turned leaf itself is the top surface, not one spacing below a
      // solid block. Only the leaves beneath it contribute support thickness.
      get leftSupportProgress() { return Math.max(0, Math.floor(sheets.progress + 1e-6) - 1) / leafCount; },
      advance(delta) {
        if (!sheets.isAnimating) return false;
        sheets.animate(delta);
        if (!sheets.isAnimating) { settledLeaf = targetLeaf;notify(); }
        return true;
      },
      reset() { sheets.progress = 0;settledLeaf = targetLeaf = 0;notify(); },
      dispose() {
        if (dead) return;
        dead = true;sheets.dispose();
        for (const material of materials) { material.map?.dispose();material.dispose(); }
        pivot.clear();
      },
    };
    book.attachPageLayer(layer);
    function turn(direction: number) {
      if (dead || !book.isOpen || book.isTurning || sheets.isAnimating) return false;
      const destination = Math.max(0, Math.min(leafCount, settledLeaf + direction));
      if (destination === settledLeaf) return false;
      targetLeaf = destination;
      if (reduced) { sheets.progress = destination;settledLeaf = destination; }
      else if (direction > 0) sheets.nextPage();else sheets.previousPage();
      book.invalidate();notify();return true;
    }
    return {
      ...book,
      get isOpen() { return book.isOpen; },
      get openProgress() { return book.openProgress; },
      get isTurning() { return book.isTurning || sheets.isAnimating; },
      get currentPage() { return settledLeaf; },
      get pageCount() { return leafCount; },
      nextPage: () => turn(1), previousPage: () => turn(-1),
      update(patch) {
        if (patch.openSpeed !== undefined) reduced = patch.openSpeed === Infinity;
        if (reduced && sheets.isAnimating) { sheets.progress = targetLeaf;settledLeaf = targetLeaf;notify(); }
        book.update({ ...patch, idleSway: false, pointerParallax: false });
      },
    };
  } catch (error) {
    paper?.dispose();
    for (const material of materials) { material.map?.dispose();material.dispose(); }
    book.dispose();throw error;
  }
}
