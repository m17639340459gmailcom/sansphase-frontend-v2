# 本轮前端交付与两轮复查

日期：2026-10-19，Asia/Shanghai。源码：`previews/hero-upgrade`；本地地址：`http://127.0.0.1:4285/`。本轮是可运行的本地前端演示交付，未部署、推送或改生产数据。

## 已完成的任务

| 用户任务 | 实现与实测结果 |
| --- | --- |
| 补齐演示数据 | 6 条资料、6 条软件、3 本书目，详情、分类、搜索、卡片 / 列表、清除筛选与直达链接可用。演示来源显式标记，与主站目录隔离。作者四篇文章保留原文阅读路径。来源与许可见 `DEMO_CONTENT_SOURCES.md`。 |
| 资料与软件首屏有自己的结构 | 资料使用三张任务索引卡；软件使用横向工具工作台。入口直接筛选 AI / Web / Mermaid 或 Logseq / Kdenlive / Excalidraw，不使用博客封面作为首屏模板。 |
| 加载结构 | Three.js / GPU、翻书和 PhotoSwipe 分包按需加载。构建压缩、内容哈希、字体子集、缓存校验、Brotli / gzip、失败重试及迟到回调隔离已验证，详见 `LOADING_AUDIT.md`。 |
| 鼠标与卡片逻辑 | 沿用既有 PageExperience、准星 / 语义光标、追光、有限倾斜及视差；输入框恢复文本光标。非操作信息不伪装成按钮。详情弹窗关闭恢复原卡片焦点；Tab / Shift+Tab 留在弹窗，Ctrl+K 不争抢。 |
| 首页立体形态 | 保留固定上游粒子引擎和無相字形；影像目标替换为实体摄影机，知识目标替换为有错开抽屉的档案柜。使用 Three.js 官方实体几何与表面采样器，未生成图片、模型文件或新增粒子算法。目标组合与本站适配是项目代码，不冒称上游未经修改的成品。 |
| 保留原博客功能 | 原正式源码不被演示覆盖；已有账号、VIP、作者管理、上传、章节、书签及媒体权限继续保留。复用已有内容查询，真实私有入口交回主站；完整接线映射见 `UI_SWAP_CONTRACT.md`。 |

## 第一轮：加载、查询和源码结构

核对官方 GitHub 源码、版本、许可、安全公告及官方构建文档。修复内页静态携带 Three.js、图片查看器提前下载、未压缩入口、模板监听缺失、旧 source map 可访问、权限错误缓存风险，以及弹窗与页面活动争用。补回归并实际请求验证 ETag / 304、HEAD、压缩、静态缓存、401 / no-store 与 source map 404。

最终启动 JavaScript 图由 2,221,760 B 降为 425,582 B，减少 80.84%。gzip 合计 143,025 B，Brotli q4 合计 143,244 B。此数字仅覆盖内页必须的入口静态依赖，延迟下载的 3D 等模块单独计算，不是公网加载时间承诺。原始证据在 `outputs/hero-upgrade/loading-measurement.json` 和 `loading-http-verification.json`。锁文件依赖的官方 npm 审计为 0 个已知公告；手动 vendor 不在 npm 审计范围，单独核对来源和许可。

## 第二轮：桌面视觉、交互与功能边界

独立复查示例来源、数据切换、模态焦点、原站模块及真实浏览器。发现并修复：主站来源标签下短暂残留示例卡、封面规范化执行两次后失效、HUD 字过小、实体模型与 HUD 重叠、原生示例弹窗末尾 Tab 离开页面。最后一项先用回归用例复现失败，再修复并做浏览器复验。

实机覆盖 1162×980、1280×720、1440×960 桌面视窗，中文浅色 / 英文深色，未发现页面横向溢出。核对首页形态切换、拖动不误点、键盘选形、暂停、减少动效；作品筛选与卡片悬停；博客查询；原文 Reader → PhotoSwipe → Escape 分层退出与焦点返回。资料 Mermaid 任务入口筛出 1 条，切列表及清除后回到 6 条；软件 Logseq 入口筛出 1 条；示例链接刷新仍可打开详情，关闭清除 sample 参数。书本实际纸面滚轮连续翻至第 2 / 6 页，纸面外继续滚动网页。最终首页与资料页浏览器 warning / error 日志为空；先前主动测试的主站目录匿名 401 属于保留的权限状态。

实机截图目录：

- `outputs/hero-upgrade/materials-final-light.png`
- `outputs/hero-upgrade/software-final-light.png`
- `outputs/hero-upgrade/software-final-dark-en.png`
- `outputs/hero-volume-20261019/07-camera-1280-clear-readouts.png`
- `outputs/hero-volume-20261019/08-archive-1280-clear-readouts.png`
- `outputs/hero-volume-20261019/13-resource-dialog-tab-fixed.png`

最终验证：`scripts/test.mjs` **329 / 329 通过**，TypeScript `--noEmit` 通过，显式构建通过。日志：`outputs/hero-upgrade/full-task-tests.log`、`loading-build.log`。详细第二轮结论见 `UI_SWAP_CONTRACT.md` 与 `SECOND_UX_REVIEW.md`。

## 交付范围

本轮本地演示任务已完成，已发现的上述问题均闭环。当前没有把 localhost 匿名演示当作已完成正式登录迁移的证明。真正替换正式 UI 时，仍要在同源正式应用接入现有 bootstrap / CMS、作品详情、账号、作者管理、原 Reader，并验证匿名 / 普通读者 / 有效与到期 VIP / 作者身份和旧链接。公网首屏、CDN、目标浏览器和不同 GPU 的性能需要在实际发布环境测量。这些明确门槛记录在替换契约中，原功能和生产数据保持独立，不扩大本地代理权限来假装完成。
