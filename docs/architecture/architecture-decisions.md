# PatMail 架构决策记录（Architecture Decision Records）

## ADR-001：基于 AST + 棘轮基线实施可验证架构门禁

- **状态**：已采纳并执行（Commit `17ff27d`）
- **背景（Context）**：纯人工审查无法阻止跨层隐式回退，且 MV3 + Vue SFC 混合环境包含 `<script setup>`、静态与纯类型 import，简单正则容易产生大量误报或漏报。
- **决策（Decision）**：引入 `patmail-extension/scripts/architecture-check.mjs`，结合 TypeScript Compiler AST 与 `@vue/compiler-sfc` 建立依赖清单、跨层规则 `A..F` 与只减不增棘轮基线 `ci/architecture-baseline.json`，在 Vitest (`tests/architecture/*`) 与 GitHub Actions CI 中强制门禁。
- **备选方案（Alternatives Considered）**：引入外部依赖工具 `dependency-cruiser` —— 会增加第三方构建链与授权合规负担，且对 Vue SFC 及 Chrome API 运行时信号不够贴合。
- **后果（Consequences）**：零新增外部依赖，CI 扫描扩展的 500+ 个源码文件并保留架构报告；代价是新增边界规则时需同步更新 `architecture-check.mjs` 清单分类。
- **涉及代码**：`patmail-extension/scripts/architecture-check.mjs`、`patmail-extension/ci/architecture-baseline.json`、`patmail-extension/tests/architecture/*.test.ts`、`/.github/workflows/ci.yml`。
- **测试证据**：`pnpm architecture:check` 持续通过（5 个测试文件 / 11 条用例，0 硬错误，0 遗留违规，0 运行时循环）。

---

## ADR-002：精确区分 `fee-model`（领域）与 `xlsx-engine`（基础设施 OOXML）

- **状态**：已采纳并执行（Commit `12213d3`）
- **背景（Context）**：请款目录下同时存在纯金额计算模块与依赖浏览器 `DOMParser`、`XMLSerializer`、`document` 解析 ZIP 表格 XML 的引擎文件，按目录名一刀切归类会破坏架构可信度。
- **决策（Decision）**：将 `src/billing/fee-model.ts` 严格划分为 **Domain**（禁止 DOM/Chrome/Vue 依赖），将 `src/billing/xlsx-engine.ts` 显式归类为 **Infrastructure** OOXML 引擎，并通过 `SpreadsheetPort` 与 `BillingApplicationService` 隔离。
- **备选方案（Alternatives Considered）**：立刻将 `xlsx-engine.ts` 物理移动至 `infrastructure/` —— 会导致已有 `tests/unit/billing/` 大量引用震荡，违反渐进式不破坏原则。
- **后果（Consequences）**：领域层纯度检查真实可信，请款计算核心逻辑不依赖 DOM；UI 页 `BillingWorkflowPage.vue` 通过 `useBillingWorkflow` 完全脱离底层 XML 引擎。
- **涉及代码**：`patmail-extension/src/application/billing/*`、`patmail-extension/src/infrastructure/billing/billing-adapters.ts`、`patmail-extension/src/app/composables/useBillingWorkflow.ts`、`patmail-extension/src/app/pages/BillingWorkflowPage.vue`。
- **测试证据**：`tests/unit/billing/billing-application-service.test.ts`（含 3 套 Golden Master Excel 模板断言）及 `tests/architecture/billing-boundaries.test.ts` 全数通过。

---

## ADR-003：请款导出引入显式 6 态 `ExportOutcome` 模型

- **状态**：已采纳并执行（Commit `12213d3`）
- **背景（Context）**：浏览器端工作簿在内存生成并触发 `Blob` / `<a download>` 后，仅意味着“浏览下载已发起”，并不等同于文件已在系统下载目录落盘完成；若统一返回简单布尔值易误导上层恢复与用户认知。
- **决策（Decision）**：在 `billing-contracts.ts` 定义 `ExportOutcome` 六态：`generated`、`download_started`、`download_completed`、`download_interrupted`、`unknown`、`failed`。规定 `createBrowserBlobDownloadAdapter` 固定返回 `download_started`，仅由 `createVerifiedChromeDownloadAdapter` 查询 Chrome 下载状态后再返回 `download_completed` / `download_interrupted` / `unknown`。
- **备选方案（Alternatives Considered）**：沿用单一 `ok: boolean` 或假定触发 Blob 后即 `completed` —— 会混淆“浏览器已受理下载”和“磁盘写入已验证完成”。
- **后果（Consequences）**：接口语义清晰、可测试，消除假完成状态上报；调用方可按状态差异决定提示或恢复文案。
- **涉及代码**：`patmail-extension/src/application/billing/billing-contracts.ts`、`patmail-extension/src/application/billing/billing-service.ts`、`patmail-extension/src/infrastructure/billing/billing-adapters.ts`。
- **测试证据**：`tests/unit/billing/billing-application-service.test.ts` 完整覆盖 6 种导出结果状态流转。

---

