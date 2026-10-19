# 新前端与正式博客的替换契约

核对日期：2026-10-19。本文依据仓库中的正式实现及本地测试，不读取生产私有数据。本文描述的是交接边界，不代表已部署或已完成登录态验收。

本文后续表格保留 4285 匿名演示阶段的交接清单。同日后续已实现同源接入和正式可选构建，当前实现与验证分别以 [LOCAL-INTEGRATION.md](./LOCAL-INTEGRATION.md) 和 [FRONTEND-DELIVERY.md](../../docs/FRONTEND-DELIVERY.md) 为准。演示服务器的限制继续成立，不应将它直接部署为正式服务器。

## 当前能交付什么

`previews/hero-upgrade` 是独立的本地 UI 演示，入口为 `127.0.0.1:4285`。它可以演示首页、内页、四篇真实公开文章，以及明确标注的开源演示目录。正式源码入口仍是仓库根目录；正式的发布、登录、会员、上传及阅读模块继续保留。

**本地演示不能直接替换正式站服务器。** 演示服务器只接受 GET/HEAD、不转发 Cookie 或 Authorization、不提供登录、管理或写入接口。把它原样部署为正式站会缺少账号及管理功能。上线替换应把新的视觉层接入正式应用的已有模块和同源接口，而不是放开演示代理权限。

## 已核对的功能映射

| 内容 / 能力 | 正式站契约与实现 | 当前新前端如何保留 | 正式替换前需要完成 |
| --- | --- | --- | --- |
| 首页与博客列表 | `src/app.mjs`、`src/access-policy.ts`：首页和完整博客是匿名开放面；`contentQuery({page:'notes'})` 生成既有列表参数 | 首页和 `/blog` 使用作者原有四篇公开记录，标题、封面、摘要、分类及真实阅读地址来自 `src/content.ts` | 接入正式 bootstrap / notes 分页，作者新发布、修改或撤稿应立即反映；不能让静态四篇演示清单成为唯一内容源 |
| 博客正文路由 | `src/blog-route.ts`：`/blog/<slug>` 与原 `#/note/<id>` 路由协同，合法 slug 有明确规则 | 本地 `/blog/<slug>` 打开演示 Reader；`/api/article/<slug>` 仅允许演示清单内的公开 slug，并清洗正文 | 保持旧链接和已收录文章路径，正式内容获取继续经过服务端当前发表状态检查；不得以本地正文缓存绕过撤稿 |
| 作品 | 正式 `works` 集合，列表 / 详情继续受正式登录策略管理；`src/catalog.ts` | `/work` 是四篇真实文章的两个实践专题，没有假造产品、作品管理记录或下载 | 这是内容演示组织，并非正式 works 集合适配。接入正式作品元数据、详情及权限，保留作者原有作品发布能力 |
| 资料 | 正式 `resources` 集合；`contentQuery({page:'resources'})`；`src/catalog.ts` | `/learning`：默认明确标注本地开源示例；“主站目录”使用原列表查询并保留 401/403。真实条目通过 `https://www.sansphase.com/#/resources/<id>` 交给主站原流程 | 同源接入后使用正式账号与原详情 / 附件模块；不得将演示记录写回作者资源集合 |
| 软件推荐 | 正式 `software` 集合；`contentQuery({page:'software'})` | `/software`：默认本地示例；真实目录继续原查询和 `#/software/<id>` 主站入口 | 同上；官网 / 下载来源以作者记录为准，不能把演示软件推荐当成作者实际体验记录 |
| 资源中心书库 | 独立的 `resource-center` 集合，不等于 `resources`；`src/catalog.ts`、`server/reader-access.ts` | `/resources`：三本明确标注的开源演示书目；主站书库继续原查询；真实书籍跳 `#/resource-center/<id>` | 挂接原书籍详情、章节清单和原 Reader；保留书籍的登录 / VIP 权限与真实插图 / 附件访问，不用演示书或四篇博客代替作者藏书 |
| 书籍分节 / 连续阅读 | `src/book-reader.mjs`、`src/book-section-reader.mjs`、`src/book-progress.mjs`；原 `/api/content?view=book-part&kind=resource-center&...` | 当前真实阅读留在主站。资源中心的 3D 翻书是展示物；示例详情是本地说明，不冒充正式正文 | 复用原模块，保留章节导航、续读、书签、插图放大、分段加载和版本定位。现有进度是浏览器本地记录，不宣称账号云同步 |
| 读者账号 | `src/reader-ui.ts`、`server/reader-service.ts`；`/api/reader/*`、`credentials:'same-origin'`、既有请求校验头 | 本地不模拟账号，也不跨域转发身份；权限入口指向主站 | 复用现有注册、验证、登录、找回、资料审核、头像、退出流程，保留安全验证。新视觉不能增加第二套账户或直接访问存储 |
| VIP 身份 / 到期 | 服务端判定；`server/reader-access.ts`、`src/reader-membership.ts`。非会员看到的 VIP 书籍元数据与正文能力区分处理 | 保留 `vipOnly` / `locked` 展示，401 与 403 独立，继续主站确认资格 | 前端显示必须依据服务器身份。退出、换号、到期、续期都应使私有内容和缓存失效；设备时钟只能用于估计倒计时 |
| 作者管理 / 上传 / 预览 | `src/author-entry.mjs`、`server/author-service.ts`、`server/content-service.ts`；`/api/author/*` | 演示服务器没有这些入口，既有正式模块保留 | 将新壳与原作者入口连接；保留预览身份、编辑未保存提示、上传和发布 / 撤稿流程，不改持久数据目录 |
| 插图 / 附件 | 正式 `/api/media/<uuid>`；`server.mjs`、`server/content-service.ts` 根据身份及 VIP 校验，下载与展示有既有处理 | 演示仅保留固定公共图片中继 `/media/<uuid>`；原目录下载不在本地直接执行，交由主站处理 | 复用正式图片和附件鉴权。不可把 `/api/media` 或作者媒体接口整个匿名代理；公开演示图不是权限证明 |
| 社区 / 支持等入口 | 仍属于正式站既有业务；本轮未迁移社区账号、管理和支付能力 | 本地只呈现既有的介绍边界和联系入口，没有伪造社区操作或付款成功 | 本轮不以社区演示页作为正式社区替代；将来接入时核实实际开关和业务入口，不以旧文案判断当前后台状态 |

