# 文档治理与知识中心验收报告

审计日期：2026-11-16。代码核验基线：`de2ee0d3deec8c2b88db31de95fabe451d7b2816`，任务开始时本地 main 与 origin/main 一致，工作树干净。实际修改限于文档、文档显示组件、治理工具、测试及对应 CI；没有修改海牙、EASY 或下载的业务执行逻辑。

## 全量盘点与治理决策

基线有 492 份受 Git 管理的 Markdown，2 组字节级重复，恰为两对 foundation 报告。治理后机器清单扫描 517 份（排除本报告和生成的 inventory.md，包含新增、未忽略文档），当前完全重复 0 组，高相似候选 1 组。全部逐份记录路径、标题、内容分类、源码引用、Git 更新线索、有效性提示、重复路径、入链引用、展示建议及操作；数据见 [inventory.json](inventory.json)，可读清单见 [inventory.md](inventory.md)。这不是“517 份全部人工事实核验”的声明。

14 份登记文档为 CURRENT（其中 13 份在正式技术/API/机制菜单，另 1 份是独立工作流操作说明），18 份 HISTORICAL，8 份 SUPERSEDED，其余 477 份 REVIEW_REQUIRED。后者包含独立学习笔记、其他平台文档及未逐条核验的历史材料；保留原文，不以文件年龄认定错误。

对 16 个既有重点路径更新了时效性说明或兼容入口：8 篇旧逆向说明、4 个重复报告路径、海牙接口契约、工作流操作说明、接口链机制说明和 11 月 15 日实施计划。新增 11 篇权威技术规范。修复 11 个既有失效相对引用：9 个学习目录补 README 索引、期限监控的 2 个 API 相对路径。原验收数字、故障根因、材料解析规则与独有历史知识保留。

### A 级：完全重复

两份 integration-gap 报告和两份 fix-acceptance 报告分别只保留一份完整档案；四个旧路径保留历史兼容说明，指向档案及当前总览。原始 SHA-256、归档后 SHA-256、源路径和决策见 [migrations.json](migrations.json)。归档正文只因目录深度调整相对链接，原文内容可与基线 commit 比对；未删除实际业务验收证据。

### B 级：同机制的重复解释

8 篇 hague-ast-analysis、cdp-reverse-engineering、full-chain-diagnostics、protocol-semantics、viewstate-lifecycle、correlation-evidence、protocol-drift、tracing-and-status 保留历史正文，标记 superseded，并映射到当前权威规范。当前菜单只收录新规范，旧说明的插件链接可转到已展示的当前规范，历史档案不会因此进入正式菜单。

机器唯一高相似候选是 phase3-8-live-acceptance 与 phase3-9-live-acceptance（归一化三元组相似度 0.753）。两者已有非现行说明，分别列出不同阶段的待验接口范围，按独立历史记录 KEEP；不合并 PENDING 为成功。这一候选检测是文本启发式，不声称已穷尽所有语义重复。

### C 级：职责交叉

接口契约保留参数、端点和回执；操作指南说明用户如何恢复；并发容灾规范解释锁、身份、检查点和裁决。机制旧文档的材料解析、设计编号、来源与 AI 边界仍在原路径，执行与恢复解释链接权威规范，完整历史版另存档案。这样同一事实可追到一个权威解释，而非合成巨型文件。

## 当前事实核验

| 重点 | 当前代码与实际入口 | 结论范围 |
|---|---|---|
| ViewState / JSF / 漂移 / 组件注册表 | scripts/hague-research-worker.mjs 的 signal/xml 分支调用状态机、parseJsfProtocol、computeProtocolFingerprint、detectProtocolDrift 和 registry | 已接入研究消息链；缺少 baseline 不代表无漂移；不是写入授权 |
| AST | Worker ast/lookup → diagnostics/ast/analyzer.mjs → source index | Babel AST、有界静态求值与 UNKNOWN；识别调用不代表执行 |
| 计划身份 | draft-runner.ts → plan-identity.ts | 逐步骤身份及图纸 SHA-256；已执行/当前步骤不一致阻断，未来步骤差异单独处理 |
| 工作区材料 | HaguePage.vue → workspace-recovery.ts | IndexedDB Blob 先提交、清单后发布；刷新恢复不等于远端写入成功 |
| 调度 | draft-batch.ts、http-client.ts、http-context.ts、session-gate.ts | 剩余工作量优先、单案串行、网络许可与共享会话排他区分离 |
| 会话恢复 | hague-session.ts、http-client.ts、runner/recovery | 已有导航认证探测与有限恢复；不代替凭据登录或二次验证 |
| 历史结论 | archive/hague、2026-11-15-hague-resilience.md | 原阶段缺口与失败保留，但不冒充当前缺陷 |

