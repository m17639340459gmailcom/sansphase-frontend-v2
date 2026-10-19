# 本地演示内容与正式数据的边界

本文件只记录 `previews/hero-upgrade` 的演示目录。资料 6 条、软件 6 条、资源中心示例书目 3 条，均为公开第三方项目的来源索引和简短说明，不是作者已发布的正式资料、原创作品或私有藏书。没有新增后端接口、账号、支付、VIP、下载代理，也没有修改生产内容。

核对日期：2026-10-19。核对内容：官方 GitHub 仓库存在、未归档、项目用途、许可与当前维护记录。维护时间只是选材依据，不表示不存在安全问题；本版本仅链接项目，没有安装或执行这些工具。演示页面不展示未经核实的价格、评分、安装版本、下载次数或作者使用经历。

## 接入方式

- `src/demo-catalog.ts` 的 `demoCatalog(kind, query, language)` 返回既有 `CatalogList` 类型；`demoEntry` 返回纯文本详情、来源、许可；`demoHref` 仅生成 `/learning?sample=...` 或 `/software?sample=...`。
- `src/demo-library.ts` 的 `demoLibrary(query, language)` 返回既有 `LibraryCatalog` 类型；`demoBook` 返回示例书目与分节简介；`demoLibraryHref` 仅生成 `/resources?sample=...`。
- 所有条目使用 `demo-` 或 `demo-book-` 标识，不与 CMS slug 混合。`date`、`file`、`fileSize`、`downloadUrl` 留空，避免把来源核对日期写成正式发布时间，或伪造可下载文件。
- `coverSrc` 留空，页面使用当前主题的文字、编号和第三方功能图标；不制作 AI 封面，不借用原项目商标制作本站标识。
- 纯本地查询不访问网络。每次返回新对象，筛选与详情面板不会改写原始演示记录。
- 演示与正式数据由界面明确切换。正式资料仍使用 `createContentReader`、现有 `catalogQuery` / `libraryQuery` 和主站权限；401/403 必须保留，不能用演示数据冒充鉴权结果。
- 详情展示使用文本转义，不执行原仓库代码，不在此站镜像完整教程或安装包。项目原文、代码、媒体和商标各自的许可继续由原项目说明决定。

## 资料来源