## 查询与数据适配规则

复用正式 `src/content-reader.ts` 的 `contentQuery`。列表使用既有 `view=list`、`kind`、`page`、`category`、`q`；本地代理固定 `public=1`，不接受重复、未知、身份或 preview 参数。`public=1` 是读取提示，**不是登录或权限绕过开关**。正式服务端仍决定是否返回 401/403。

本地目录只保留验证后的元数据，不保留读者身份、草稿、私有书籍正文、附件内容或下载能力。目录 Reader 禁用本地内容缓存（`maxEntries:0`），路由离开和来源切换会取消请求；过期响应不能重绘新页面。来源切换必须先退休旧来源的可操作卡片，不能把演示条目留在“主站书库”标签之下。

本地示例入口是 `/learning?sample=<id>`、`/software?sample=<id>`、`/resources?sample=<id>`。它们只在本地模块中解析成明确标注的开源说明，并链接官方来源；不是新 API，不调用正式 Reader，不写作者内容或账号数据。原博客正文也不进入示例弹窗。

图片元数据在服务端和浏览器各验证一次。已知正式站公开 UUID 图片必须规范成既有 `/media/<uuid>`，且二次验证后不丢失。只允许普通展示参数进入校验，不能接受 `preview`、`download`、未知 / 重复参数、非 HTTPS 外域或凭据 URL。原 `/api/media` 及 `/api/author/media` 鉴权入口保持原状。

## 正式接入时必须通过的回归

1. 匿名访问：首页 / 博客可读；作品、资料、软件、书籍按照正式策略拒绝或引导；拒绝态不能变成“尚未发布”。
2. 普通读者、有效 VIP、到期 VIP、作者分别验证目录、书籍章节、插图、附件和作者预览；没有权限时不得因重用 DOM 或缓存看见正文。
3. 退出 / 换号 / 到期后再次打开之前读过的内容，服务端重新判权；页面缓存、预取和已挂载阅读器不能保留前一个身份的私有数据。
4. 作者发布、编辑、撤稿、上传后，列表 / 正文 / 封面与旧链接一致更新；真实内容来自正式接口，不依赖静态演示清单。以根目录原测试入口运行相关用例。
5. 书籍保留章节、小节、进度、书签、插图放大和失败重试；断网、换页、连续导航、键盘操作后不残留旧请求或旧焦点。
6. 原 `/blog/<slug>`、hash 栏目和详情链接、账户 / 作者入口均可到达；替换后的 URL 迁移规则需由正式路由适配，不能把所有 hash 都当页面锚点。
7. 使用原 `release:prepare` 流程从明确源码清单构建，保留原服务端、私有配置和持久数据目录。演示的 `outputs/hero-upgrade` 不是正式发布入口。

