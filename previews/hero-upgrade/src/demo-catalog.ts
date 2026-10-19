/** Local UI samples, deliberately separate from createContentReader/CMS DTOs.
 * These are links to third-party projects, never claims of the author's work,
 * installed tools, published downloads, private library or membership access.
 * Sources and licence distinctions: DEMO_CONTENT_SOURCES.md, checked 2026-10-19.
 */
import type { Lang, Text } from './content';
import type { CatalogEntry, CatalogKind, CatalogList, CatalogQuery } from './catalog-model';

export const DEMO_VERIFIED_AT = '2026-10-19';
export const DEMO_CONTENT_NOTICE: Text = {
  zh: '当前展示本地演示目录，使用第三方公开项目作为样本；不代表主站已发布资料、作者作品或私有书库。切换正式内容后，继续沿用原站的登录与访问权限。',
  en: 'This local demo catalog uses public third-party projects as samples. It is not the author’s published inventory or private library. Live content continues to use the original site’s sign-in and access rules.',
};

export type DemoSection = { title: string; body: string };
export type DemoCatalogDetail = { entry: CatalogEntry; sections: DemoSection[]; sourceURL: string; sourceLabel: string; license: string };
type Section = { title: Text; body: Text };
type Sample = {
  id: string; title: Text; summary: Text; category: Text; tags: Text[];
  format: Text; source: string; label: string; license: string; sections: Section[];
};
const text = (zh: string, en: string): Text => ({ zh, en });
const section = (title: Text, body: Text): Section => ({ title, body });
const select = (value: Text, language: Lang) => value[language];
const ai = text('AI 学习', 'AI learning'), workflow = text('流程记录', 'Workflow'), web = text('网站建设', 'Web development');
const knowledge = text('知识管理', 'Knowledge'), film = text('影像创作', 'Film & capture'), development = text('开发工具', 'Development');
const course = text('在线课程', 'COURSE'), guide = text('官方文档', 'DOCUMENTATION'), templates = text('工作流模板', 'TEMPLATES'), software = text('开源软件', 'OPEN SOURCE');
const sampleSection = section(text('关于这份演示', 'About this sample'), text('这是用于体验目录、筛选和详情交互的本地演示条目。来源是第三方公开项目；没有上传到作者的正式资料库，也没有镜像安装包或教程正文。完整内容请从下方来源链接打开。', 'This local sample demonstrates the directory, filters and detail view. It points to a public third-party project, not an item published by the author. No installer or complete course is mirrored here; use the source link for the original.'));

