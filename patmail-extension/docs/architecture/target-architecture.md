# PatMail 目标架构说明（Target Architecture）

本架构以 Clean Architecture / Ports & Adapters 为核心约束，结合 Chrome Manifest V3 多运行时隔离特性，定义依赖方向与关键业务边界：

## 一、分层依赖规则与目标结构

```mermaid
flowchart TB
  Pres["Presentation Layer\n(app/pages, app/components, app/composables, floating, popup, shell)"]
  App["Application Layer\n(application/billing, application/mail)"]
  Domain["Domain & Contracts\n(domain/*, billing/fee-model.ts, hague/draft-contract.ts, hague/plan-identity.ts, hague/gateway.ts)"]
  Infra["Infrastructure & Adapters\n(infrastructure/*, background/*, content/*, storage/*, browser-download/*, billing/xlsx-engine.ts)"]

  Pres -->|"调用用例 & 组装 UI 状态"| App
  Pres -->|"依赖注入适配器"| Infra
  App -->|"依赖 Ports 与纯领域规则"| Domain
  Infra -.->|"实现 Ports 接口"| App
  Infra -.->|"实现 Gateway / Store 端口"| Domain
```

### 核心模块职责划分

| 模块 / 文件 | 目标分层 | 判定依据与职责边界 |
| --- | --- | --- |
| `src/billing/fee-model.ts` | **Domain（纯领域）** | 纯请款费用计算与金额校验，不触及 DOM/Chrome/网络 |
| `src/billing/xlsx-engine.ts` | **Infrastructure（OOXML 引擎）** | 真实使用 `DOMParser`、`XMLSerializer`、`document` 与 ZIP XML 解析生成三类工作簿 |
| `src/application/billing/billing-service.ts` | **Application（用例编排）** | `BillingApplicationService`，编排表单校验、模板填报、汇率、下载与历史恢复；严格仅依赖端口契约 |
| `src/infrastructure/billing/billing-adapters.ts` | **Infrastructure（适配器）** | 适配模板资产、`xlsx-engine`、中国人民银行汇率抓取、浏览器/Chrome 下载与恢复客户端 |
| `src/app/composables/useBillingWorkflow.ts` | **Presentation（组合逻辑）** | 持有页面响应式状态，向 `BillingApplicationService` 注入运行时适配器 |
| `src/application/mail/mail-service.ts` | **Application（用例编排）** | `MailApplicationService`，统一 `draftMail` / `checkReviewers` / `submitLimitMailForReview` 与卷号解析 |
| `src/agent/tools/*` | **Agent Tools Adapter** | 将 16 个工具拆分为按域聚合的模块，`tools.ts` 保持兼容外观（Facade） |
| `src/background/message-registry.ts` | **Background Application Boundary** | 按域拆分的 `AppMessageHandler` 与 `ChannelMessageHandler` 注册表 |
| `src/hague/gateway.ts` | **Protocol Gateway Boundary** | `HagueGateway`、`HagueCheckpointStorePort` 与 `createDraftRunnerHost`，强制隔离 `inspect` / `execute` / `recover` |

## 二、业务语义与导出状态契约

### 1. 请款导出结果 6 态显式模型（`ExportOutcome`）

位于 `patmail-extension/src/application/billing/billing-contracts.ts`：

- `generated`：工作簿已在内存生成，等待下一步下载或交接
- `download_started`：已触发浏览器 Blob/A 标签或下载接管，但真实落盘尚未被浏览器 API 终态确认
- `download_completed`：经后台 Chrome 下载状态轮询确认为 `complete` 终态（含 `downloadId`）
- `download_interrupted`：下载已明确中断（`interrupted`），向用户返回失败原因而不误报完成
- `unknown`：超时或状态未确认，保留现场且不重复触发无幂等副作用
- `failed`：校验失败、模板缺失或生成异常导致无法产生产物

### 2. 海牙（WIPO eHague）状态保护契约