## 本轮准备检查记录

发现并修复两项 P2：①书库封面元数据残留 `/api/media/...` 导致演示代理 404，现已规范成可二次验证的公共图片路径，并补未知 / 重复 / 私有参数拒绝测试；②演示→主站书库等待时仍有旧演示卡片可点，现切换来源立即清理旧结果、分类及分页，展示明确忙碌态，保留返回演示按钮。

书库 / 示例 / 查询契约针对性验证：`tests/library-contract.test.mjs`、`tests/library-demo.test.mjs`、`tests/library-page.test.mjs`、`tests/demo-content.test.mjs`，本轮 41 项通过。该结果证明这些边界和本地交互回归通过，不代表正式账号已接入，也不替代上线前的两轮整站检查。

## 第二轮独立深度检查（round2）

2026-10-19 在目录来源切换、原生示例弹窗与首页动效暂停修复之后，重新检查实现并独立运行 `node scripts/test.mjs`：328 项通过。随后第二轮实机检查发现示例弹窗末尾 Tab 会离开页面，先新增失败回归，再复用 Reader 的首尾键盘护栏修复；浏览器 Tab / Shift+Tab / Escape 复验通过，最终 **329 项通过，0 项失败**。测试入口已纳入 `demo-content`、`catalog-demo`、`library-demo`，不是只运行首页旧用例。已发现问题均已闭环；结论限定为下面核对过的范围，不代表审美已客观超过参考站，也不代表已验收正式登录态。最终范围见 `TASK_ACCEPTANCE_20261019.md`。

| 复核范围 | 代码证据 | 本轮核对结果 |
| --- | --- | --- |
| 示例与真实数据分离 | `src/demo-catalog.ts`、`src/demo-library.ts`、`src/catalog-page.ts:119`、`src/library-page.ts:61` | 资料 6 条、软件 6 条、示例书目 3 条；默认本地模式不发 CMS 请求。来源标签、筛选及中英分类与当前来源一致；示例不伪装成作者作品、真实藏书或下载文件 |
| 切换来源与迟到响应 | `src/catalog-page.ts:174`、`src/catalog-page.ts:194`、`src/library-page.ts:120`、`src/library-page.ts:153`；两个 `*-demo.test.mjs` | 切主站时先移除旧示例卡片，再等待接口；取消旧请求且以 generation 拒绝迟到重绘；详情入口另有 demo 来源检查。401、403、连接失败和真实空列表保持区分，不用示例填补鉴权失败 |
| 弹窗、键盘与焦点 | `src/sample-dialog.ts:6`、`src/main.ts:677`、`src/main.ts:690`、`tests/palette-modal.test.mjs`、`tests/marquee.test.mjs` | 原生 dialog 管理模态焦点与 Escape；关闭清理 sample 参数并返回仍有效的触发元素；离页销毁弹窗。示例弹窗打开时 Ctrl+K 不叠加搜索，首页 ticker 暂停，关闭后按现有可见性条件恢复 |
| 生命周期与数据缓存 | `src/catalog-page.ts:210`、`src/library-page.ts:175`、`src/main.ts:734`；`tests/scene-lifecycle.test.mjs`、`tests/ambient-lifecycle.test.mjs`、`tests/library-book.test.mjs` | 目录请求、事件、环境交互、书籍展示和示例弹窗均有离页销毁；目录 Reader 使用 `maxEntries:0`。演示没有建立读者身份缓存或跨域身份代理 |
| 封面路径与权限边界 | `src/library-model.ts:13`、`tests/library-contract.test.mjs`、正式 `server.mjs:270`、`server/reader-access.ts` | 公共封面规范化可重复执行；私有、下载、未知及重复参数拒绝。正式目录及媒体是否可读仍由原服务端决定，`public=1` 不承担授权 |

同时以 Git 工作树核对正式 `server.mjs`、`src/app.mjs`、`src/content-reader.ts`、`src/book-reader.mjs`、`src/book-section-reader.mjs`、`src/reader-ui.ts`、`src/reader-membership.ts`、`src/blog-route.ts` 及 `server/author-service.ts`、`server/reader-service.ts`、`server/content-service.ts`、`server/reader-access.ts`：这些正式模块没有本轮未提交改动。原站账号、作者管理、VIP 和书籍阅读实现仍在；这项核对不能替代真实身份联调。

