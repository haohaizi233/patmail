# PatMail 模块依赖矩阵与方向收敛（Dependency Matrix）

> 数据来源于真实 AST 扫描器 `patmail-extension/scripts/architecture-check.mjs` 对 `src/` 全部源码的扫描（仅统计非类型 `runtimeInternalEdges`）。

## 一、总体依赖指标对比

| 维度 | 基线（`17ff27d`） | 复审修复后 | 说明 |
| --- | --- | --- | --- |
| 扫描文件总数 | 493 | 516 | +23 文件（Application/Ports/Adapters/Agent 工具子模块/消息注册表/网关） |
| 跨文件运行时内部边 | 1,538 | 1,586 | 工具模块按域拆分后的局部组织边增加 |
| 纯类型边（`import type`） | 492 | 551 | +59 条纯类型依赖，含类型查询及内联类型重导出 |
| 运行时循环依赖 | 0 | **0** | 全部保持无环 |
| 棘轮追踪违规数 | 10 | **0** | Phase C/D 全量清零 |

## 二、重点重构区域 Before / After 跨模块依赖矩阵

以下数值为源目录指向目标顶层模块/子模块的 **运行时 `import` 边计数**（不含 `import type`）：

| 源模块 | 目标模块 | 基线边数 | 当前边数 | 治理动作与结论 |
| --- | --- | --- | --- | --- |
| `app/pages` | `billing` | 4 | **0** | `BillingWorkflowPage.vue` 不再直接导入模板资产/汇率/费用模型 |
| `app/pages` | `recovery` | 5 | **4** | `BillingWorkflowPage.vue` 移除直接 `recovery/client.ts` 耦合 |
| `app/composables` | `application/billing` | 0 | **2** | 新增 `useBillingWorkflow.ts` 对接 `BillingApplicationService` |
| `app/composables` | `infrastructure` | 0 | **1** | 由 Composable 在组合边界注入 `billing-adapters` |
| `application/billing` | `billing` | 0 | **3** | 仅引用 `billing` 模型与校验规则，不持有模板/Chrome/恢复具体实现 |
| `infrastructure` | `application/billing` | 0 | **1** | 实现端口接口（Dependency Inversion） |
| `infrastructure` | `billing` / `recovery` | 0 | **3 / 1** | 集中承接 OOXML、模板、汇率与恢复副作用 |
| `background` | `customer` | 8 | **5** | `background/agent.ts` 停止直连 `limit-mail-submit`/`workflow-mail`/`pct-recipients` |
| `background` | `mail` | 4 | **3** | `background/agent.ts` 停止直连 `mail/assemble.ts` |
| `background` | `workflow` | 5 | **4** | `background/agent.ts` 停止直连 `workflow/reviewer-resolver.ts` |
| `background` | `application/mail` | 0 | **1** | `background/agent.ts` 统一改调 `MailApplicationService` |
| `application/mail` | `customer`/`mail`/`workflow`/`query`/`shared` | 0 | **3/1/1/1/2** | 收口邮件草稿、审核人校验与提交审核能力 |

## 三、架构自动化门禁矩阵（Rule A–F）

| 规则 ID | 校验范围 | 允许依赖 | 禁止依赖 | 当前状态 |
| --- | --- | --- | --- | --- |
| `A-domain-purity` | `domain/*` 与核心纯领域文件 | `shared/types` 等纯类型、无副作用常量 | `vue`、`app/*`、`background/*`、`content/*`、`chrome.*`、`document`/`window` | PASS (0 违规) |
| `B-application-no-ui` | `application/*` | Ports、Domain 模型与契约 | `*.vue`、`app/*`、`floating/*`、`popup/*`、`shell/*` | PASS (0 违规) |
| `C-agent-through-application` | `agent/*`、`background/agent.ts` | `application/mail`、Agent 记忆/规划/工具契约 | 直接导入 `limit-mail-submit`、`pct-recipients`、`workflow-mail`、`mail/assemble`、`reviewer-resolver` | PASS (0 违规) |
| `D-presentation-no-direct-infra` | `app/pages/BillingWorkflowPage.vue` | `useBillingWorkflow`、`shell/*`、UI 组件 | 直接导入 `billing/*` 引擎、`recovery/client.ts`、`infrastructure/*` | PASS (0 违规) |
| `E-no-cycles` | 全项目运行时图（重点覆盖 `application/`、`infrastructure/`、`agent/`、`background/`、`hague/`、`billing/`） | 有向无环依赖（DAG） | 任意运行时强连通分量（`cycle.length > 1`） | PASS (0 循环) |
| `F-runtime-isolation` | MV3 `background/*`、`content/*`、`hague` 生产编排 | 明确的消息通道与协议契约 | `background -> content/vue`、`content -> background`、Hague Runner 运行时依赖 AST 分析器 | PASS (0 违规) |
