# 内页内容改造与验收 · 2026-10-18

预览的正式源码入口仅为 `D:/博客/previews/hero-upgrade/`，本地地址为 `http://127.0.0.1:4285/`。分支为 `codex/hero-exploration-20261018`；此前博客统一索引的实施基线为 `c102f08`，更早内页改造基线为 `5f65bf6`。`dist/`、`outputs/`、历史发布快照均不是源码入口。

本次范围为 `/blog` 对照友人 About 的首屏、主题导读结构和首屏交互更正，详见“博客 About 结构更正”。此前 `/resources` 资源中心书库替换旧 `section-directory`，书籍、分类和数量只接受真实 API 元数据；本地匿名请求为 401，不推断空库，不用四篇博客充当书目。正文阅读、登录及书籍权限继续由主站 `#/resource-center` 原 Reader 处理。下文各批测试、截图与浏览器结论只适用于标明的执行范围，不能继承为本次博客结构更正的验收。首页章节、粒子、后台接口和持久数据不在本次更正范围内。

## 来源与实现范围

结构和交互先审阅 TDX 开源固定提交 `c73bc4966f0ba808b978e22eccf5a063fc649751`，再通过现有 DOM、TypeScript、GSAP / ScrollTrigger 和 Lenis 做薄适配。博客从 About 中的 Hero / HoloCard、Story、Timeline、Publications、Now 取结构与交互依据，内容使用 SANSPHASE 已有文章、日期和实践主题，没有移植参考站作者的个人经历。