### 官方 GitHub 来源与许可复核

重新读取官方仓库的许可证或当前源码声明，核对本地清单和声明。项目用途、12 条示例的逐项入口及不冒充作者经历的限制见 [DEMO_CONTENT_SOURCES.md](./DEMO_CONTENT_SOURCES.md)。四个 Microsoft 入门课程、Mermaid 与 Actions 模板的根许可证为 MIT；六个软件条目的许可区分也保留在详情中。特别核对了 [VS Code 源仓库与 Microsoft 发行版的许可区别](https://github.com/microsoft/vscode#visual-studio-code)，以及 [Kdenlive 当前入口的 SPDX 声明](https://github.com/KDE/kdenlive/blob/master/src/main.cpp)，没有把它们统一写成“任意免费使用”。本演示仅链接这些软件与文档，没有捆绑其程序、模型、安装包或商标图像。

| 实际前端上游 | 官方核对依据 | 本地保留与限制 |
| --- | --- | --- |
| TDX 结构 / 粒子等适配 | [固定提交 MIT](https://github.com/DingxinTao0417/tdx-portfolio/blob/c73bc4966f0ba808b978e22eccf5a063fc649751/LICENSE) | `vendor/tdx/LICENSE` 保留版权；本轮取得的原 LICENSE 与本地字节一致。主题坐标和站点适配不宣称是上游原样效果 |
| Three.js r186 | [MIT](https://github.com/mrdoob/three.js/blob/r186/LICENSE) | 固定 0.186.0，保留声明 |
| Lenis 1.3.26 | [MIT](https://github.com/darkroomengineering/lenis/blob/v1.3.26/LICENSE) | 固定版本，保留声明 |
| PhotoSwipe 5.4.4 | [MIT](https://github.com/dimsemenov/PhotoSwipe/blob/v5.4.4/LICENSE) | 保留声明，图片交互仍通过本站 Reader 薄适配 |
| GSAP 3.15.0 | [官方 README 的标准许可声明](https://github.com/greensock/GSAP/blob/3.15.0/README.md) | 记录 GSAP Standard License，**未误标为 MIT** |
| Lucide 1.59.0 | [ISC 与 Feather 衍生图标 MIT](https://github.com/lucide-icons/lucide/blob/1.59.0/LICENSE) | 本地静态 SVG 子集，双重声明保留 |
| irma-book | [固定提交 MIT](https://github.com/fabiosantaniellobruun/irma-book/blob/32e8c1a1e22f96059612a89d0c21d46c76ca7374/LICENSE) | 仅展示书壳；上游提交少、无发行版，不宣称是成熟的生产组件 |
| quick_flipbook | [固定提交 BSD-2-Clause](https://github.com/bandinopla/quick_flipbook/blob/2c62c76b7dd91861f9e71259d8e37157018ba16e/LICENSE) | 保留版权与许可；用于展示翻页，不取代原站正文阅读 |
| three.modifiers 2.5.7 | [固定提交 README 的 BSD-3-Clause 声明](https://github.com/drawcall/threejs-mesh-modifiers/blob/f0d795e620409e2644ae0e3d8e809d88f0f3e0f2/README.md#license) | npm 包没有单独 LICENSE，已保留原 README、package 与来源说明；不虚构版权文件，不宣称维护活跃 |

来源页面核对与完整字节核对是两回事。本轮部分 raw 下载超时，因此没有把本轮结果描述为“所有上游文件重新逐字比对成功”；既有固定提交清单、来源原件与分发声明继续保留。浏览器访问的 GitHub 许可证页面已完成复核。第三方上游的开发过程无法认证为从未使用 AI；本地没有加入 AI 生成的图片、视频或模型。

### 正式更换前端的剩余门槛

当前交付是**可演示的新视觉前端及完整保留的旧站能力**。真正更换正式 UI 时，仍必须把 bootstrap / 列表 / 作品 / 正文接到同源正式应用，挂接原账号、作者管理和 Reader，并完成上文身份、撤稿、退出清缓存与旧 URL 回归，再从根源码走 `release:prepare`。这些属于正式接入和发布验收，不能拿 localhost 匿名预览或主站跳转代替；也不应为让演示看起来“已登录”而扩大本地代理权限。本轮没有部署、推送、写生产内容或改动持久数据。
