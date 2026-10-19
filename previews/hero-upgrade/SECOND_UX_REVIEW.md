# 第二轮独立交互与模型验收

日期：2026-10-19，Asia/Shanghai。本地桌面验收记录。

范围：`D:/博客/previews/hero-upgrade`，本地预览 `http://127.0.0.1:4285/`。与资料/软件页首幕验收分开，重点检查首页模型、HUD、鼠标反馈、作品筛选、文章阅读/图片层、博客搜索、资源中心演示详情和减少动态偏好。桌面视口为 1440×960 和 1280×720；没有把本轮结果扩展为手机、所有浏览器或正式登录/VIP 链路的结论。

## 依据与核查方法

1. 对照 TDX 固定提交 `c73bc4966f0ba808b978e22eccf5a063fc649751` 的粒子形态注册协议及交互设计；保留其引擎、GPU 模拟、形态循环、拖动/点击区分、键盘和降级机制。[TDX 源码说明](https://github.com/DingxinTao0417/tdx-portfolio/blob/c73bc4966f0ba808b978e22eccf5a063fc649751/docs/hero-particles.md)
2. 核查官方 Three.js 文档及本地锁定版本 `0.186.0` 的实际实现。使用官方几何体和 `MeshSurfaceSampler`，不新增粒子引擎。模型是对官方基础几何体的主题组合，不能描述为下载的成品模型，也不能把本地适配说成未修改的第三方源文件。[MeshSurfaceSampler](https://threejs.org/docs/pages/MeshSurfaceSampler.html)、[RoundedBoxGeometry](https://threejs.org/docs/pages/RoundedBoxGeometry.html)、[CylinderGeometry](https://threejs.org/docs/pages/CylinderGeometry.html)
3. 将“鼠标有变化”与实际操作相对应，输入区使用文本光标、拖动舞台保留明确操作提示，覆盖层打开后退让装饰光标。[MDN cursor](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/cursor)
4. 按模态对话框的首尾 Tab 循环、Escape、命名、关闭后焦点归还检查详情层及图片层。[WAI-ARIA Modal Dialog Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
5. 用浏览器临时模拟减少动态偏好检查静态可读和功能等价路径；完成后恢复模拟配置。[W3C Animation from Interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html)

## 实际发现及修复闭环

| 发现 | 证据 | 修复及复验 |
| --- | --- | --- |
| 首页舞台有意义的小字仍然过小 | 运行时 HUD 基准 10px、统计约 9.2px、形态名 11px、阶段 9px | 先增加会失败的字号回归，再将 HUD/统计/阶段改为 12px、形态名 13px，减少字距。实机两种桌面尺寸文字可读且无横向溢出。 |
| 新模型在笔记本尺寸与放大的 HUD 性能读数发生重叠 | 1280×720 截图和 DOM 实测；最初只检查输入区边界的投影断言没有覆盖文字占位 | 将模型投影断言收紧到舞台 y=0.20–0.88 的文字避让区，使用全部 65,536 个顶点；两个模型展示比例最终为 0.9，摄影机目标向下微调 0.12 个单位。再次检查 1280×720 与 1440×960 的明暗呈现。 |
| 演示详情首尾 Tab 未在弹窗内循环 | 资源中心示例详情：关闭按钮→Tab 官方来源→Tab 后 activeElement 为 BODY；反向同样存在 | 报告给主任务；主任务先补复现用例，再复用既有 Reader 的首尾键盘护栏，保留 native dialog/inert/Escape。重载后正向回关闭按钮、反向回官方来源，Escape 返回原书目并清理 `?sample`，实机复验通过。 |

## 已通过的实际交互检查

- 首页形态与内容同步：影像引擎对应真实 AI 视频工作流原文；知识归档对应真实个人知识库原文；無相身份形态不伪造文章入口。
- 电影摄影机有厚机身、带孔双卷盘、伸出的光学镜筒；知识归档有侧板、箱体和不同深度的抽屉。两个目标都有主体体积与朝向层次，替换原来的薄片式示例。保留现有無相目标。
- 舞台真实拖动约 80px 后仍为影像引擎，没有意外触发形态切换；释放后拖动状态复位。方向键和回车能够选择后续形态，状态与原文入口同步。
- 作品卡片移入时设置局部聚光/封面视差变量，移出清空变量。筛选“知识系统”并切为列表后只有一项，选中状态一致，无横向溢出。
- 从作品封面打开现有文章阅读格式，再打开 PhotoSwipe 图片层：第一次 Escape 只关闭图片并把焦点还给图片按钮；第二次 Escape 关闭文章并回到作品封面链接。
- 博客搜索 `Obsidian` 返回两篇真实文章；Escape 恢复四篇。输入控件为 14px、原生文本光标、无重复 outline/box-shadow；鼠标移动到输入区后装饰光标进入 native 状态。
- 减少动态偏好下：首页阶段为“静态”，运行模式 `STATIC`，暂停控件禁用，装饰光标关闭，内容和原文入口保持可用，无横向溢出。检查后已清除临时模拟。
- 资源中心演示书目明确标识为本地示例，来源链接保留官方 GitHub 项目；打开详情不写入正式资料库。Escape 清理示例查询参数，并把焦点还给 `demo-book-genai`。
- 资源中心 3D 书本离屏时尚未启动，滚回其视口后变为 ready；通过键盘打开后出现六页翻页状态和控制。此处验证的是延迟加载与开合入口，本轮不声称逐页验证了全部滚轮命中范围。
- 验收会话最后的 warning/error 日志为空。HUD 报告约 119–120 FPS 只表示本次设备的瞬时遥测，不作为跨设备性能承诺。

## 回归测试

最终对几何、HUD、引擎来源、控制、生命周期、卡片、Reader、演示对话框的定向组合：**73 / 73 通过**。

```text
node --test tests/microtype.test.mjs tests/scene-shapes.test.mjs tests/scene-lifecycle.test.mjs tests/scene-control.test.mjs tests/hero-scene-ui.test.mjs tests/hero-content.test.mjs tests/page-experience.test.mjs tests/reader-experience.test.mjs tests/catalog-demo.test.mjs
```

其中：新目标同时检查 14,400 / 65,536 粒子数量、有限坐标/引擎边界、确定性、主体深度、表面明暗分层、HUD 投影；来源用例验证 vendored TDX 文件与固定 SHA 清单的哈希一致。主任务另行完成最终全量测试与 TypeScript 检查，本记录不重复定义其全量计数。

## 最终截图索引

以下均为本机浏览器实际截图，没有生成或重绘。

截图保存在仓库的 `outputs/hero-volume-20261019/`，不作为发布源码。

- `07-camera-1280-clear-readouts.png`：1280×720 最终摄影机与可读 HUD。
- `08-archive-1280-clear-readouts.png`：1280×720 最终归档柜与可读 HUD。
- `09-work-reader-return.png`：文章/图片层关闭后返回作品。
- `10-blog-search-native-cursor.png`：博客输入区原生文本光标。
- `11-home-reduced-motion.png`：减少动态偏好下的静态首页。
- `13-resource-dialog-tab-fixed.png`：修复首尾 Tab 后的资源示例详情。
- `14-camera-final-1440-light.png` / `15-camera-final-1440-dark.png`：最终摄影机明暗模式。
- `16-archive-final-1440-dark.png` / `17-archive-final-1440-light.png`：最终归档柜明暗模式。

目录里 01–06、12 是迭代过程中保留的过程截图，最终验收应以上述截图为准。

临时 QA 标签页已关闭，浏览器视口 override 已 reset，减少动态模拟已清除，主题已恢复浅色。未进行生产部署或外部写入。