此前文章索引明确对应 [Publications 第 29–59 行](https://github.com/DingxinTao0417/tdx-portfolio/blob/c73bc4966f0ba808b978e22eccf5a063fc649751/src/components/about/publications.tsx#L29-L59)：有序文章行、分隔线、日期列、信息与标题层级、行扫光和强调底线。BlogExplorer 仅复用查询模型，不继续保留旧目录视觉；本地用真实发表日期与 Reader 链接替换上游论文年份和出版链接。

图片放大接入官方 PhotoSwipe **5.4.4** 核心与样式，版本已锁定；许可证为 MIT，原许可保留在 `vendor/photoswipe/LICENSE`。阅读器保留现有排版，每次打开一张原图，没有新增浏览器外框、缩略图图库或自制缩放引擎。正文继续经过现有 sanitize 与授权媒体代理，不改变图片链接含义和账号权限。

来源文件、固定 Git blob、适配范围及限制见 [SOURCES.json](./SOURCES.json) 的 `innerPagesUI`、`journalPageUI`、`articleImagesUI`、`libraryPageUI` 和 `libraries.photoswipe`。来源身份、测试与浏览器结果分别留痕。没有新增 AI 媒体或第二套应用框架。

## 博客 About 结构更正（2026-10-18）

本次重新读取同一固定提交的真实源码，以 [About 页面第 75–100 行](https://github.com/DingxinTao0417/tdx-portfolio/blob/c73bc4966f0ba808b978e22eccf5a063fc649751/src/app/%5Blocale%5D/about/page.tsx#L75-L100)、[Portrait 第 41–75 行](https://github.com/DingxinTao0417/tdx-portfolio/blob/c73bc4966f0ba808b978e22eccf5a063fc649751/src/components/about/portrait.tsx#L41-L75)、[Story 第 76–117 行](https://github.com/DingxinTao0417/tdx-portfolio/blob/c73bc4966f0ba808b978e22eccf5a063fc649751/src/components/about/story.tsx#L76-L117) 和 `about.module.css` 为依据，纠正此前过大的首屏封面、强制两行大标题、额外统计及大字号宣言式导读。整体借鉴范围始终包括 Hero、Story、Timeline、Publications 和本地实践主题结尾，不能描述成“只借了首屏”；本次更正集中于 Hero / Story，不代表重新完成或重验全部后续区块。

| 所属模块 | 本次结构与交互更正 | 与上游的适配边界 |
| --- | --- | --- |
| `src/journal-page.ts`、`src/journal-page.css` 首屏 | 桌面顶部／底部留白 160／64px，12 列中左 7、右 5，间距 64px；标题 52px、行高 1.2；右卡最大 352px、比例 10:9、靠右。移除强制换行、统计、浏览目录按钮和重复日期脚注 | 用本站真实文章封面及 Reader 入口替代人像，不借个人身份或新增媒体。首屏没有写死高度，最终高度受内容和字体度量影响；不得把约 541px 当成所有视口的固定值 |
| `src/journal-page.css` 图卡 | 恢复图片／扫描边沿 1.25 秒＋0.1 秒延迟、四角 0.7 秒＋`0.9 + i × 0.07` 秒、芯片 0.6 秒＋0.75 秒，以及 9 秒／80deg 边缘光束 | HUD 沿用 42px 纵深，本站外框距离为 16px，上游为 9px；芯片保留 12px 可读字号。使用本站蓝白与明暗变量；箔光、眩光和扫描带强度仍为本地适配，不宣称每个视觉参数或 Motion spring 完全相同 |
| `src/journal-experience.ts` | 原 GSAP 控制器持有 1.85 秒图卡入场生命周期，覆盖上述 CSS 子动画；继续负责倾斜、离屏／弹层／失焦／减少动效门控与清理 | 复用已安装 GSAP，不引入 React / Next / Motion；全图不再靠单个整体裁切冒充分层入场 |
| 首屏背景 | About 原有 hero-glow、Aurora 强度 0.8、基础网格透明度 0.7、鼠标范围点亮网格，是本次背景层次依据 | 复用现有 `src/ambient.ts` 的 `mountAmbient`，其共享适配还包含站内既有 64px 网格拖尾。同一宿主的查询刷新复用实例，宿主更换／销毁才释放；不另装第二套光标或粒子渲染器 |
| 主题导读 | 12 列中左 3、正文 8、末尾 1 列留白；正文上限 736px，首段 20px／1.85，后段 17px／1.9，段间 20px；顶部／底部 40／96px；sticky 轨道 top 112px、进度线 128px | 本地列间距 24px，上游桌面为 40px；现有博客说明和两条实践摘要改为连续正文，不移植人物经历，也不保留额外主题标题。既有 14 单位逐字亮起、85%→55% 阅读带和 70%→60% 段落进度仍由原控制器负责 |
| 标题下划线 | 复用上游 DrawUnderline 原路径 `M3 9.6C58 4.9 127 3.2 196 5.3S283 9.6 297 4.4`、`viewBox="0 0 300 14"`、`pathLength="1"` 与 0.9 秒绘制时长 | 由本地标题入场生命周期触发，不声称同时复制了 SectionHeading 全部 SplitText 延迟计算公式 |

新增两份上游依赖按固定提交 `git ls-tree` 获取 blob，并用 `git cat-file` 读取原始字节，独立重算 Git blob SHA-1、字节数与 SHA-256；以下身份指向上游原文件，不是本地适配后的文件：

| 上游路径 | Git blob | 字节数 | SHA-256 |
| --- | --- | --- | --- |
| `src/components/fx/draw-underline.tsx` | `762e222d0cae2b72fc1d124f800c50a259c8af99` | 1133 | `1e8329aaa29d32a5ea098e676f2b234088194614c42989dbc4a788a54bbe290f` |
| `src/components/fx/border-beam.tsx` | `3747f4153564ed8cf7f9b6a11189286a2abbb084` | 1387 | `98d86176bbe7a6587ab0dc3d1eedea32d59c251fd8876e24c856fbc3a6cd311f` |

许可继续为 MIT，版权为 `2026 Dingxin Tao`，保留于 `vendor/tdx/LICENSE`。几何、源码身份与适配说明不等于视觉超过参考站。现有真实日期时间线、统一 Publications 索引、搜索／标签／排序／清除和原 Reader 继续使用原模块，没有增加人物履历、论文、账户数据或后台能力，也不承诺历史素材或上游开发过程完全未使用 AI。

本轮独立验证：新增结构、背景挂载与清理用例先在旧实现复现 5 项失败；更正后的相关回归 **61/61**，最终完整 runner **279/279**，0 失败、0 跳过，TypeScript 和构建通过。测试日志为 `outputs/journal-about-review-20261018/tests.log`。实际 IAB 检查与源代码测试分别记录：

- 对本地博客与真实友人 About 同时设置 1152×720 视口，分别保存 `05-blog-1152.png` 与 `04-reference-1152.png`。本地内容区实际宽 1142px（滚动条占 10px），首屏约 540.80px，标题 52px，右卡 352×316.80px；首屏与导读在 y≈540.80px 衔接。该测量只适用于当次字体与视口。
- 浅色背景有鼠标局部网格高光及拖尾，使用既有全局光标；深色卡片实测倾斜约 X 5.58°／Y 6.08°、箔光 opacity≈0.536、边缘光束 running，角框随移入扩展，移出后移除指针状态。
- 点击右卡打开 `/blog/personal-knowledge-base-completed` 原 Reader，博客进入 inert 且背景暂停；关闭后回到 `/blog`，焦点恢复到 `featured-personal-knowledge-base-completed`。
- 搜索 Obsidian 显示两篇文章，博客首屏宿主始终只有一份 `.u-ambient`；页面内另有隐藏首页保留的暂停实例，不误记为博客重复挂载。清空后恢复原目录。
- 实时启用减少动态效果后，博客 live 状态为 false、背景暂停、边缘光束 paused、卡片 opacity 为 1，随后恢复系统偏好。英文切换后 `clientWidth = scrollWidth = 1152`，博客背景仍一份。
- 最终恢复中文浅色、清除视口覆盖并回到顶部，实际视口 1162×980，文档 `clientWidth = scrollWidth = 1152`；warn/error 日志为空。最终截图 `07-blog-final-light.png`，深色悬停证据 `06-blog-dark-hover.png`，结构化记录 `browser.json`，均位于 `outputs/journal-about-review-20261018/`。

本轮没有重新验收全部后续章节、全部语言／主题／尺寸组合或移动端，也没有改动资源中心书本、首页、后台、持久数据或进行发布和推送。

## 此前资源中心来源范围

资源中心总览薄适配同一固定提交的 ProjectsGrid／ProjectPreviewCard，复用 PageExperience 的追光与 GSAP 揭示；CSS 3D 图书仅为页面装饰。Lucide `book-open` 固定于 `1ef60af944de207e0d5176905a0759ba12e6ee8d`，ISC 与 Feather MIT 许可保留在 `vendor/lucide/LICENSE`。精确文件 Git blob、SVG／许可 SHA-256 和边界见 `SOURCES.json.libraryPageUI`。没有新增 NPM 依赖，不声称本地 UI 每行均为未经修改的第三方代码。

| 路径 | 本轮实现范围 | 内容与权限边界 |
| --- | --- | --- |
| `/blog` | Journal 首屏与真实封面、主题导读与段落序号、按日期排列的文章时间线、统一 Publications 文章索引与查询/标签/排序/清除、继续阅读专题 | 四篇已有公开文章、两个实践主题；旧精选大卡和网格/列表切换已移除，所有文章入口使用现有 Reader |
| `/blog/:slug` | 真实正文、目录活动项与进度、点击定位、下一篇、返回、原文入口；封面和正文图片可放大 | 正文保持原文中文，英文界面不伪装成正文翻译；图片加载出正的自然尺寸后才启用放大 |
| `/work` | 两个真实实践专题、分类筛选、卡片与索引列表、进入相关文章 | 个人知识库、AI 影像工作流；两主题串起四篇已有文章，没有虚构独立产品、演示或下载 |
| `/learning` | 两个专题的阅读路径、原文日期与先后顺序、返回博客 | 沿用同一组两主题四文章，没有新增课程、学习进度或模板库存 |
| `/software` | 公开工具使用记录、主站软件栏目入口与登录/权限说明 | 审阅时匿名请求返回 HTTP 401；已登录可见内容及权限范围未知，不能据此认定栏目为空或未发布 |
| `/resources` | 替换旧目录的藏书总览、搜索/分类/双视图及访问状态；书籍入口前往主站原 Reader | 对应主站 `resource-center`；复用原 `contentQuery`，仅匿名 GET 转发元数据，401/403 状态码保留，不转 Cookie/Authorization；书籍和分类只取真实 API，不推断空库 |
| `/community` | 沿用筹备状态、四个原有版块和三个原有参与机制 | 不承诺已开放论坛，不添加在线人数、虚假活动曲线或社区后台 |
| `/contact` | 沿用三项服务标题和两个作者平台入口 | 不补造邮箱、表单、价格或服务时效 |
| `/support`、未知路径 | 保留感谢/渠道说明、独立 404 与真实返回入口 | 不增加支付表单、赞助二维码或混用页面状态 |

主站资料栏目 `resources` 映射本地 `/learning`，与主站 `resource-center` 藏书阅读不同。“匿名请求返回 401”只能支持访问受限这一事实，不能推断书库为空、未发布或登录后可见内容。

## 交互、可访问性与生命周期

- `pages.ts` 继续拥有页面内容和原生查询控件，`blog-query.ts` 复用 BlogExplorer 查询模型；Journal 控制器拥有 `data-journal-*` 节点及 Publications 文章行入场。旧目录卡片与视图切换不再保留。语言重建保留实际控件或链接的焦点身份，不抢占弹层焦点。
- Journal 的封面倾斜、箔光、入场、导读和时间线进度，在离屏、弹层遮盖、隐藏、失焦、减少动效、粗指针或退出时暂停或结束；结束后保持正文可读。刷新、resize 与销毁后的旧 observer、动画和输入回调不能继续改写当前页面。
- 博客保留查询、标签、排序和清除状态，删除 `blog.view` 与视图切换控件；输入法组合期间 Escape 不清空搜索。作品页独立的主题筛选与双视图保持原有职责，学习页仍为固定阅读路径。页面交互只使用既有内容、路径和阅读入口。
- 文章请求、prepare / reveal 和关闭流程区分代次，过期请求与过期入场不能覆盖新文章或重新打开已关闭 Reader。失败请求可重试，图片失败保留可用反馈与原文入口。
- 目录跳转跟踪上方未加载图片引起的排版变化；用户主动滚动、关闭文章或选择新目标会取消旧纠正。语言刷新保持已加载正文与原阅读位置。
- PhotoSwipe 负责原图缩放、平移和图片弹层焦点约束；本地适配负责 Reader inert、原滚动位置、焦点归还与清理。图片 Escape 先关闭图片，再次 Escape 才关闭文章。换文章、关闭、语言更新、图片源变更/失败和减少动效更新均释放对应图片查看状态；原有图片外链不被包成嵌套交互。
- 首页跑马灯在隐藏期间收到语言或尺寸变化时保留有效宽度，回到首页后重新测量；暂停/恢复由现有共享门控决定，不更改用户的减少动效偏好。

## 资源中心验证状态

当前本地匿名元数据请求返回 HTTP 401，页面引导前往主站继续阅读。真实登录后的书目与章节阅读不属于本地匿名预览的验收结论。

- 完整 runner **255/255 通过，0 失败、0 跳过**；TypeScript 检查、构建通过。日志：[library-final-tests.log](../../outputs/content-adaptation-20261018/library-final-tests.log)。回归覆盖原查询契约、元数据白名单、401/403、只读转发、错误/空库/无结果区别，以及离页取消。
- 先用回归复现分类/分页焦点丢失、加载中换布局误清 busy、语言重建丢草稿，再修复；分页按“上一页/下一页”语义恢复焦点，用户移到外部或弹层后不抢回。草稿与已提交查询分开保存，换语言不自动提交草稿。
- 真实 IAB **1440×1000 中文浅色、1280×900 英文深色**均无横向溢出。首屏书本有实际鼠标倾斜和既有光标提示，浏览藏书可定位目录，阅读说明可用 Enter 展开。减少动效切换后书本 transition 为 `0s`，文字仍可见。
- 真实匿名页显示“需要登录”，没有虚构书目或误报空库。证据：[浅色首屏](../../outputs/content-adaptation-20261018/11-library-light.png)、[深色访问状态](../../outputs/content-adaptation-20261018/12-library-dark-access.png)。
- 搜索、分类、VIP 元信息、书架/列表与语言草稿的有数据实测使用**独立离线验收服务**，画面顶部明确标注合成书目；该服务不接生产数据，验收后停止。证据：[离线书架](../../outputs/content-adaptation-20261018/13-library-fixture-grid.png)。这张图不代表主站库存，也不证明真实登录后的书目已接通。
- 本轮操作后读取的真实页与离线验收页 `warn/error` 均为空。只说明本轮桌面操作结果，不声称手机、跨浏览器或生产登录验收完成。

## 此前博客验证与已修复缺陷

上一批存档日志 [tests.log](../../outputs/content-adaptation-20261018/tests.log) 记录完整 runner **226/226 通过，失败与跳过均为 0**，当批 TypeScript 检查与构建也通过。该结果产生于本次统一 Publications 索引替换之前，保留为历史记录。本次另行执行的完整 runner 为 **228/228 通过，失败与跳过均为 0**，TypeScript 检查与构建通过；日志为 [journal-replacement-tests.log](../../outputs/content-adaptation-20261018/journal-replacement-tests.log)。测试数只描述相应执行快照，后续以实际日志为准。

上一批回归覆盖真实内容与查询、作品/学习专题、路由和转场竞态、Reader 异步进入与关闭、目录因图片布局变化后的定位、图片查看生命周期、焦点返回、模态冲突、跑马灯宽度恢复，以及 Journal 的暂停、刷新、resize 和过期回调。本次统一索引的内容、查询、旧精选/双视图移除与生命周期回归，以根代理新的执行记录为准。DOM / 动画替身验证可控时序，不代替新版真实浏览器验证。

上一批首次真实浏览器检查发现：封面在 `pending` 阶段被 CSS `clip-path` 裁成零面积，IntersectionObserver 无法达到入场阈值，导致首屏右侧空白。已先补样式回归，再把 pending 改为不裁切的透明状态，仅在 GSAP 开始播放时执行 clip 揭示；当批首屏真实封面与指针效果已复测。

上一批段落轨道另修复两处问题：暂停期间缓存最新段落、恢复时立即补写序号；将百分比 `rootMargin` 改为按 `innerHeight` 换算的像素带，resize 重建 observer，并拒绝旧 observer 的迟到回调。当批回归先复现暂停恢复错误再通过，真实浏览器滚动核对到 `03 / 03`。这些记录不替代本次索引替换后的集成复测。

## 上一批真实桌面浏览器记录（索引替换前）

以下项目由根代理在本地 IAB 以真实操作核对，证据目录为 `D:/博客/outputs/content-adaptation-20261018/`。这些截图与操作发生在本次统一 Publications 索引替换之前，保留作历史证据，不作为新版索引验收：

- **1440×1000，中文浅色与英文深色博客首屏**：真实封面可见，页面无横向溢出；鼠标移入封面后有实际倾斜和箔光响应。证据：[中文首屏](../../outputs/content-adaptation-20261018/04-journal-hero.png)、[英文深色首屏](../../outputs/content-adaptation-20261018/08-journal-dark-en.png)。
- **主题导读与时间线**：滚动后段落轨道到达 `03 / 03`；按真实日期排列的时间线卡片会揭示，卡片进入 Reader 后返回原时间线入口。证据：[主题导读](../../outputs/content-adaptation-20261018/05-journal-story.png)、[文章时间线](../../outputs/content-adaptation-20261018/06-journal-timeline.png)。
- **正文原图查看**：点击正文图片打开 PhotoSwipe，关闭图片后 Reader 的 `scrollTop` 保持 **1671**，焦点回到对应图片；再次 Escape 关闭 Reader，返回原时间线入口。证据：[正文原图查看](../../outputs/content-adaptation-20261018/07-body-image-viewer.png)。该数值记录当次操作位置，不是布局常量。
- **已移除的旧目录交互**：当时搜索 `Obsidian` 得到两条实际文章，切换旧列表视图后仍为两条。该视图及切换现已移除，这条历史记录不能证明新版 Publications 查询已通过。
- **首页恢复与弹层门控**：隐藏首页后切换英文并 resize 到 1280px，再返回首页，跑马灯宽度恢复；Palette 打开时暂停、关闭后恢复已操作核对。这一专项记录不替代最终 1280px 全页复查。

上一批作品卡片画面保留于 [作品卡片截图](../../outputs/content-adaptation-20261018/02-work-cards.png)。截图证明相应画面，不单独证明全部键盘、筛选组合或所有路径均完成本轮浏览器复测。

## 上一批最终集成复测结果（索引替换前）

- **跨页专题锚点**：真实浏览器从 Journal 进入 `/learning#track-film` 后，对应专题 section 顶部约为 **91.95px**，封面可见，页面无横向溢出。该读数是当次视口下的结果，不是固定布局值。
- **指定页面布局**：Journal 在 1440×1000 下的中文浅色与英文深色两组视图均无横向溢出；Journal 与 Learning 在 1280×800 下均无横向溢出。本项只覆盖这些页面、主题和尺寸，不声称全部八个栏目完成本轮宽度检查。
- **实时减少动效**：浏览器切换到 `prefers-reduced-motion: reduce` 后，封面 `opacity` 为 `1`、`clip-path` 为 `none`，导读 lead 全部可读。
- **当批最终控制台**：上一批最终读取的 `dev.logs` 中 `warn`、`error` 均为空数组。该结果仅对应当时操作，不代表本次新索引的控制台结果，也不代表长期运行或跨浏览器保证。

上一批最终复测的结构化记录保留于 [browser-acceptance.json](../../outputs/content-adaptation-20261018/browser-acceptance.json)，对应旧截图与测试日志见上文。

## 本轮统一 Publications 索引验收

以下结果来自根代理对新版索引的实际 IAB 操作，独立于上述旧精选卡、网格/列表证据：

- **旧结构移除**：`#journal-catalog` 内 `.blog-shell`、`.feature`、`.posts`、`.rows`、`[data-view]` 的匹配总数为 **0**，实际呈现 **4 行 Publications 文章**。
- **查询、排序与清除**：无结果查询为 0 条并显示新的空状态；查询 `Obsidian` 为 2 条，最早排序后的 `data-post` 顺序为 `[2, 0]`；清除后恢复 4 条且焦点留在搜索框，`obsidian` 标签筛选为 2 条。
- **行悬停反馈**：实际鼠标操作观察到行扫光、强调底线、描边序号和双箭头变化。
- **阅读器返回**：点击文章进入 Reader，关闭后焦点回到 `data-journal-focus="catalog-personal-knowledge-base-completed"`，路径回到原文章索引锚点 `#journal-catalog`。
- **指定视图布局**：1440px 中文浅色与 1280px 英文深色无横向溢出。证据：[新版文章索引](../../outputs/content-adaptation-20261018/09-journal-replacement.png)、[新版英文深色](../../outputs/content-adaptation-20261018/10-journal-replacement-dark.png)。本次没有重验全部页面或全部语言/主题组合。
- **实时减少动效**：切换到 `prefers-reduced-motion: reduce` 后，新箭头与扫光的 `transitionDuration` 为 `0s`，4 行均为 `opacity: 1`、`transform: none`。
- **最终控制台**：本次 `warn`、`error` 日志均为空数组；这是本次操作结果，不是长期运行或跨浏览器保证。

本次结构化证据已保存于 [journal-replacement-browser.json](../../outputs/content-adaptation-20261018/journal-replacement-browser.json)；新截图与测试日志使用本次独立文件名，不把上一批 226/226 或旧列表操作继承为新索引结果。

本记录仅说明当前本地预览的内容边界和验证证据，不构成生产发布或 GitHub 推送。没有修改生产内容、账号、VIP、头像、上传文件或后台接口；测试通过也不等同于视觉达到或超过参考站。

## 资源中心书本替换（2026-10-18）

旧 CSS 拼接书本已移除，改为固定提交 `32e8c1a1e22f96059612a89d0c21d46c76ca7374` 的 irma-book 实体模型。仅导入 book3d 和 MIT 许可，复用现有 Three；几何、材质、纸纹和开封算法来自上游，BookViewer 的宿主资源清理与调度修改见 UPSTREAM.md。此项目较新、没有 release，属于本地隔离预览选型，不宣称成熟稳定；没有导入 AI 媒体，也不承诺上游作者的开发过程没有 AI 辅助。

本轮浏览器实测：1440×1000 中文浅色／深色、1280×900 英文深色；开合、拖转不误开封、Enter 开合、Home 复位；切到博客后旧 book canvas 为 0，返回及语言刷新后只有 1 个 canvas。最终中文浅色 `clientWidth = scrollWidth = 1440`；英文深色两者为 1270（1280px 视口含滚动条），没有横向溢出。控制台 warn/error 为空。保留原目录动作，滚轮缩放关闭；原书库权限及阅读器未改。

截图：`outputs/book-review-20261018/final-light.png`、`closed-dark.png`、`open-light.png`、`dragged-dark.png`、`english-dark-1280.png`。`open-light.png` 为最终 0.82 相机比例，较早试验截图不作最终证据。完整测试 263/263、TypeScript 与构建通过，日志 `outputs/book-review-20261018/tests-final.log`；新增 8 个书本接入用例覆盖懒加载、卸载竞态、WebGL 初始化失败、原生／键盘开合、点击同步、inert、实时减少动态及幂等清理。浏览器证据不代表生产发布、全设备性能或视觉优于参考站。

## 桌面小字可读性对标与修复（2026-10-18）

本次针对用户指出的“小字看不清”，读取本地实际 CSS，并对照已核实 Git checkout 的 TDX 固定提交 `c73bc4966f0ba808b978e22eccf5a063fc649751`；不依据截图猜测字号。参考源码：[导航 nav-links.tsx](https://github.com/DingxinTao0417/tdx-portfolio/blob/c73bc4966f0ba808b978e22eccf5a063fc649751/src/components/layout/nav-links.tsx) 使用 `text-[13px]`；[Publications](https://github.com/DingxinTao0417/tdx-portfolio/blob/c73bc4966f0ba808b978e22eccf5a063fc649751/src/components/about/publications.tsx) 元信息使用 `text-xs`、操作使用 `text-sm`；[页脚](https://github.com/DingxinTao0417/tdx-portfolio/blob/c73bc4966f0ba808b978e22eccf5a063fc649751/src/components/layout/footer.tsx) 常规链接使用 `text-sm`、底部使用 `text-xs`。按默认 16px 根字号，后两者分别折算为 14px 和 12px。[上游 globals.css](https://github.com/DingxinTao0417/tdx-portfolio/blob/c73bc4966f0ba808b978e22eccf5a063fc649751/src/app/globals.css) 的 eyebrow 为 `0.72rem`，同一假设下为 11.52px。参考站也有 9–10px HUD 或装饰字，不能据此宣称其所有文字都大或全部符合可读性要求。

本地在所属原规则内修改以下有效信息与操作小字，没有新增功能、改变大标题或重排结构，也没有在文件末尾追加覆盖规则：

| 本地规则归属与区域 | 修改前 | 修改后 |
| --- | --- | --- |
| `www/style.css` 品牌中文附注 | 10px | 12px；本次遗漏复查已是 12px，未重复修改 |
| `www/style.css` 快捷键、语言、搜索分组 | 10–11px | 12px |
| `www/style.css` 1024–1279px 桌面导航 | 12.5px | 13px；1280px 以上原 13px 保留 |
| `src/hero.css` 形态选择、暂停、实践入口、探索操作 | 9–10px | 13px |
| `src/hero.css` 说明、记录与底部小字 | 9px | 12px；纯装饰编号 8px 改 11px，移除编号额外 `.65` 透明度 |
| `src/inner-pages.css` 面包屑、分类、统计、记录信息 | 9–10px | 12px；纯编号保留 11px |
| `src/inner-pages.css` 列表切换 | 11px | 13px |
| `src/home-closing.css` 页脚标签、时钟、附注 | 10–11px | 12px；字体说明 10.5px 改 12px |
| `src/home-closing.css` 返回顶部 | 11px | 13px |
| `src/journal-page.css` 博客元信息、时间、结果状态 | 9–10px | 12px |
| `src/journal-page.css` 筛选、清空、排序与更多标签 | 10–12px | 13px |
| `src/journal-page.css` 阅读操作 | 11px | 14px；装饰 HUD 8px 改 11px |
| `src/home-sections.css` 发布月份、文章分类、资料开放状态 | 10px / 10.5px / 10.5px | 均为 12px |
| `src/directions.css` 方向区块 eyebrow | 10px | 12px |
| `src/showcase.css` 展示域名、轮播纯编号 | 10px / 10px | 12px / 11px |
| `src/reader.css` 关闭按钮 Esc 快捷键提示 | 10px | 12px |

对比度计算使用 CSS 中的前景与纯背景色、sRGB 相对亮度公式，并非对渐变、图片或玻璃背板的浏览器逐像素验收。当前浅色 `--muted: #5f5f66` 对 `--bg: #f5f6f8` 约 **5.86:1**，深色 `#90919a` 对 `#090d17` 约 **6.20:1**，均高于 [WCAG 普通文字最低 4.5:1](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)。但同样文字再叠 `.65` opacity 并合成到对应纯底色后，约降至 **2.80:1 / 3.24:1**。因此保留全局 `--muted`，移除了有信息含义的 `.page-crumb small` 与 `.practice-filters sup` 的额外透明度；原生 disabled 控件不被误记为有效信息的对比度失败。

新增 [microtype.test.mjs](./tests/microtype.test.mjs) 先复现快捷键仅 10px，再验证实际 JSDOM CSS 计算结果中的有效信息不低于 12px、操作不低于 13px，以及面包屑附注不再额外淡化。该测试会将字体族 CSS 变量替换为测试环境可解析的系统字体，不代替真实浏览器字体渲染或布局检查。本次相关 header、hero-scene-ui、home-closing、inner-pages、journal-page 与 microtype 回归共 **51/51 通过**；根代理随后执行完整 runner **276/276 通过，0 失败、0 跳过**。这两项测试数仅对应本轮执行快照。此处不宣称本轮浅色／深色浏览器验收已经完成，也不把此前截图继承为修改后证据。

## 多页实体书与小字的最终浏览器核对（2026-10-18）

本轮书壳继续用固定 irma-book，纸张采用固定 quick_flipbook 1.1.3 与 three.modifiers 2.5.7 的原有 Bend/Twist/PageCurve；没有新增纸张物理算法或 AI 媒体。宿主只组合坐标、封面放平／镜头、字号和输入逻辑。六张双面导览纸不代表真实库存或上传书籍正文；真实目录与主站 Reader、账号权限仍属原模块。来源及受控 hinge 掩码修复详见 `SOURCES.json.readingRoomBookUI` 与两个 vendor 的 `UPSTREAM.md`。

实际 IAB 桌面 1152×980，本轮中文浅色与深色分别核对：

- 初始正面直立；点击真实封面后平躺并打开，已翻计数从 0 开始。
- 纸面上向下滚轮逐张翻至 **6/6**，反向从左页回翻至 **1/6**；翻页期间 `scrollY` 始终为 173。末页下一张按钮 disabled。此前单独核对反向回到 0/6。
- 鼠标移到书面外滚轮向上后，网页 `scrollY` 从 173 回到 0，页数仍 1/6，没有占用外部页面滚动。
- 左页遮挡已修复：纸堆支撑不再高于顶部纸，阅读模式内衬前板完整转开。最终浅深截图均能看到左右两张印刷导览页面。
- ArrowRight 可翻页、Home 可合上复位；实时启用 `prefers-reduced-motion: reduce` 后，开书及下一张操作仍可完成到 1/6，之后恢复系统偏好。
- 跳转博客并等待转场完成后，旧书 canvas 数为 0；返回资源中心重新建立，只有一份书籍画布。最终 warn/error 日志为空。
- 资源中心说明、文字按钮、功能说明、目录状态、翻页状态为 12px；书籍元信息与分类数量为 12px；纯装饰编号／封面小标最低 11px。博客面包屑／元信息 12px，阅读全文 14px，均为本轮浏览器实际计算样式。两页 `clientWidth = scrollWidth = 1152`。

本轮最终截图位于 `outputs/book-review-20261018/`：`reading-upright-final.png`、`reading-spread-final.png`、`reading-upright-dark-final.png`、`reading-spread-dark-final.png`、`microtype-blog-light-final.png`、`microtype-blog-dark-final.png`。这些属于本轮核对，不继承上一轮 1440/1280 的截图为新证据；本次没有重复验收所有页面／语言／设备或鉴定视觉超越参考站。

完整 runner **276/276**、类型检查与构建通过；第三方纸张独立验证使用实际 Three r186，三个物理纸张、121 帧、法线差 0，几何资源各释放一次。书库匿名接口仍要求登录，本轮没有查看已登录的库存或正文，更没有修改生产数据、推送 GitHub 或发布。

随后增补遗漏复查：将首页发布月份、分类、开放状态、方向 eyebrow、展示域名、Reader Esc 提示纳入实际 CSS 计算 fixture，先复现 `.log-month` 仍为 10px，再完成上表对应七条原规则修复；轮播纯编号单独验证不低于 11px。逐条检查这些选择器的 media 分支，未发现其字号在桌面断点再次缩回；`ambient.css` 的动态鼠标标签不在本轮范围。增补后的 home-sections、directions、showcase、reader-experience、reader-focus、reader-navigation 与 microtype 回归为 **69/69 通过，0 失败、0 跳过**。该增补未重新运行完整 runner，前述 276/276 保留为先前执行快照；本段也不代表浏览器明暗主题已完成验收。


## 资料与软件目录重构：固定开源来源与内容边界（2026-10-19）

以下先记录开源核查与本轮重构边界；实际实现、测试与浏览器结果单独记录在本节末尾。此前两个文章专题和软件页的两篇文章替代展示不再作为这两个集合的内容架构；历史验收记录保留其当时适用范围，不继承为本轮目录验收。

主源码审查已确认：当前预览的 /learning 对应独立的 kind=resources 资料集合，/software 对应独立软件集合；本轮匿名请求返回 401，不能把未登录解释为零条、空库或未发布。真实分类、标题、数量、图片、附件和访问动作须复用已查实的主站接口与内容。旧 track-knowledge、track-film 锚点只允许作为小型兼容入口指回原文，不继续充当资料库存。书库、管理系统、社区及账号/VIP权限不由这次目录换肤改写。

参考仓库固定提交为 [DingxinTao0417/tdx-portfolio](https://github.com/DingxinTao0417/tdx-portfolio/tree/c73bc4966f0ba808b978e22eccf5a063fc649751)（c73bc4966f0ba808b978e22eccf5a063fc649751）。友人“技术与工具”的实际路由是 **/skills**，学习总览为 **/learn**。许可为 [MIT](https://github.com/DingxinTao0417/tdx-portfolio/blob/c73bc4966f0ba808b978e22eccf5a063fc649751/LICENSE)，版权行是 Copyright (c) 2026 Dingxin Tao，沿用本地 vendor/tdx/LICENSE；复制或实质改编代码保留版权与许可声明。仓库代码许可不单独证明所有图片的权利，本轮仅用自己的已核实媒体。

| 精确源路径 | Git 原始字节数 | 可复用范围与事实 |
| --- | ---: | --- |
| [skills-explorer.tsx](https://github.com/DingxinTao0417/tdx-portfolio/blob/c73bc4966f0ba808b978e22eccf5a063fc649751/src/components/skills/skills-explorer.tsx) + [skills.module.css](https://github.com/DingxinTao0417/tdx-portfolio/blob/c73bc4966f0ba808b978e22eccf5a063fc649751/src/components/skills/skills.module.css) | 13,299 + 6,194 | SkillsExplorer 分类按钮最小48px、14px标签；hover/focus预览与点击选择独立，重复点选可清除。源弹簧 stiffness460 / damping38 / mass0.7。SkillMatrix是双列分类目录，**不含sticky**；20px标题、14px描述、40px行高，源分段条为目录占比而非熟练度。 |
| [course-shell.tsx](https://github.com/DingxinTao0417/tdx-portfolio/blob/c73bc4966f0ba808b978e22eccf5a063fc649751/src/components/learn/course-shell.tsx) + [course-sidebar.tsx](https://github.com/DingxinTao0417/tdx-portfolio/blob/c73bc4966f0ba808b978e22eccf5a063fc649751/src/components/learn/course-sidebar.tsx) | 1,662 + 9,148 | sticky目录真正来源；桌面侧栏17rem→18rem、top6rem、主区minmax(0,1fr)。分类用原生details/summary，summary与链接最小44px；当前项展开并调整目录滚动。不移植课程进度、题目或本地学习记录。 |
| [post-card-frame.tsx](https://github.com/DingxinTao0417/tdx-portfolio/blob/c73bc4966f0ba808b978e22eccf5a063fc649751/src/components/home/data/post-card-frame.tsx) + [post-card.module.css](https://github.com/DingxinTao0417/tdx-portfolio/blob/c73bc4966f0ba808b978e22eccf5a063fc649751/src/components/home/data/post-card.module.css) | 2,958 + 973 | 已适配卡片倾斜/封面视差：1000px透视、归一化偏移-.5..+.5、最大通常±2.5°/±3°、上移4px、封面1.06倍；离开/卸载复位、滚动使旧测量失效。仅fine mouse且非减少动效启用。 |
| [spotlight.tsx](https://github.com/DingxinTao0417/tdx-portfolio/blob/c73bc4966f0ba808b978e22eccf5a063fc649751/src/components/fx/spotlight.tsx) | 3,972 | 一组监听、rAF节流、局部坐标、滚动校正；同提交globals.css默认边光20rem、内光26rem、边1px、透明度变化0.5s。 |
| [border-beam.tsx](https://github.com/DingxinTao0417/tdx-portfolio/blob/c73bc4966f0ba808b978e22eccf5a063fc649751/src/components/fx/border-beam.tsx) | 1,387 | 默认6秒/圈、70°弧、1.5px环；learn主卡明确9秒/80°。离屏或文档隐藏暂停，减少动效时隐藏。 |
| [page-header.tsx](https://github.com/DingxinTao0417/tdx-portfolio/blob/c73bc4966f0ba808b978e22eccf5a063fc649751/src/components/ui/page-header.tsx) | 3,557 | 页头、水印、Aurora/Spotlight/grid组合依据；沿用当前蓝白/深色和既有适配器，不引入第二套鼠标系统。 |

全部源文件通过固定提交Git对象读取，逐个记录bytes、SHA-256，并将独立计算的Git blob SHA-1与该提交解析出的对象号匹配；完整列表（含两个路由页、globals.css、LICENSE）见 SOURCES.json.catalogPagesUI.reviewedSources。这些哈希证明读取的上游文件身份，不证明本地适配字节相同或视觉已达成。

本轮复用范围是分类目录、卡片光照/倾斜、可选边框光束与原生展开，通过现有TypeScript、GSAP、PageExperience、ambient、cursor适配；不增加React/Next/Motion/R3F框架，不复制技能球、课程库存、技能等级或作者身份。有效信息至少12px、操作13–14px，不照搬10–11px微字；焦点反馈遵守原项目单层边框约定。

实现后的验证应另行记录：401/已登录边界、真实分类数量、查询/清除、附件和正文原目标、旧锚点兼容、过期响应取消、路由清理、pointer复位、Reader/overlay inert暂停、减少动效及桌面浅深布局。本节不填写尚未执行的结果。

### 本轮实现与验证结果

- /learning 与 /software 已移除文章充当目录的旧实现，改用独立 catalog-model / catalog-page / catalog-page.css，复用正式 contentQuery 与 createContentReader；只读列表 relay 保留401/403，不传登录凭据。详情、附件、外链与账号访问仍由主站完成。
- 结构为首屏栏目介绍与索引卡、固定分类栏与搜索目录、卡片/列表切换、分页和原生折叠说明。分类与数量只来自响应；软件没有伪造评分、系统支持、版本、价格或下载量。旧 track 锚点仅置于小型、明确标注的公开博客相关阅读。
- 本轮最终完整 runner **295/295通过，0失败、0跳过**，严格类型检查与构建通过。测试日志为 outputs/catalog-redesign-20261019/tests-final.log。新增回归覆盖实际服务回调、查询白名单、两个 kind 分离、权限/失败/空结果、搜索/分类/分页、布局切换不重复请求、焦点、过期响应、封面失败与列表元信息。
- 真实4285：中文浅色分别检查两页，软件页另检查中文深色及英文深色、说明折叠与锚点跳转。原生窗口1162×980（可用宽1152）没有横向溢出；另在资料页原生1280×720（可用宽1270）检查首屏且无横向溢出。真实分类与正文没有在登录态下核对，两栏目匿名请求实际返回401，展示“需要登录·目录未读取”，不是空库。
- 鼠标移入软件首屏索引卡后，真实 DOM 有 data-page-spot-active、page-card-light，--page-mx=206px、--page-my=194px；没有图片的索引卡只追光，不宣称有封面倾斜。实际可见说明、状态、索引元信息为12px。
- 另在仅127.0.0.1:4296的隔离夹具检查有内容状态，固定黄色横条标明“6条虚构夹具，非真实库存”，未接入4285。夹具打包实际目录模块、PageExperience与实际CSS/字体。无图和故意坏图均显示文字封面；坏图计算display=none、fallback=flex。资料列表仍可见文件格式和字节数；搜索C得到1条，清除后恢复，分类二得到3条且焦点保留。六张卡片底部操作按行成对对齐；超长标题在深色列表中完整换行且没有横向溢出。软件切换后6条链接全部指向对应software详情，英文界面保持原中文内容，不虚构翻译。夹具元信息字号实测均12px。检查结束已关闭夹具页与服务器。
- 最终用户预览仅保留4285资料与软件两页。浅色首屏、目录状态、软件明暗/英文及隔离夹具截图位于 outputs/catalog-redesign-20261019/。07-materials-final.png 为真实资料首屏，不是虚构库存截图。没有新增AI生成媒体，没有修改生产内容、管理系统、账号/VIP或书库；没有推送或发布。