const resources: readonly Sample[] = [
  {
    id: 'demo-generative-ai', title: text('生成式 AI，从概念到应用', 'Generative AI: from concepts to applications'),
    summary: text('Microsoft 的生成式 AI 入门课程。围绕提示词、检索与应用设计，按主题找到原始课程与练习。', 'Microsoft’s introductory curriculum, with original lessons and exercises on prompts, retrieval and application design.'),
    category: ai, tags: [text('生成式 AI', 'Generative AI'), text('提示词', 'Prompts'), text('检索', 'Retrieval')], format: course,
    source: 'https://github.com/microsoft/generative-ai-for-beginners', label: 'Microsoft / Generative AI for Beginners', license: 'MIT',
    sections: [
      section(text('可以找到什么', 'What is inside'), text('原仓库提供生成式 AI 概念、提示词、文本与聊天应用、搜索、函数调用等主题的课程，学习材料与代码练习放在对应目录。', 'The original repository covers generative AI concepts, prompts, text and chat applications, search and function calling, with learning material and exercises in topic directories.')),
      section(text('如何结合当前实践', 'How it fits this site'), text('可以从检索与应用设计部分开始，对照个人知识库和 AI 协作的公开记录，区分教程提供的基础能力与实际项目还需要验证的环节。', 'Start with retrieval and application design, alongside the public knowledge-base and AI collaboration notes. Separate tutorial capabilities from the work a real project still needs to verify.')),
      sampleSection,
    ],
  },
  {
    id: 'demo-ai-foundations', title: text('AI 基础：理解模型之前', 'AI foundations: before using a model'),
    summary: text('Microsoft AI for Beginners。把神经网络、计算机视觉和自然语言处理放回清晰的学习路径。', 'Microsoft AI for Beginners, with a structured path through neural networks, computer vision and natural language processing.'),
    category: ai, tags: [text('神经网络', 'Neural networks'), text('视觉', 'Vision'), text('NLP', 'NLP')], format: course,
    source: 'https://github.com/microsoft/AI-For-Beginners', label: 'Microsoft / AI for Beginners', license: 'MIT',
    sections: [
      section(text('课程的边界', 'Scope of the course'), text('这份课程讨论人工智能的基础方法，并包含神经网络、视觉与自然语言处理等学习材料。它不等于某个商用 AI 产品的操作说明。', 'This curriculum introduces foundational AI methods and includes material on neural networks, vision and natural language processing. It is not a manual for a particular commercial AI product.')),
      section(text('适合怎样使用', 'A useful starting point'), text('遇到图像、语言或模型相关术语时，可以回到相应章节核对定义与例子。练习环境与依赖以原仓库当前说明为准。', 'Use the relevant chapters to check definitions and examples when image, language or model terminology appears. Follow the original repository for the current exercise environment and dependencies.')),
      sampleSection,
    ],
  },
  {
    id: 'demo-machine-learning', title: text('机器学习：从数据到判断', 'Machine learning: from data to decisions'),
    summary: text('Microsoft 的经典机器学习入门资料。通过配套练习认识分类、回归、聚类与数据处理。', 'Microsoft’s introductory material on classical machine learning, with exercises covering classification, regression, clustering and data preparation.'),
    category: ai, tags: [text('机器学习', 'Machine learning'), text('数据', 'Data'), text('Python', 'Python')], format: course,
    source: 'https://github.com/microsoft/ML-For-Beginners', label: 'Microsoft / ML for Beginners', license: 'MIT',
    sections: [
      section(text('资料覆盖的内容', 'What the material covers'), text('课程聚焦经典机器学习，提供数据处理、回归、分类与聚类等主题的教程和练习。它与生成式 AI 课程属于不同的学习方向。', 'The curriculum focuses on classical machine learning and includes tutorials and exercises on data preparation, regression, classification and clustering. It is a different learning path from the generative AI curriculum.')),
      section(text('从问题出发', 'Start with a question'), text('先明确自己要分类、预测还是分组，再挑对应主题。不要把练习中的结果当成真实业务已经验证的结论。', 'Decide whether the problem is classification, prediction or grouping, then choose a corresponding topic. Exercise results are not evidence that a real business task has been validated.')),
      sampleSection,
    ],
  },
  {
    id: 'demo-web-foundations', title: text('Web 开发，建立完整基础', 'Web development: a complete foundation'),
    summary: text('Microsoft Web Dev for Beginners。沿着 HTML、CSS、JavaScript 和可运行项目，理解网页是怎样工作的。', 'Microsoft Web Dev for Beginners: HTML, CSS, JavaScript and runnable projects that explain how the web works.'),
    category: web, tags: [text('HTML / CSS', 'HTML / CSS'), text('JavaScript', 'JavaScript'), text('前端', 'Frontend')], format: course,
    source: 'https://github.com/microsoft/Web-Dev-For-Beginners', label: 'Microsoft / Web Dev for Beginners', license: 'MIT',
    sections: [
      section(text('可以找到什么', 'What is inside'), text('原仓库以 Web 基础知识和项目练习组织内容，包括 HTML、CSS 与 JavaScript。读者可以查看示例代码，并按原说明运行练习。', 'The original repository organises web foundations and project exercises around HTML, CSS and JavaScript. Read the examples and follow its instructions to run the exercises.')),
      section(text('和网站建设的关系', 'How it relates to building a site'), text('把布局、交互和数据请求拆开理解，再观察它们如何组合成页面。学习资料不会替代本站正式账号、内容管理与权限模块。', 'Understand layout, interaction and data requests separately, then see how they combine in a page. These learning materials do not replace this site’s production account, content-management or permission modules.')),
      sampleSection,
    ],
  },
  {
    id: 'demo-mermaid', title: text('用文本，把工作流画清楚', 'Describe a workflow as a diagram'),
    summary: text('Mermaid 官方项目与文档。用文本维护流程图和时序图，让流程记录能跟着内容一起更新。', 'The official Mermaid project and documentation: text-based flowcharts and sequence diagrams that can evolve with the notes.'),
    category: workflow, tags: [text('Mermaid', 'Mermaid'), text('流程图', 'Flowcharts'), text('Markdown', 'Markdown')], format: guide,
    source: 'https://github.com/mermaid-js/mermaid', label: 'Mermaid / mermaid-js', license: 'MIT',
    sections: [
      section(text('它解决什么问题', 'What it helps with'), text('Mermaid 从文本描述渲染流程图、时序图等图表。流程与文字可以一起版本管理，适合描述制作步骤、依赖和信息流转。', 'Mermaid renders flowcharts, sequence diagrams and other diagrams from text. Store diagrams alongside the writing to track production steps, dependencies and information flow.')),
      section(text('使用方式', 'How to use it'), text('从原仓库进入当前文档，确认所需图表的语法和运行环境。本站演示只提供来源入口，不执行来源仓库中的代码。', 'Open the current documentation from the original repository and check the syntax and environment for the diagram you need. This demo only links to that source; it does not execute the project’s code.')),
      sampleSection,
    ],
  },
  {
    id: 'demo-github-actions', title: text('把重复检查，交给工作流', 'Give repeatable checks a workflow'),
    summary: text('GitHub Actions 官方 starter workflows。参考构建与检查模板，理解触发条件和每个步骤的职责。', 'GitHub Actions starter workflows: official build and check templates for understanding triggers and the purpose of each step.'),
    category: workflow, tags: [text('GitHub Actions', 'GitHub Actions'), text('CI', 'CI'), text('自动化', 'Automation')], format: templates,
    source: 'https://github.com/actions/starter-workflows', label: 'GitHub / starter-workflows', license: 'MIT（不含名称、标志及商标授权 / excludes trademarks）',
    sections: [
      section(text('模板是什么', 'What the templates provide'), text('官方仓库按开发与自动化场景整理工作流模板。它们展示如何组织触发条件、任务和步骤，需要结合自己的项目环境调整。', 'The official repository groups workflow templates for development and automation scenarios. They demonstrate triggers, jobs and steps and need to be adapted to the project environment.')),
      section(text('接入前先确认', 'Before adding a workflow'), text('检查运行所需的权限、密钥与外部服务。模板是起点，不代表直接复制就能满足本站的构建、发布和数据边界。', 'Check required permissions, secrets and external services. A template is a starting point, not proof that a copied workflow meets this site’s build, release and data boundaries.')),
      sampleSection,
    ],
  },
];

