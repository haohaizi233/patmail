# PatMail 边界违规清单与遗留技术债（Boundary Violations & Residual Debt）

本文档如实区分**本次治理已清零的重点违规**与**全仓扫描识别出的阶段二遗留耦合技术债**，不掩盖存量事实。

## 一、本次治理已清零的架构违规（10 → 0）

在基线 `17ff27d` 首次全量 AST 审计中，面向本轮核心重构范围识别出 **10 条边界违规**（均纳入 `ci/architecture-baseline.json` 棘轮控制）。在 Phase C 与 Phase D 完成后，已全部清零并通过自动化测试锁定：

| 原违规 ID | 原依赖方向 | 解决方式 | 当前状态 |
| --- | --- | --- | --- |
| `billing-page-direct:app/pages/BillingWorkflowPage.vue->billing/fee-model.ts` | Presentation → Domain/Engine | 下沉至 `useBillingWorkflow` + `BillingApplicationService` | **已清零** |
| `billing-page-direct:app/pages/BillingWorkflowPage.vue->billing/pbc-rates.ts` | Presentation → Infra（外部汇率请求） | 封装至 `infrastructure/billing/billing-adapters.ts` | **已清零** |
| `billing-page-direct:app/pages/BillingWorkflowPage.vue->billing/template-assets.ts` | Presentation → Infra（模板资产加载） | 通过 `BillingTemplatePort` 注入 | **已清零** |
| `billing-page-direct:app/pages/BillingWorkflowPage.vue->billing/templates.ts` | Presentation → Infra（模板写入引擎） | 通过 `SpreadsheetPort` 注入 | **已清零** |
| `billing-page-direct:app/pages/BillingWorkflowPage.vue->recovery/client.ts` | Presentation → Infra（WAL/恢复） | 通过 `BillingRecoveryPort` 注入 | **已清零** |
| `agent-domain-bypass:background/agent.ts->customer/limit-mail-submit.ts` | Agent Host → 领域写提交 | 收口至 `MailApplicationService.submitLimitMailForReview` | **已清零** |
| `agent-domain-bypass:background/agent.ts->customer/pct-recipients.ts` | Agent Host → 邮编收件人匹配 | 收口至 `MailApplicationService` | **已清零** |
| `agent-domain-bypass:background/agent.ts->customer/workflow-mail.ts` | Agent Host → 发文流程汇编 | 收口至 `MailApplicationService` | **已清零** |
| `agent-domain-bypass:background/agent.ts->mail/assemble.ts` | Agent Host → 邮件组装 | 收口至 `MailApplicationService.draftMail` | **已清零** |
| `agent-domain-bypass:background/agent.ts->workflow/reviewer-resolver.ts` | Agent Host → 审核人解析 | 收口至 `MailApplicationService.checkReviewers` | **已清零** |

## 二、全仓观测到的阶段二遗留技术债（未纳入本轮大爆炸改造）

依据渐进式重构原则，以下全仓非本轮主线的历史跨层边保留原状（无运行时循环依赖，且未破坏 MV3 `background <-> content` 隔离），作为下一阶段治理候选清单如实记录：

| 类别 | 真实 AST 边定位 | 影响分析 | 阶段二建议动作 |
| --- | --- | --- | --- |
| Hague 模块逆向引用 UI 辅助 | `hague/arbitration.ts -> app/assistant-job.ts (L1)`、`hague/draft-completion.ts -> app/dialog.ts (L2)` | 领域/业务流程层导入 `app/` 下任务通知与对话框辅助，削弱 `hague/` 在非 UI 宿主下的复用性 | 为 `assistant-job` 与确认弹窗抽象 `HagueInteractionPort` 回调端口，由工作台注入 |
| Presentation / 业务直引后台通道常量 | `app/pages/HaguePage.vue -> background/hague-http.ts (L9)`、`hague/http-client.ts -> background/hague-http.ts (L17)`、`jihua/transport.ts -> background/jihua-page-world.ts (L1)` | 虽然静态仅引用通道常量名（如 `HAGUE_HTTP_CHANNEL`）与契约类型而非启动 Service Worker 逻辑，但在目录归属上跨向了 `background/` | 将纯通道常量与消息契约上移至 `shared/` 或领域 `*-contract.ts`（参照 `HAGUE_DRAFT_CHANNEL` 模式） |
| Settings 模块跨入 Composable/Agent | `settings/use-account-avatar.ts -> app/composables/useWorkspace.ts (L2)`、`settings/use-agent-config.ts -> agent/config.ts (L2)` | `settings/` 中混放了 UI Composable 与配置数据结构 | 将 `settings/use-*.ts` UI Composable 迁移至 `app/composables/` |
| Shared 消息定义反向导入业务守卫 | `shared/message.ts` 导入 `customer/guards.ts`、`mail/easy/guards.ts`、`workflow/guards.ts`、`agent/memory.ts` 等（共 11 条运行时边） | `isMessage()` 运行时校验位于中心枢纽 `shared/message.ts`，形成扇入耦合；虽无循环但增大全局打包共享表面积 | 采用按域注册的 `MessageSchemaRegistry`，将守卫留在各业务边界附近 |
| Floating 悬浮窗耦合业务与 Shell | `floating/*` 指向 `automation/*`、`query/*`、`app/composables/*` 等共 68 条边（如 `floating/AutomationPanel.vue -> automation/dry-run.ts`） | 悬浮面板直接拼装自动发文内部模块 | 为悬浮面板引入与工作台对称的应用服务 / Composable Facade |
| `HaguePage.vue`、`background/index.ts` 体量偏大 | 历史大文件内仍有较多局部状态编排 | Phase E 已将 `background/index.ts` 的消息分发拆入 `message-registry.ts`，但保活与执行调度仍在 `index.ts` | 按域继续拆出生命周期/端口注册器与 `useHagueWorkspace` |
| `background` 模块与 `api/`/`customer/`/`hague/`/`automation/` 混合 | `background` 指向 `automation`（24）、`hague`（7）等 | 后台运行器同时负责消息协调、队列调度和平台接口封装 | 逐步为后台各 runner 定义 `Application` 用例与基础设施端口 |