- **`uncertain` 不自动重放写操作**：任何无法确认远端状态的提交保持 `uncertain`，交由只读 `recover` 核对；
- **`planIdentity` SHA-256 指纹不可绕过**：仅尚未执行的未来步骤允许变更并附警告恢复；当前或已执行步骤变更直接拒绝恢复；
- **单次重试预算上限**：经 `recoveryAttempts` / `recoveryRetries` 持久化计次，同一失败步骤最多重试一次；
- **AST 协议内核与诊断严格边界（Phase 2 更新）**：安全只读 Babel AST JSF 动作解析内核收归 `src/hague/protocol/ast-action-parser.mjs`（+ `.d.mts`）与 `src/hague/protocol/jsf-action-extractor.ts`；`src/hague/diagnostics/ast/analyzer.mjs` 退化为薄兼容性 re-export，`HagueDiagnosticsPort` 仅通过 `import type { AstAnalysis }` 引用分析类型，生产驱动严禁导入 `hague/diagnostics/ast/*`、`diagnostics/{reports,replay,fixtures,export}.ts` 与 `hague/research/*`。

## 三、自动化架构门禁（CI Enforced，Rules A–K）

由 `patmail-extension/scripts/architecture-check.mjs`（含 Barrel Re-export 传递展开、Vite 资源后缀剥离、`tsconfig.paths` 解析及 `COMPOSITION_ROOTS` 白名单）与 `patmail-extension/tests/architecture/` 自动强制执行（见 `ci.yml` 与 `ci:check`）：

- **Rule A (`A-domain-purity`)**：Domain 模块（含 `hague/protocol/ast-action-parser.mjs`）零 Vue / Presentation / Background / Content / DOM / Chrome API 运行时依赖；
- **Rule B (`B-application-no-ui`)**：`application/*` 严禁依赖 `.vue` 或 Presentation 模块；
- **Rule C (`C-agent-through-application`)**：`agent/*` 与 `background/agent.ts` 严禁绕过 `MailApplicationService` 直接或经 barrel 导入发文/审核人/邮编提交模块；
- **Rule D (`D-presentation-no-direct-infra`)**：全部页面、组件、浮层、弹窗、Shell 与非 Composition Root 组合式函数严禁直接导入 `infrastructure/*` 或请款引擎模块（请款页额外禁止 `recovery/client.ts`）；
- **Rule E (`E-no-cycles`)**：目标严格域（含 `hague/protocol/`）保持 0 运行时循环依赖；
- **Rule F (`F-runtime-isolation`)**：MV3 `background/` 与 `content/`/`*.vue` 双向严禁运行时互导；
- **Rule G (`G-mail-ui-through-application`)**：受治发文 UI（`TasksPage.vue`、`WorkflowMailEntry.vue`、`MailWorkspace.vue` 及匹配 `*Mail*.vue` 页面/浮层）必须通过 `MailApplicationService` 交互；
- **Rule H (`H-application-no-transport-leak`)**：`application/*` 严禁依赖 `shared/message.ts`、`shared/guards.ts`、`infrastructure/*`、`background/*`、`content/*` 或 `chrome.*`/`MessageType.*`；
- **Rule I (`I-hague-protocol-vs-diagnostics`)**：海牙生产流程严禁引入旁路 `diagnostics/ast/*`、回放/报表/研究模块，`hague/protocol/*` 严禁依赖任何 `diagnostics/*`；
- **Rule J (`J-no-unresolved-internal-imports`)**：存在任何未解析内部相对/别名导入即阻断；
- **Rule K (`K-composition-root-registry`)**：仅显式登记于 `COMPOSITION_ROOTS`（`useBillingWorkflow.ts`、`background/agent.ts`）的模块允许直接装配 `infrastructure/*` 适配器。

参见 Phase 2 专题文档：[规则说明](./phase2-architecture-rules.md)、[海牙协议边界](./phase2-hague-protocol-boundaries.md)、[验收与安全披露](./phase2-acceptance.md)。