## ADR-004：`MailApplicationService` 收口 + 统一默认审核人语义

- **状态**：已采纳并执行（Commit `60b46a9`）
- **背景（Context）**：`background/agent.ts` 直接调用 5 个分散的客户/邮件/审核人领域文件；同时发现审计隐患——`submit_easy` 工具与系统提示词曾错误宣称“提交给当前登录人”，而真实执行却始终发送给 `account.rules.defaultReviewer`。
- **决策（Decision）**：引入 `MailApplicationService` 统一提供草稿、审核人校验、限期提交审核及卷号提取能力；同步修正 `agent/tools/mail-tools.ts` 中 `submit_easy` 工具说明及 `agent/loop.ts` `SYSTEM_PROMPT`，使模型预期严格匹配实际 `defaultReviewer` 业务规则，并在架构测试中断言锁定该描述契约。
- **备选方案（Alternatives Considered）**：修改后台提交改为提交给当前操作人 —— 严重违背现有“禁止擅自更改默认审核人来源 / 禁止自动结束发文审核流程”业务铁律。
- **后果（Consequences）**：Agent 跨领域直连违规归零，消除“提示词欺骗模型与用户的契约漂移”。
- **涉及代码**：`patmail-extension/src/application/mail/{mail-contracts,mail-service}.ts`、`patmail-extension/src/agent/tools/*`、`patmail-extension/src/agent/loop.ts`、`patmail-extension/src/background/agent.ts`。
- **测试证据**：`tests/unit/mail/mail-application-service.test.ts`、`tests/architecture/agent-boundaries.test.ts`、`tests/unit/agent/` 全数通过。

---

## ADR-005：Background 消息入口拆分为可测按域注册表并保留 ESLint 豁免指纹

- **状态**：已采纳并执行（Commit `279b67c`）
- **背景（Context）**：`background/index.ts` 将所有运行时消息鉴权、业务派发与跨通道错误兜底混于单一巨型 listener 中，极难在不模拟全 Chrome runtime 的情况下开展高覆盖分支单测。此外 `index.ts` 含 3 条在 `ci/eslint-exemptions.json` 注册了 SHA-256 指纹的行内豁免。
- **决策（Decision）**：抽离纯依赖注入的 `createBackgroundMessageRegistry(deps)` 与 `AppMessageHandler` / `ChannelMessageHandler` 至 `src/background/message-registry.ts`，`background/index.ts` 退化为监听组装层，精确保留 3 处已注册 ESLint 豁免的注释与目标行哈希不变。
- **备选方案（Alternatives Considered）**：重新重写 `index.ts` 并重新生成 ESLint 豁免清单 —— 违背安全豁免“不得借重构扩大或悄悄重置历史登记”的纪律。
- **后果（Consequences）**：`background/` 分支覆盖率由基线 41.79% 显著提升至 55.24%，所有鉴权、会话变化拒绝、下载流隔离和降级文案均有独立单测保护。
- **涉及代码**：`patmail-extension/src/background/message-registry.ts`、`patmail-extension/src/background/index.ts`。
- **测试证据**：`tests/unit/background/message-registry.test.ts` 6/6 用例通过；`pnpm lint` 保持 0 errors / 0 warnings 且通过 SHA-256 豁免校验。

---

## ADR-006：Hague 保护性执行网关隔离只读 `inspect`、写入与 AST 诊断

- **状态**：已采纳并执行（Commit `e350b99` 定义端口，`917295e` 接入工作台）
- **背景（Context）**：WIPO eHague 自动化涉及断点续传、`uncertain` 态保护、单次重试预算、`planIdentity` SHA-256 指纹及纯研究态 AST 分析；若调用方直接拼装低层通道，极易绕过检查点保护或将 AST 诊断引入生产流程。
- **决策（Decision）**：抽象 `HagueGateway`、`HagueCheckpointStorePort`、`HagueDiagnosticsPort`（仅通过 `import type { AstAnalysis }` 引用分析结果类型）与 `createDraftRunnerHost` 工厂方法：将 `inspect` 与写操作 `execute` 在接口层明确分离，由 `HaguePage.vue` 在真实草稿执行入口装配 HTTP 或页面传输及检查点端口。保留原 `runDraftPlan` 的状态保护与异常策略。
- **备选方案（Alternatives Considered）**：一次性将 `draft-runner.ts` 全盘重写为类方法 —— 风险极高，易损坏既有 70+ 海牙协议与 JSF 测试的精细异步控制。
- **后果（Consequences）**：为海牙新通道/新适配提供稳定隔离层；保持 MV3、Web Locks、Session Gate、Creation Pool 及全套 `uncertain`/SHA-256 语义完整不变。
- **涉及代码**：`patmail-extension/src/hague/gateway.ts`、`patmail-extension/src/hague/draft-runner.ts`、`patmail-extension/src/app/pages/HaguePage.vue`。
- **测试证据**：`tests/unit/hague/hague-gateway.test.ts` 与全量 `tests/unit/hague/`（77 文件 / 523 用例）100% 通过。