const tools: readonly Sample[] = [
  {
    id: 'demo-vscode', title: text('Visual Studio Code', 'Visual Studio Code'),
    summary: text('代码编辑、调试和扩展放在同一个工作区。适合查看网站源码、运行检查与梳理项目结构。', 'Editing, debugging and extensions in one workspace, for reading source, running checks and navigating a project.'),
    category: development, tags: [text('VS Code', 'VS Code'), text('编辑器', 'Editor'), text('调试', 'Debugging'), text('Git', 'Git')], format: software,
    source: 'https://github.com/microsoft/vscode', label: 'Microsoft / vscode', license: 'Code - OSS: MIT；VS Code 安装包另有产品许可 / distribution has separate terms',
    sections: [
      section(text('用途', 'Purpose'), text('VS Code 将代码编辑、调试、终端和扩展入口整合在工作区中。官方仓库保存 Code - OSS 的源码与项目说明。', 'VS Code combines editing, debugging, a terminal and extension access in a workspace. The official repository contains the Code - OSS source and project information.')),
      section(text('许可与安装', 'Licence and installation'), text('Code - OSS 源码使用 MIT 许可；微软发布的 VS Code 安装包使用单独的产品许可。请从官方项目确认下载入口和适合自己环境的版本。', 'Code - OSS source uses the MIT licence; Microsoft’s VS Code distribution has a separate product licence. Follow the official project for downloads and the version suited to your environment.')),
      sampleSection,
    ],
  },
  {
    id: 'demo-logseq', title: text('Logseq', 'Logseq'),
    summary: text('以大纲、链接和知识关联组织记录。作为个人知识系统的另一种工具路径，先了解结构再决定是否迁移。', 'Organise notes with outlines and links. An alternative path for a personal knowledge system; understand its structure before migrating.'),
    category: knowledge, tags: [text('知识库', 'Knowledge base'), text('大纲', 'Outliner'), text('双向链接', 'Links')], format: software,
    source: 'https://github.com/logseq/logseq', label: 'Logseq / logseq', license: 'AGPL-3.0',
    sections: [
      section(text('用途', 'Purpose'), text('Logseq 是以隐私和知识管理为方向的开源工具，提供大纲与关联记录的工作方式。项目当前功能与版本变化请以官方仓库为准。', 'Logseq is an open-source knowledge-management tool focused on privacy, with an outline-and-link approach to notes. Check the official repository for current features and version changes.')),
      section(text('和现有知识库的关系', 'Relationship to the existing knowledge base'), text('本站已有文章记录 Obsidian 知识库实践。这里展示的是第三方工具样本，不代表作者已经迁移到 Logseq，也不会修改原有知识库文件。', 'Existing articles describe an Obsidian knowledge base. This is a third-party tool sample, not a claim that the author migrated to Logseq, and it does not change the existing knowledge-base files.')),
      sampleSection,
    ],
  },
  {
    id: 'demo-excalidraw', title: text('Excalidraw', 'Excalidraw'),
    summary: text('用白板梳理分镜、内容关系和系统流程。先画出彼此怎么连接，再回到细节。', 'A whiteboard for storyboards, content relationships and system flows. Start with the connections, then work through the details.'),
    category: workflow, tags: [text('白板', 'Whiteboard'), text('流程', 'Flow'), text('分镜', 'Storyboard')], format: software,
    source: 'https://github.com/excalidraw/excalidraw', label: 'Excalidraw / excalidraw', license: 'MIT',
    sections: [
      section(text('用途', 'Purpose'), text('Excalidraw 是带有手绘视觉风格的虚拟白板。它适合在定稿之前，整理画面、内容模块和流程之间的关系。', 'Excalidraw is a virtual whiteboard with a hand-drawn visual style. Use it before finalising work to map relationships between shots, content modules and process steps.')),
      section(text('使用入口', 'Where to begin'), text('从官方仓库进入项目网站或查看自托管说明。本地演示不嵌入远程协作房间，也不会把输入内容发送到白板服务。', 'Use the official repository to reach the project site or self-hosting instructions. This local demo does not embed a remote collaboration room or send your input to a whiteboard service.')),
      sampleSection,
    ],
  },
  {
    id: 'demo-kdenlive', title: text('Kdenlive', 'Kdenlive'),
    summary: text('开源非线性视频编辑器。用时间线组织镜头、声音和字幕，连接素材准备与成片检查。', 'An open-source nonlinear video editor. Arrange footage, sound and subtitles on a timeline, connecting source material to final review.'),
    category: film, tags: [text('视频剪辑', 'Video editing'), text('时间线', 'Timeline'), text('字幕', 'Subtitles')], format: software,
    source: 'https://github.com/KDE/kdenlive', label: 'KDE / Kdenlive', license: 'GPL-3.0（各文件以原项目授权为准 / see per-file terms）',
    sections: [
      section(text('用途', 'Purpose'), text('Kdenlive 是基于 MLT 和 KDE 技术的非线性视频编辑器。通过时间线组织多个素材轨道，并在编辑流程中处理声音和画面。', 'Kdenlive is a nonlinear video editor based on MLT and KDE technologies. Its timeline organises media tracks for editing picture and sound.')),
      section(text('使用之前', 'Before using it'), text('GitHub 仓库是 KDE 项目的镜像入口。安装、系统要求、素材格式与当前功能以官方发布说明为准；此处不提供重新打包的安装器。', 'The GitHub repository is a mirror of the KDE project. Follow official release information for installation, system requirements, media formats and current features; this page does not provide a repackaged installer.')),
      sampleSection,
    ],
  },
  {
    id: 'demo-obs', title: text('OBS Studio', 'OBS Studio'),
    summary: text('录屏与直播工具。把网页演示、操作步骤和多个输入源组织成可录制的场景。', 'Screen-recording and streaming software for arranging web demos, walkthroughs and multiple inputs into recordable scenes.'),
    category: film, tags: [text('录屏', 'Recording'), text('场景', 'Scenes'), text('直播', 'Streaming')], format: software,
    source: 'https://github.com/obsproject/obs-studio', label: 'OBS Project / obs-studio', license: 'GPL-2.0-or-later',
    sections: [
      section(text('用途', 'Purpose'), text('OBS Studio 是用于视频录制与直播的开源软件。通过场景和来源，把屏幕、窗口、声音等输入组织到录制流程中。', 'OBS Studio is open-source software for video recording and live streaming. Scenes and sources organise screen, window and audio inputs for recording.')),
      section(text('适合的实践环节', 'Where it fits'), text('它可以用于录制网页交互或操作演示。录制权限、音轨和输出配置需要按当前设备确认；演示站本身不会请求录屏或麦克风权限。', 'It can record web interactions or walkthroughs. Confirm capture permissions, audio tracks and output settings for your device; this demo site itself does not request screen or microphone access.')),
      sampleSection,
    ],
  },
  {
    id: 'demo-github-desktop', title: text('GitHub Desktop', 'GitHub Desktop'),
    summary: text('用图形界面查看分支、提交和文件差异。让网站的每次前端调整都有可回看的记录。', 'A graphical interface for branches, commits and file changes, making each frontend change easier to review and trace.'),
    category: development, tags: [text('Git', 'Git'), text('版本管理', 'Version control'), text('分支', 'Branches')], format: software,
    source: 'https://github.com/desktop/desktop', label: 'GitHub / Desktop', license: 'MIT',
    sections: [
      section(text('用途', 'Purpose'), text('GitHub Desktop 为 Git 工作流提供图形界面，便于检查文件差异、管理分支和整理提交。官方仓库提供源码、下载和帮助入口。', 'GitHub Desktop provides a graphical interface for Git workflows, including file diffs, branches and commits. Its official repository links to the source, downloads and help.')),
      section(text('和更换前端的关系', 'Why it matters when replacing a frontend'), text('界面改版保留在独立分支，核对差异后再合并到正式源码。图形工具只是操作入口，不能替代原有数据备份和发布验证。', 'Keep a redesign in a separate branch and review its changes before merging into the production source. A graphical tool is an interface, not a substitute for data backups or release validation.')),
      sampleSection,
    ],
  },
];

