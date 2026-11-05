# E2E 测试矩阵与分组

拓扑来源：`scripts/run-e2e.mjs`（分组真值）与 `tests/e2e/*.e2e.mjs`（场景实现）。
每个脚本 = 独立进程 + 独立扩展副本（`tests/e2e/support/paths.mjs` 的 `mkdtemp`）+ 动态端口，
串行执行互不干扰；EASY 业务 Origin 全量由 `tests/e2e/support/easy-mock.mjs` 路由拦截。

CI 的 `e2e-full` 使用两片 matrix，在独立 runner 上并行，片内仍串行：

- `full-lifetime`：仅 `native-stream-lifetime`，保留跨五分钟边界的真实下载验证。
- `full-functional`：`full` 中其余全部场景，直接从完整列表派生，新增场景自动归入此片。

`fail-fast: false` 保证其中一片失败后另一片仍完成取证。每片上传独立的 `report-e2e-<group>`，JSON 文件名也包含分组名，合并报告时互不覆盖；`ci-report.mjs` 汇总两片，Full Gate 要求整个 matrix 成功。旧桥接组继续独立运行，不参与分片。
本地 `pnpm test:e2e:full` 保持原来的完整串行入口；也可用 `node scripts/run-e2e.mjs full-functional` 或 `full-lifetime` 单跑一片。

切片依据：2026-11-04 的运行 `41814222923` 中，full 共约 617 秒，生命周期长测占 362.5 秒，其余约 255 秒。两片理想测试关键路径约 363 秒，实际还取决于 runner 排队、依赖安装和构建产物下载或重建耗时。

## 1. 分组

| 组 | 入口 | 场景 | 用途 |
|---|---|---|---|
| **smoke** | `pnpm test:e2e:smoke` | extension、limits | PR 快速门禁（ci.yml `e2e-smoke`） |
| **full** | `pnpm test:e2e:full` | smoke + workspace + download、browser-download、file-pages、download-editor、prewarm-pagination、browser-download-store、native-stream-lifetime、resume-protocol、docs | main / 手动完整回归（e2e.yml `e2e-full`） |
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
| 取名预热交接与缓存翻页 | prewarm-pagination | full | 已完成及在途取名不重复请求、下载进度接续、下载中翻页不重查源站 |
| 工作台页面加载 | workspace | full | 单例导航、客户配置同步、跨页选择、任务来源/过期/冲突/撤销、只读写保护、账号隔离、SW 重启恢复、主世界菜单读取与授权打开、无 CSP 错误 |
| 下载状态机回归 | download、resume-protocol、browser-download-store、native-stream-lifetime | full | 取消/暂停/502 有限重试/Range 续传/缓存命中/长度未知/终态与缓存清理顺序/SW 生命周期 |
| 故障注入 | download-editor、resume-protocol、native-pipeline-fault* | full | 502/断流/重启注入，状态机最终状态（非页面文案） |

\* `native-pipeline-fault.e2e.mjs` 由 v1.6.2 引入（`pnpm test:e2e:pipeline-fault` 单跑入口）；2026-10-30 最近一次已完成的 full 运行中该场景通过（57.5s）。本节维护它当前验证的下载故障与恢复契约，不再将其列为已知红。

## 3. 网络隔离（强制）

- 生产 EASY Origin 请求**只允许被 Playwright 路由拦截**；未匹配路由返回 404 并输出
  `[easy-mock] fixture route not found: … Call=…`，夹具缺口大声暴露，绝不透传。
- 不使用真实账号 / 生产 Cookie，不发真实发文与审核请求；Profile、扩展副本、下载目录全部临时隔离。
- 夹具补路由口径：只读字典/查询模板扇出给**合法空响应**；字典字段显式 `null`（适配器走 `empty`
  而非 `invalid`，避免缓存判无效反复重取）。共享扇出集中在 `easy-mock.mjs` 的 `readOnlyFanout`。

## 4. workspace 场景：当前 UI 契约

`tests/e2e/scenarios/workspace.mjs` 按当前全页工作台与客户/文件查询流程执行：

- 使用侧栏按钮、客户选择器、文件查询控件与结果工具栏操作。
- 在夹具页面主世界提供 `_UserMenu` 和 `AddBusinessTab`，通过 `READ_QUERY_SURFACES` 读取文件查询入口，并通过 `OPEN_EASY_FORM` 验证菜单授权打开与菜单外路径拒绝。
- 菜单读取和打开请求经 Service Worker 在发起消息的文档中执行 MAIN-world 代码；场景继续要求浏览器错误为空，覆盖无 CSP 违规的路径。
- 通过界面明确关闭写开关，并检查没有发送邮件、保存草稿或提交流程的请求。
- 保留任务来源、证据过期/撤销、重复/冲突、账号隔离和 Service Worker 恢复断言。
- 所有 EASY 请求均由 `tests/e2e/support/easy-mock.mjs` 拦截；客户和邮件设置读取由夹具响应。

本节描述当前场景契约，不再将 workspace 列为已知红。具体 checkout 的执行结果以
`node scripts/run-e2e.mjs workspace` 或 `pnpm test:e2e:full` 的当次输出为准。

## 5. native-pipeline-fault：当前故障注入契约

`tests/e2e/native-pipeline-fault.e2e.mjs` 属于 `full`，也可用
`pnpm test:e2e:pipeline-fault` 单跑。夹具覆盖以下故障与恢复行为：

- 六路下载并发时，一条响应先返回部分内容后断开；测试确认暂停态、继续按钮和未提前完成状态。
- 关闭工作台及浏览器后重新启动，验证本地任务恢复，继续下载后最终状态完成。
- 一次临时 502 后重试，断点续传使用 Range；一个缺失附件进入跳过清单，其他文件内容与 ZIP 条目保持一致。
- 验证 Chrome 确认文件已保存、归档内容校验通过，且没有调用文件选择器、旧 Python 下载桥或额外回环请求。

最近一次已完成的 full 运行中该场景通过（2026-10-30，57.5s）。保留这些故障注入和恢复断言。

## 6. 失败证据与脱敏

失败时保留：Playwright Trace / 截图 / 浏览器 Console 错误 / Service Worker 错误 / 网络错误摘要
（404 逐条记 URL）/ 关键任务状态快照，落 `test-results/`。报告统一脱敏：不写 Cookie、
Authorization、Session Token、邮件地址明文、客户合同原文与业务敏感字段。

## 7. jihua-upload：季华实验室传文

`pnpm test:e2e:jihua-upload`（也属于 `full`）使用隔离 Chromium、生成的 OPFS 文件及完整拦截的季华平台响应。覆盖递归名称扫描不读正文、扩展名排除、六路申请号流水线、已有附件跳过、未匹配行、关联失败后刷新恢复复用附件 ID，以及 CSV 导出。测试不连接用户的 Chrome，不使用真实 Cookie，也不向生产平台上传。
