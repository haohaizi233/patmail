# E2E 测试矩阵与分组

拓扑来源：`scripts/run-e2e.mjs`（分组真值）与 `tests/e2e/*.e2e.mjs`（场景实现）。
每个脚本 = 独立进程 + 独立扩展副本（`tests/e2e/support/paths.mjs` 的 `mkdtemp`）+ 动态端口，
串行执行互不干扰；EASY 业务 Origin 全量由 `tests/e2e/support/easy-mock.mjs` 路由拦截。

## 1. 分组

| 组 | 入口 | 场景 | 用途 |
|---|---|---|---|
| **smoke** | `pnpm test:e2e:smoke` | extension、limits | PR 快速门禁（ci.yml `e2e-smoke`） |
| **full** | `pnpm test:e2e:full` | smoke + workspace + download、browser-download、file-pages、download-editor、browser-download-store、native-stream-lifetime、resume-protocol、docs | main / 手动完整回归（e2e.yml `e2e-full`） |
| **legacy** | `pnpm test:e2e:legacy` | stream-download、durable-download、stream-bridge-unittest | 旧 Python 桥接下载协议兼容（e2e.yml `e2e-legacy`，需 python） |

单跑：`node scripts/run-e2e.mjs <suite>`；`--bail` 首败即停。产出 `test-results/ci/e2e-<group>.json`。

## 2. 场景覆盖矩阵

| 要求覆盖 | 场景（suite） | 组 | 断言重点 |
|---|---|---|---|
| 扩展启动 | extension | smoke | MV3 扩展加载、单面板、popup |
| Service Worker 启动 | extension | smoke | worker PING、扩展 ID 校验 |
| EASY 标签页绑定 | extension | smoke | content script 注入、SHOW_PANEL、标签切换 |
| 文件查询 | extension、file-pages | smoke/full | 查询、分页、刷新、空态、会话过期（现行契约） |
| 期限查询 | limits | smoke | 查询链路、会话失效、HTTP 错误、只读重试 |
| 下载操作 | download、download-editor | full | 下载状态机、编辑器链路 |
| 原生下载 | browser-download | full | 一次性凭据导航流重建 Chrome 原生下载记录 |
| ZIP 完整性 | download、stream-download | full/legacy | 条目顺序、CRC、字节数一致 |
| 浏览器取消操作 | browser-download-store、native-stream-lifetime | full | 取消/暂停/恢复、终态判定 |
| 文件管理分页 | file-pages | full | 全选翻页、下载工具条 |
| 工作台页面加载 | workspace | full | **已知红**，见 §4 |
| 下载状态机回归 | download、resume-protocol、browser-download-store、native-stream-lifetime | full | 取消/暂停/502 有限重试/Range 续传/缓存命中/长度未知/终态与缓存清理顺序/SW 生命周期 |
| 故障注入 | download-editor、resume-protocol、native-pipeline-fault* | full | 502/断流/重启注入，状态机最终状态（非页面文案） |

\* `native-pipeline-fault.e2e.mjs` 由 v1.6.2 引入（`pnpm test:e2e:pipeline-fault` 单跑入口）；当前在「冷重启后继续下载」的收尾阶段报红（浏览器进程退出，见 `acceptance-report.md` §4.2），保留在 `full` 组如实反映，不删断言、不加 skip。

## 3. 网络隔离（强制）

- 生产 EASY Origin 请求**只允许被 Playwright 路由拦截**；未匹配路由返回 404 并输出
  `[easy-mock] fixture route not found: … Call=…`，夹具缺口大声暴露，绝不透传。
- 不使用真实账号 / 生产 Cookie，不发真实发文与审核请求；Profile、扩展副本、下载目录全部临时隔离。
- 夹具补路由口径：只读字典/查询模板扇出给**合法空响应**；字典字段显式 `null`（适配器走 `empty`
  而非 `invalid`，避免缓存判无效反复重取）。共享扇出集中在 `easy-mock.mjs` 的 `readOnlyFanout`。

