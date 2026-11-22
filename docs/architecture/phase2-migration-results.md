# PatMail Phase 2 渐进式迁移结果明细（Migration Results）

> 基线提交：`76bf0e34cd62c58c1a3e35c5e61a98acf35dc93a`  
> 治理提交系列：`b23e77f` -> `a4fd686` -> `8b49675` -> `c8a4075` -> `89e24ce` -> `a1300dd`

## 一、增量提交明细

| 阶段 | 提交 SHA | 提交信息 | 核心改动与新增契约 |
| --- | --- | --- | --- |
| Phase 1 | `b23e77f` | `refactor(mail): unify MailApplicationService across TasksPage, WorkflowMailEntry, MailWorkspace and Agent` | 扩展 `MailApplicationService`（`applyRulesToDraft`、`previewAssembledMail`、`previewWorkflowRows`、`planSelectionDrafts`）；迁移 `TasksPage.vue`、`WorkflowMailEntry.vue` 与 `MailWorkspace.vue` |
| Phase 2 | `a4fd686` | `refactor(mail): isolate EASY transport behind EasyMailGateway port and adapter` | 新增 `ports/easy-mail-gateway.ts` 与 `infrastructure/mail/easy-mail-gateway-adapter.ts`；清除 `src/application/mail/*` 对 `shared/message.ts`、`shared/guards.ts` 的全部运行时依赖；`background/agent.ts` 注入网关适配器 |
| Phase 3 | `8b49675` | `refactor(hague): extract shared safe AST protocol parser kernel and enforce protocol-vs-diagnostics boundary` | 新增 `src/hague/protocol/ast-action-parser.{mjs,d.mts}` 与 `jsf-action-extractor.ts`；`diagnostics/ast/analyzer.{mjs,d.mts}` 降为只读 re-export；更新 `http-driver.ts` 与 `gateway.ts` |
| Phase 4 | `c8a4075` | `refactor(architecture): generalize rules G-K, composition root registry, barrel tracing and bypass tests` | 升级 `architecture-check.mjs` 支持 Rules A–K、`COMPOSITION_ROOTS`、Barrel 传递展开、Vite 后缀剥离与未解析导入追踪；消除 `WorkflowMailEntry.vue -> pct-recipients`、`MailWorkspace.vue -> mail/index.ts`、`FeeSearchQuery.vue -> billing/fee-model`；新增 `architecture-bypass.test.ts` |
| Phase 5 | `89e24ce` | `refactor(billing): add event-driven chrome.downloads terminal tracking and distinct UI outcome notices` | 升级 `createVerifiedChromeDownloadAdapter` 集成 `onChanged` 监听 + `search({ id })` 防快完成竞态 + 有界 `settleTimeoutMs` -> `unknown`（保留 `downloadId`）+ 必清监听与定时器；新增 `createChromeExtensionDownloadsVerifier()`；区分 `formatExportOutcomeNotice` 完成态与已触发态文案 |
| Phase 6 | `a1300dd` | `refactor(ui): extract workflow sheet status, fee query templates and fee selection composables` | 拆出 `useWorkflowSheetStatus.ts`（236 行）、`useFeeSelection.ts`（161 行）与 `useFeeQueryTemplates.ts`（398 行）；保持 `FeeSearchQuery.vue` `defineExpose` 与全部业务行为不变 |

## 二、大型 UI 组件瘦身与下载契约落地

### 1. 重型组件行数变化

| 组件 | 重构前（`76bf0e3`） | 重构后（`a1300dd`） | 净减 / 拆出模块 |
| --- | --- | --- | --- |
| `src/app/components/WorkflowMailEntry.vue` | 1,992 行 | **1,793 行** | **-199 行**；核心核对状态、统计柱状条与分页抽离至 `src/app/composables/useWorkflowSheetStatus.ts` |
| `src/app/components/FeeSearchQuery.vue` | 2,482 行 | **2,145 行** | **-337 行**；跨页勾选与快照清洗抽离至 `useFeeSelection.ts`，历史模板与 JSON 编排抽离至 `useFeeQueryTemplates.ts` |

### 2. 请款下载终态监听机制（`src/infrastructure/billing/billing-adapters.ts`）

- 当传入带 `onChanged` 的 `ChromeDownloadsVerifier` 时，适配器在调用 `verifier.download()` **之前**注册监听器并缓冲早到事件，拿到 `downloadId` 后立即调用 `search({ id })` 覆盖快完成竞态；
- `complete` -> `download_completed`（提示 `"请款单已导出并确认下载完成：..."`）；
- `interrupted` -> `download_interrupted`（含中断错误码，不伪报完成）；
- 超时或无法查询 -> `{ status: 'unknown', downloadId, reason }`，保留 ID 供追溯，并在 `finally` 与 `finish()` 中确保清理定时器及监听器；
- `createDefaultBillingService(overrides?)` 默认仍保持 `createBrowserBlobDownloadAdapter()` 兼容 `<a download>` 与 `billing.e2e.mjs` 事件模型，同时支持按需注入 `verifier` / `downloads` / `settleTimeoutMs`。

## 三、遗留技术债与后续建议（Phase 3+ 候选）

1. **存量未迁移 Mail UI**：`src/app/components/FileManageMail.vue`（仍直连 `customer/limit-mail-submit.ts`、`customer/file-manage-plan.ts`）、`src/app/pages/LimitsPage.vue` 与 `src/app/pages/HomePage.vue` 暂保持兼容，可在后续继续迁移至 `MailApplicationService` 并将 Rule G 扩展至 `app/components/*Mail*.vue`。
2. **Rules & FileSearch Barrel 引用**：`src/app/pages/RulesPage.vue` 与 `src/floating/FileSearchPanel.vue` 目前仍通过 `mail/index.ts` 导入规则/绑定辅助函数，未来可拆出专用 `mail/rules` / `mail/selection` 公共接口后收紧全局 barrel 限制。
3. **重型页面/Composable 进一步拆解**：`useBillingWorkflow.ts`（646 行）与 `HaguePage.vue` 已有清晰分层边界但内部篇幅仍较高，可按需继续按职责拆分。
4. **独立安全风险披露（Agent 密钥前端注入与明文 HTTP）**：详见 [验收与安全披露文档](./phase2-acceptance.md)。
