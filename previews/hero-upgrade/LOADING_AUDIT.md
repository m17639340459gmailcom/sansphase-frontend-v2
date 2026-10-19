# 第一轮独立复查：加载、异步生命周期与原站功能边界

检查日期：2026-10-19（Asia/Shanghai）。范围：`previews/hero-upgrade` 本地前端、构建器和只读本地转接层。未发布、未修改正式站点数据、账号、VIP 或后台。

## 检索依据

- [esbuild 的 splitting、minify、entryNames、metafile](https://esbuild.github.io/api/)：用工具原生的动态分包、压缩、内容哈希和构建清单，未另造打包器。
- [esbuild onLoad / watchFiles](https://esbuild.github.io/plugins/#on-load-results)：HTML、基础样式和许可声明纳入监听，避免只改模板却继续展示旧生成文件。
- [Node.js zlib 官方源码文档](https://github.com/nodejs/node/blob/main/doc/api/zlib.md)：gzip / Brotli 使用 Node 内置实现，静态压缩结果按内容校验码缓存；上限 32 个编码版本。
- [esbuild 0.28.2 发布记录](https://github.com/evanw/esbuild/releases/tag/v0.28.2) 与 [官方安全公告](https://github.com/evanw/esbuild/security/advisories)：核对 Windows 开发服务器、Deno 安装器及旧版 CORS 公告。已锁定版本 0.28.2 高于相关修复版；本项目使用 Node 构建，不使用 esbuild 的 serve / Deno 安装路径。
- [Three.js](https://github.com/mrdoob/three.js/security)、[GSAP](https://github.com/greensock/GSAP/security)、[PhotoSwipe](https://github.com/dimsemenov/PhotoSwipe/security)、[Lenis](https://github.com/darkroomengineering/lenis/security) 官方安全页面。检索时这些页面没有公开安全公告；这不等于不存在漏洞。
- npm 官方 registry 全依赖审计：108 个依赖条目，已知公告 0。原默认镜像不实现审计端点，随后通过命令参数指定官方 registry 重试成功，没有更改用户全局配置。证据：`outputs/hero-upgrade/dependency-audit-official.json`。该审计不包含手动保留的 vendor 源码，因此 vendor 仍单独保留固定版本、许可证及来源记录。

## 发现并修复的问题

| 级别 | 问题 | 调整与验证 |
| --- | --- | --- |
| P2 | 每个内页首访都静态下载首页 Three.js / GPU 代码 | hero DOM、导航和鼠标保持轻量；只有真正进入首页才动态导入 scene。构建依赖图测试确认内页入口不含 Three.js。 |
| P2 | 图片查看器成为所有页面的入口依赖 | PhotoSwipe 核心仅在准备阅读或点击图片时加载。增加下载失败重试、Escape、页面切换及取消后的迟到回调测试。 |
| P2 | 未压缩、无哈希的入口导致体积和缓存风险 | 共用 esbuild 配置，默认压缩并生成内容哈希及 HTML / 资源清单；调试模式需要显式 `PREVIEW_DEBUG=1`。 |
| P2 | HTML 与模板改动没有纳入构建监听 | 使用 esbuild 官方 watchFiles，保持模板、样式、许可说明与生成 HTML 一致。 |
| P2 | 旧构建目录可能残留可访问 source map | 常规服务器明确拒绝 `.map`；生产构建不生成 map。实际请求 `/build/main.js.map` 返回 404。 |
| P2 | 每次静态请求都完整传输 | 哈希文件 `immutable`；HTML / 基础样式重新校验；支持 ETag、304、HEAD、gzip、Brotli 与 Vary。接口、错误和权限状态保持 `no-store`。 |
| P2 | 直接打开内页时可能先闪首页 | 内页首访显示独立加载提示；模块下载或启动失败时提供重载和原站入口。测试覆盖模块失败恢复。 |
| P2 | 在隐藏首页绑定标题滚动动画 | 标题 ScrollTrigger 延迟到首次进入首页再安装，避免内页启动时给隐藏内容批量创建揭示动画。 |
| P2 | 新原生详情弹窗与命令面板 / 背景动画可能争用输入 | 弹窗开启时阻止命令面板并暂停页面/GPU 活动；弹窗采用原生对话框和现有 `data-lenis-prevent`。 |
| P2 | 静态构建缺少随包许可说明 | 构建复制保留原文的 `third-party-notices.txt`；页脚可访问。包含 MIT、OFL、Lucide ISC / Feather MIT、GSAP 非 MIT 声明等。 |

## 量化证据与限制

优化前入口图：main 944,963 B，静态共享 Three.js 1,276,797 B，总计 **2,221,760 B 原始 JavaScript**。证据：`outputs/hero-upgrade/bundle-before.json`。

第二轮弹窗键盘护栏修复后的最终构建，入口图为 **425,582 B 原始 JavaScript**（入口 423,504 B + 静态共享 2,078 B），相较检查开始时减少 **80.84%**。gzip 合计 143,025 B，Brotli（quality 4）合计 143,244 B。证据：`outputs/hero-upgrade/loading-measurement.json`。这些是依赖图的合计，不把延迟加载的 Three.js / GPU、书本或 PhotoSwipe 包算成所有内页必需的启动代码。

最终真实 HTTP 检查：`/learning` 返回引用哈希资源的 HTML；主入口 Brotli 142,309 B，哈希资源 `immutable`；HTML / 许可说明 `no-cache`；条件请求返回 304；HEAD 返回相同压缩长度但无响应体；常规 `.map` 请求返回 404；资料接口仍为 **401 / no-store**。证据：`outputs/hero-upgrade/loading-http-verification.json`。GPU、书本、图片查看器保持按需分包。后续源码变化应重新生成测量文件，不能沿用这些数值。

这些是构建大小和本机 HTTP 证据，**不是公网首屏时间、LCP、实际用户帧率或 CDN 效果**。字体按 Fontsource 的 unicode-range 和 swap 规则选择加载，没有整套字体预加载。首页显式进入后仍需 GPU 初始化；本地性能不能代表所有电脑。

## 原博客功能保留

- 复用正式 `src/content-reader.ts` 的列表查询及取消能力，分类 / 搜索 / 分页字段和各集合 kind 没有另造。
- 正式主站目录与本地 demo 数据有独立的选择和显式标记。401 / 403 不转换成成功；本地不接收、转发身份凭据，也不实现假的 VIP、上传或附件授权。
- Reader 的原文正文、图片放大、目录、阅读位置、焦点返回和快速换页继续保留并测试。
- 账号、VIP、书籍章节和附件仍由原站后端执行权限判断。正式功能的接线和切换约定见 `UI_SWAP_CONTRACT.md`；当前只读演示不能当作完成生产业务迁移的证明。

本轮没有发现还需要擅自修改后端或生产数据的理由。公网部署、生产账号、真实 CMS 附件、CDN 缓存和不同电脑 GPU 的验收需要在实际上线环境执行，不能由本地静态演示替代。