## 4. workspace 场景：已知红（UI 契约漂移）

**状态**：`tests/e2e/scenarios/workspace.mjs` 当前报红，首步即失败（等待
`navigation[name=工作台导航] link[客户管理]` 超时）。这是**历史 UI 契约漂移**，不是 CI 建设引入的退化：

- 场景断言的是 2026-09-26/09-28 时代的界面契约（链接式「工作台导航」、客户称呼/我方文号表单、
  保存这套配置、查看已选/绑定已选文件/生成发文计划、Production Write 等）；
- 产品界面在 09-28（客户与模板改页面条件排版）、09-29（写开关）、10-27（全选翻页与下载工具条）
  三次演进后未同步；绑定与生成计划入口已移到 EASY 面板（`FileSearchPanel.vue`、`AutomationPanel.vue`）。

**处理原则**：场景模块保留原样，业务断言（任务来源、幂等保护、账号隔离、SW 重启恢复）继续执行并如实报红；
不删断言、不加 skip、不放行网络。`full` 组包含它，E2E Full 门禁因此为红——这是如实反映，不是门禁故障。

**整改计划**（独立工作项，按现行 UI 契约重写导航与操作路径，保留业务断言语义）：

1. 对照 `src/app` 现行导航结构重写「工作台导航」寻路（侧栏按钮/路由，不再是链接式导航）；
2. 客户/模板断言改为现行条件排版与写开关契约（参照 `scenarios/file-search.mjs` 2026-10-27 的
   现行契约改法：按钮禁用 + 提示可见 + 零请求等）；
3. 绑定/生成计划断言迁移到 EASY 面板入口；
4. 完成后 workspace 由红转绿，`full` 组恢复全绿。

**证据**：`test-results/phase2-ws.log`（本次运行）；根因与整改同步记录于 `acceptance-report.md`。

## 5. native-pipeline-fault：恢复续传阶段已知红

**状态**：`tests/e2e/native-pipeline-fault.e2e.mjs` 当前报红（2026-10-30 重跑 5 次同一位置失败，
`test-results/pf-e2e*.log`、`pipeline-fault-*.log`）：

- 已稳定通过的部分：下载启动、512KB 后源中断、`继续下载` 按钮出现、`activeTask.status === 'paused'`、
  中断不报导出完成、原生下载不调文件选择器、关闭工作台后重启浏览器、恢复横幅与查询状态恢复；
- 失败点：第二阶段点击 `继续下载` 后，等待 `activeTask.status === 'done'` 的 120s 窗口内
  测试浏览器被关闭（日志依次出现 `event: app closed / context closed / browser disconnected`），
  `waitForPageCondition`（`tests/e2e/support/browser.mjs`）报 *Target page, context or browser has been closed*；
- 5 次重跑均在同一点失败，判定为**确定性红**（恢复续传链路或测试脚手架生命周期管理的真实问题），
  不是 flaky 重试能消化的类型。

**处理原则**：保留原断言与失败证据，不加 skip、不降低断言强度。列入 full 组已知红，PR Smoke 不受影响。

**整改计划**（独立工作项）：

1. 定位续传期间应用/上下文关闭的触发方（扩展侧主动 `window.close`/导航、fixture 会话过期、
   脚手架 `downloads[].failure()` 注入与第二阶段浏览器生命周期的交互）；
2. 复现收敛后按 v1.6.1 下载状态机的 13 项回归清单补齐断言（见 `docs/ci/quality-gates.md`）；
3. 连续 5 次本地重跑全绿后移出已知红名单。

**证据**：`test-results/pf-e2e-4.log`（本次运行，`NPF_EXIT=1`）。

## 6. 失败证据与脱敏

失败时保留：Playwright Trace / 截图 / 浏览器 Console 错误 / Service Worker 错误 / 网络错误摘要
（404 逐条记 URL）/ 关键任务状态快照，落 `test-results/`。报告统一脱敏：不写 Cookie、
Authorization、Session Token、邮件地址明文、客户合同原文与业务敏感字段。