| 本地样本 | 官方仓库 | 许可来源 | 核对的最近推送（UTC） |
| --- | --- | --- | --- |
| 生成式 AI，从概念到应用 | [microsoft/generative-ai-for-beginners](https://github.com/microsoft/generative-ai-for-beginners) | [MIT](https://github.com/microsoft/generative-ai-for-beginners/blob/main/LICENSE) | 2026-10-17 |
| AI 基础：理解模型之前 | [microsoft/AI-For-Beginners](https://github.com/microsoft/AI-For-Beginners) | [MIT](https://github.com/microsoft/AI-For-Beginners/blob/main/LICENSE) | 2026-09-16 |
| 机器学习：从数据到判断 | [microsoft/ML-For-Beginners](https://github.com/microsoft/ML-For-Beginners) | [MIT](https://github.com/microsoft/ML-For-Beginners/blob/main/LICENSE) | 2026-10-18 |
| Web 开发，建立完整基础 | [microsoft/Web-Dev-For-Beginners](https://github.com/microsoft/Web-Dev-For-Beginners) | [MIT](https://github.com/microsoft/Web-Dev-For-Beginners/blob/main/LICENSE) | 2026-10-17 |
| 用文本，把工作流画清楚 | [mermaid-js/mermaid](https://github.com/mermaid-js/mermaid) | [MIT](https://github.com/mermaid-js/mermaid/blob/develop/LICENSE) | 2026-10-18 |
| 把重复检查，交给工作流 | [actions/starter-workflows](https://github.com/actions/starter-workflows) | [MIT，另明确不授权贡献者名称、标志和商标](https://github.com/actions/starter-workflows/blob/main/LICENSE) | 2026-08-03 |

GitHub API 对 `actions/starter-workflows` 的许可证自动识别为 `NOASSERTION`；已经另读根目录 LICENSE，不能把自动识别结果当成没有许可证。

资源中心三本示例书目分别引用以上生成式 AI、Web 基础和 Mermaid 来源。展示的是分节简介和原始来源入口，不冒充原项目的完整电子书，也不声称本站已经获得某本受限藏书的访问权。

## 软件来源

| 本地样本 | 官方仓库 | 许可说明 | 核对的最近推送（UTC） |
| --- | --- | --- | --- |
| Visual Studio Code | [microsoft/vscode](https://github.com/microsoft/vscode) | [Code - OSS 源码为 MIT；微软 VS Code 发行版另有产品许可](https://github.com/microsoft/vscode#visual-studio-code) | 2026-10-18 |
| Logseq | [logseq/logseq](https://github.com/logseq/logseq) | [AGPL-3.0](https://github.com/logseq/logseq/blob/master/LICENSE.md) | 2026-10-18 |
| Excalidraw | [excalidraw/excalidraw](https://github.com/excalidraw/excalidraw) | [MIT](https://github.com/excalidraw/excalidraw/blob/master/LICENSE) | 2026-10-18 |
| Kdenlive | [KDE/kdenlive](https://github.com/KDE/kdenlive) | [项目 COPYING；各文件以 SPDX 声明为准](https://github.com/KDE/kdenlive/blob/master/COPYING)；[main.cpp 为 GPL-3.0-only OR LicenseRef-KDE-Accepted-GPL](https://github.com/KDE/kdenlive/blob/master/src/main.cpp) | 2026-10-18 |
| OBS Studio | [obsproject/obs-studio](https://github.com/obsproject/obs-studio) | [README 明确 GPL v2 或更高版本](https://github.com/obsproject/obs-studio#what-is-obs-studio) | 2026-10-16 |
| GitHub Desktop | [desktop/desktop](https://github.com/desktop/desktop) | [MIT](https://github.com/desktop/desktop/blob/development/LICENSE) | 2026-10-16 |

本站原有 Obsidian 文章仍保留。演示中的 Logseq 不是作者迁移记录；不因为展示另一款工具就改写原有实践内容。

## 全站演示内容核对

| 页面 / 模块 | 本次允许的内容来源 | 保留的功能边界 |
| --- | --- | --- |
| 首页 / 博客 | 已有 4 篇公开文章及真实作者介绍 | 不改文章 ID、发布时间、正文、阅读器与图片浏览权限 |
| 作品 | 已有「个人知识库」「AI 影像工作流」两个专题，各关联真实记录 | 不把文章归类改写成已经交付的第三方产品，不增加伪造项目成果 |
| 资料 | 6 条明确演示的第三方开源课程、文档与模板 | 正式资料目录仍由原站 CMS 管理，原有账号与下载权限保留 |
| 软件推荐 | 6 条明确演示的第三方工具 | 不虚构安装包、下载次数、评分和作者使用结论 |
| 资源中心 | 3 本明确示例书目，既有第三方 3D 翻书组件保留 | 正式书目、章节、VIP、图片、附件仍交给原站阅读器 |
| 社区 | 现有规划和真实联系方式 | 不伪造用户、帖子、签到或交易；社区不在本次启用范围 |
| 联系 | 原有抖音、QQ 群与开发服务介绍 | 不生成虚构邮箱、客户或合作案例 |
| 支持 | 原有「赞助渠道暂未开放」说明 | 不创建模拟支付入口 |

`src/content.ts` 中的 `sections.status` 仍然描述正式站点发布状态。新增演示目录不能用于把正式状态改成“已发布”。

## 适配验证

`tests/demo-content.test.mjs` 检查：两个目录的中英元数据与数量、分类和检索、未知详情与安全本地链接、返回对象隔离、三本示例书的非 VIP 边界，以及 VS Code 发行版许可区别。接入页面后还需要浏览器核对：演示标识、正式目录切换、筛选、详情关闭和焦点返回、语言切换、外链目的地、无 AI 图片、无实际私有 API 泄漏。
