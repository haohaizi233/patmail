# PatMail Phase 2 真实依赖图审计（Current Dependencies）

> 参考基线：`76bf0e34cd62c58c1a3e35c5e61a98acf35dc93a`  
> 当前重构 HEAD：`a1300dd`（Phase 2 代码重整完成）

## 一、扫描工具与识别能力

依赖审计由扩展根目录下的 AST 静态扫描器 `patmail-extension/scripts/architecture-check.mjs` 执行，直接解析 TypeScript Compiler API AST 与 `@vue/compiler-sfc` `<script>` / `<script setup>` 块，覆盖：

- 静态 `import`、动态 `import()`、`export ... from`（Barrel re-export 传递展开）、`require()`、`import type` 与 Vue `<script src>`；
- Vite 资源查询后缀（`?raw`、`?url`、`?inline`、`?worker`）及 `tsconfig.json` `compilerOptions.paths`；
- 扩展内部相对/别名未解析导入追踪（`unresolvedImports`）；
- 运行时信号：`chrome.*` API 调用、`MessageType.*` 消息引用、`import.meta.glob`、`document` / `window` 直接访问。

## 二、基线 vs 当前全仓依赖指标对比

| 指标 | Phase 2 初审扫描（基线 `76bf0e3` 后 Phase 1 起步） | Phase 2 收敛后（`a1300dd`） | 说明 |
| --- | --- | --- | --- |
| 扫描源码文件数（`src/`） | 516 | **523** | 新增 `hague/protocol/*`、`ports/easy-mail-gateway.ts`、`infrastructure/mail/*` 及 3 个 UI Composables |
| 总导入边（`totalEdges`） | 2,268 | **2,295** | 新增端口、协议内核与独立 Composable 显式依赖 |
| 内部运行时边（`runtimeInternalEdges`） | 1,586 | **1,606** | UI/Agent 收敛至 Application 门面与组合式拆分的规范化调用边 |
| 纯类型边（`typeOnlyEdges`） | 551 | **561** | `EasyMailGateway`、`HagueDiagnostics` 与各端口持续采用 `import type` 隔离 |
| 未解析内部导入（`unresolvedImportCount`） | 未纳入（9 条 `?raw`/`?url`/`?inline` 曾呈现 `to: null`） | **0** | stripping Vite 资源后缀后内部导入 100% 可解析 |
| 运行时循环依赖（`cycleCount`） | 0 | **0** | 目标作用域与全仓库继续保持 0 运行时循环 |
| 棘轮/硬错误架构违规 | 0 | **0** | 规则从 `A–F` 扩展到 `A–K`（全硬错误 `error` 约束），全部 0 违规 |

### 当前分层分布（523 个文件）

| 分层 | 文件数 | 代表目录 / 模块 |
| --- | --- | --- |
| `Presentation` | 134 | `src/app/`（含新拆出的 `useWorkflowSheetStatus.ts`、`useFeeSelection.ts`、`useFeeQueryTemplates.ts`）、`src/floating/`、`src/popup/`、`src/shell/` |
| `BusinessModule` | 209 | `src/customer/`、`src/mail/`、`src/workflow/`、`src/hague/`、`src/query/`、`src/automation/`、`src/jihua/` |
| `Infrastructure` | 95 | `src/infrastructure/`（`billing/`、`mail/`）、`src/background/`、`src/content/`、`src/storage/`、`src/browser-download/`、`src/api/` |
| `Shared` | 34 | `src/shared/`、`src/utils/`、`src/schema/`、`src/settings/` |
| `Agent` | 27 | `src/agent/`（含 `agent/tools/*`） |
| `Domain` | 13 | `src/domain/`、核心领域纯模块与新纳入的 `src/hague/protocol/ast-action-parser.mjs` |
| `Application` | 11 | `src/application/billing/*`、`src/application/mail/*`（含 `ports/easy-mail-gateway.ts`） |

## 三、Phase 2 修复的关键跨层问题清单

1. **普通发文 UI 与 Agent 入口割裂（ISSUE-A）**：
   - 修复前：`TasksPage.vue` 直接导入 `mail/assemble.ts`（`assembleMail`、`fillFromRules`、`appendRecipientField`）；`WorkflowMailEntry.vue` 直接导入 `mail/assemble.ts`、`customer/pct-recipients.ts`；`MailWorkspace.vue` 直接导入 `mail/index.ts` barrel 与 `mail/planner.ts`、`mail/fingerprint.ts`。
   - 修复后：统一收敛至 `src/application/mail/mail-service.ts`（`MailApplicationService` 及纯显示包装函数），`MailWorkspace.vue` 消除 barrel `mail/index.ts` 导入，不再直接触发 `assemble`/`planner`/`fingerprint`。
2. **Application 层传输协议泄漏**：
   - 修复前：`src/application/mail/mail-service.ts` 与 `mail-contracts.ts` 直接导入 `shared/message.ts`、`shared/guards.ts`，并隐含传输层 `RequestMeta` / `MessageBridge`。
   - 修复后：抽象为 `src/application/mail/ports/easy-mail-gateway.ts`，传输实现下沉至 `src/infrastructure/mail/easy-mail-gateway-adapter.ts`，由 `src/background/agent.ts`（已登记 Composition Root）完成装配。
3. **Hague 生产驱动与诊断目录职责混杂（ISSUE-B）**：
   - 修复前：`src/hague/http-driver.ts` 运行时直接导入 `src/hague/diagnostics/ast/analyzer.mjs`，与“生产严禁依赖 `diagnostics/ast/*`”文档声明冲突。
   - 修复后：将安全只读 Babel AST 解析内核提升至 `src/hague/protocol/ast-action-parser.{mjs,d.mts}`，封装故障隔离提取器 `src/hague/protocol/jsf-action-extractor.ts`，`diagnostics/ast/analyzer.{mjs,d.mts}` 保留为薄兼容性 re-export。
4. **未本次迁移的存量页面/组件说明（诚实盘点）**：
   - `src/app/pages/HaguePage.vue` 与 `src/app/pages/WorkflowPage.vue` 仍合法导入 `src/recovery/client.ts`（工作台恢复客户端，非请款基础设施），Rules D 已精确区分请款页恢复禁令；
   - `src/app/components/FileManageMail.vue` 仍导入 `customer/limit-mail-submit.ts`、`customer/file-manage-plan.ts` 等；`src/app/pages/LimitsPage.vue` 与 `src/app/pages/HomePage.vue` 仍存在若干既有 `customer/*` 调用；`src/app/pages/RulesPage.vue` 与 `src/floating/FileSearchPanel.vue` 通过 `mail/index.ts` 使用规则与绑定辅助功能。以上均已显式记录，留待下一轮渐进式治理。