上述规范逐篇附有可点击源码及测试入口。旧“状态机、统一语义与漂移未集成”的报告不再作为当前结论。核验提交保留为业务源码基线，文档展示 E2E 不会将算法证据等级冒升到真实业务验收。

用户已确认最新实际业务验收通过，本轮接受该结论。仓库保留的 13 件辅助快照、14 件辅助调用、无人干预阶段失败与计划中的未勾项分别属于各自时间和模式；本轮未发现可独立对应用户最新确认的、已提交的完整批次日志/截图组合，因此不补造成功率、不补勾旧记录，不把本机 test-results 或客户材料加入扩展。

## 权威目录与插件展示

```text
docs/engineering/
  README.md                         技术知识总览
  hague/
    README.md                       海牙技术总览
    architecture.md                 技术架构总览
    cdp-research.md                  CDP 全链路逆向
    javascript-ast.md                JavaScript AST
    jsf-protocol.md                  JSF / PrimeFaces
    viewstate-state-machine.md      ViewState 状态机
    protocol-fingerprint.md         协议指纹与漂移
    correlation-evidence.md         证据关联
    concurrency-and-recovery.md     并发调度与容灾
    diagnostics-and-maintenance.md  故障诊断与维护
```

插件“文档 → 逆向与算法”采用现有两级树：两个总览、海牙协议研究、自动化核心算法，不引入递归框架或独立站点。原使用文档、工作流、原理、接口及学习笔记入口保留。新增离线标题搜索、稳定中文小节锚点、来源/状态/核验版本显示、缺失或隐藏目标提示，并修正当前页面高亮和目录折叠的对象身份问题。

内容由 Vite glob 离线打包且按篇加载；只引入 engineering 规范，不引入 archive、诊断日志或客户材料。继续使用 DOMPurify 与现有 Mermaid，未放宽 CSP、未允许任意 HTML/JS、未增加依赖。共享 Markdown 渲染器仅增加安全标题 ID 和文档导航，原工作流内嵌指南也通过回归。

## 测试记录

环境：Windows、本机 Node/pnpm、隔离 Chromium 扩展上下文。E2E 拦截所有 HTTP(S)，未连接真实 WIPO、用户日常 Chrome 或其下载设置。

| 实际命令（在 patmail-extension） | 结果 |
|---|---|
| pnpm typecheck | 通过 |
| pnpm lint | 通过，无新增豁免、未放宽基线 |
| pnpm format:check | 通过 |
| pnpm test:unit | 262 个文件、1811 条用例通过，0 失败/跳过 |
| pnpm test:e2e:docs | 1 个隔离浏览器场景通过，前端异常 0、外部网络请求 0 |
| pnpm docs:check | 通过，错误 0，历史豁免 0 |
| pnpm docs:audit | 成功生成全量机器/人工清单 |
| pnpm exec vite build | 通过 |
| pnpm exec vite build --config vite.content.config.ts | 通过 |

生产构建采用 typecheck 与两个 Vite 入口，没有执行会启动 Observer 的 pnpm build，也没有调用 cdp:start / cdp:stop；不声称本任务控制了外部会话的生命周期。Vite 提示既有工作流 Markdown 同时静态/动态导入，仍正常构建，不改变业务打包结构。

新测试覆盖技术总览、AST、JSF、ViewState、容灾、中文路径/编码、跨目录链接、当前小节锚点、旧路径映射、隐藏档案、选中/折叠/搜索、元数据及离线加载。人为注入坏链接、坏锚点、未闭合代码块、重复权威来源和非法状态都会失败。原工作流 6 份索引/指南共 46 个图表渲染、放大/拖动/缩放/刷新、接口与学习入口继续验证。实际浏览器结果和截图保存在本机 test-results/reports，不提交为业务验收证据。

## 尚需维护的边界

- 477 份 REVIEW_REQUIRED 不等于过期；本轮全量盘点、重点人工核验，不将未核验内容冒充 current。
- 文本相似度不是完整语义证明，当前核心交叉职责已人工梳理，其他主题仍需按变更逐步核验。
- 检查器不联网，不验证外链可达性；Front Matter 仅检查边界，复杂 Markdown/Mermaid 依靠渲染测试补充。正式元数据使用 JSON。
- 未运行真实业务验收及全套业务 E2E，未重新操作 WIPO。单元测试与文档 E2E 只能证明对应覆盖范围。
- 最新现场通过的独立证据仍需在以后按授权脱敏归档；不会将本机原始日志、客户身份、Cookie、Token、ViewState 或材料打包进扩展。

维护方法与门禁限制见[治理说明](README.md)，具体迁移的 old_path / canonical_path / operation / reason / evidence 见 [migrations.json](migrations.json)。