const samples = (kind: CatalogKind): readonly Sample[] => {
  if (kind === 'resources') return resources;
  if (kind === 'software') return tools;
  throw new TypeError('Unsupported demo catalog kind');
};
const normalize = (value: string) => value.normalize('NFKC').trim().toLocaleLowerCase();

function toEntry(sample: Sample, language: Lang): CatalogEntry {
  return { id: sample.id, title: select(sample.title, language), summary: select(sample.summary, language), category: select(sample.category, language), tags: sample.tags.map(tag => select(tag, language)),
    // Blank dates and files are intentional: these are not real publication
    // dates, downloadable uploads or installed versions from the author's CMS.
    date: '', coverSrc: '', format: select(sample.format, language), file: '', fileSize: '', externalUrl: sample.source, downloadUrl: '' };
}

export function demoCatalog(kind: CatalogKind, query: CatalogQuery = {}, language: Lang = 'zh'): CatalogList {
  const source = samples(kind);
  const words = normalize((query.query ?? '').slice(0, 200)).split(/\s+/).filter(Boolean);
  const category = query.category ?? 'all';
  const matches = source.filter(sample => {
    if (category !== 'all' && category !== select(sample.category, language)) return false;
    const searchable = normalize([sample.title.zh, sample.title.en, sample.summary.zh, sample.summary.en, ...sample.tags.flatMap(tag => [tag.zh, tag.en])].join(' '));
    return words.every(word => searchable.includes(word));
  });
  return { items: matches.map(sample => toEntry(sample, language)), total: matches.length, totalPublished: source.length, page: 1, pages: 1,
    categories: [...new Set(source.map(sample => select(sample.category, language)))], highlights: kind === 'resources' ? matches.slice(0, 3).map(sample => toEntry(sample, language)) : [] };
}

export function demoEntry(kind: CatalogKind, id: string, language: Lang = 'zh'): DemoCatalogDetail | null {
  const sample = samples(kind).find(item => item.id === id);
  return sample ? { entry: toEntry(sample, language), sections: sample.sections.map(item => ({ title: select(item.title, language), body: select(item.body, language) })), sourceURL: sample.source, sourceLabel: sample.label, license: sample.license } : null;
}

export function demoHref(kind: CatalogKind, id: string): string {
  if (!samples(kind).some(sample => sample.id === id)) throw new TypeError('Unknown demo identifier');
  return `${kind === 'resources' ? '/learning' : '/software'}?sample=${encodeURIComponent(id)}`;
}
