# PatMail Phase 2 自动化架构规则与泛化门禁（Architecture Rules A–K）

> 实现位置：`patmail-extension/scripts/architecture/architecture-check.mjs` & `patmail-extension/tests/architecture/`

## 一、扫描器能力强化（防绕过机制）

1. **Barrel Re-export 传递追踪（`expandTransitiveTargets`）**：
   - 从非 `isTypeOnly` 且 `kind === 're-export'` 的内部边构建导向图 `barrelReexports`；
   - 通过带访问标记的 BFS 递归解析，对所有规则检查目标模块及其经 barrel（如 `mail/index.ts`）间接暴露的真实模块（如 `mail/assemble.ts`），防止通过桶文件转口绕过规则（已在 Commit `c8a4075` 中实测拦截了 `MailWorkspace.vue -> mail/index.ts -> assemble/planner/fingerprint` 隐式耦合）。
2. **Vite 后缀与 TypeScript 路径别名解析**：
   - 解析内部 specifier 时自动剥离 `?raw`、`?url`、`?inline`、`?worker` 后缀及锚点；
   - 用 TypeScript 读取支持注释和继承的 `tsconfig.json`，按精确键和最长通配前缀解析别名，并扫描 `.mts`、`.cts`、`.tsx` 等模块变体。
3. **未解析内部导入识别（`unresolvedImports`）**：
   - 任何以 `.` 开头或匹配 `tsconfig.paths` 且无法映射至真实磁盘文件的静态/动态导入与 SFC `<script src>`，不再悄然忽略，而是进入 Rule J 硬阻断清单。
4. **`import type` 安全免误报**：
   - `import type`、全 `type` 命名导入及 TypeScript `import('./...')` 类型节点标记为 `isTypeOnly: true`，不触发跨层或循环报错。

## 二、规则集全表（Rules A–K）

| 规则编号 | 级别 | 覆盖范围与核心约束 | 防止的真实旁路方式 |
| --- | --- | --- | --- |
| **Rule A** (`A-domain-purity`) | `error` | `domain/*` 与 `CORE_DOMAIN_FILES`（含 `hague/protocol/ast-action-parser.mjs`）禁止运行时导入 `vue` / UI / Background / Content 或访问 Chrome / DOM 全局 API | 防止领域层与协议解析内核污染为环境绑定代码 |
| **Rule B** (`B-application-no-ui`) | `error` | `application/*` 禁止直接或经 barrel 导入 `.vue` / Presentation 模块 | 防止应用用例反向耦合前端组件 |
| **Rule C** (`C-agent-through-application`) | `ratchet`（当前 0） | `agent/*` 与 `background/agent.ts` 禁止直接或经 barrel 导入发文/审核人/邮编提交核心模块 | 防止 Agent 工具或新辅助文件绕过 `MailApplicationService` |
| **Rule D** (`D-presentation-no-direct-infra`) | `error` | **全部** `app/pages/**`、`app/components/**`、`floating/**`、`popup/**`、`shell/**` 及非 Composition Root `app/composables/**` 禁止导入 `infrastructure/*`；界面与非根 Composable 禁止导入请款引擎模块；`*Billing*.vue` 页额外禁止 `recovery/client.ts` | 防止把违规代码转移到新页面或未登记 Composable（如 `FutureReportPage.vue` / `useAdHocHelper.ts`） |
| **Rule E** (`E-no-cycles`) | `error` | 目标严格域（`application/`、`domain/`、`agent/tools/`、`billing/`、`hague/protocol/`、`hague/gateway.ts`、`background/message-registry.ts`）保持 0 运行时循环 | 防止通过 Barrel 或互引破坏分层单向性 |
| **Rule F** (`F-runtime-isolation`) | `error` | MV3 `background/*` 与 `content/*` / `*.vue` 双向严禁运行时互导 | 保证 Service Worker 与 DOM/Content Script 隔离 |
| **Rule G** (`G-mail-ui-through-application`) | `error` | `TasksPage.vue`、`WorkflowMailEntry.vue`、`MailWorkspace.vue` 及所有匹配 `(app/pages\|floating)/.*Mail.*\.vue` 的界面禁止直连或经 barrel 导入 `mail/{assemble,planner,fingerprint}.ts`、`customer/{limit-mail-submit,workflow-mail,pct-recipients}.ts`、`workflow/reviewer-resolver.ts` | 保证受治发文 UI 与 Agent 共享单一 `MailApplicationService` 业务入口 |
| **Rule H** (`H-application-no-transport-leak`) | `error` | `application/*` 禁止导入 `shared/message.ts`、`shared/guards.ts`、`infrastructure/*`、`background/*`、`content/*`，并禁止直接访问 Chrome / DOM 全局及 `MessageType`，含常见全局和方括号写法 | 保证 Application 层保持传输无关性与可离线单测 |
| **Rule I** (`I-hague-protocol-vs-diagnostics`) | `error` | 海牙生产驱动与编排模块禁止导入 `hague/diagnostics/ast/*`、`diagnostics/{reports,replay,fixtures,export}.ts`、`research/*`；`hague/protocol/*` 严禁导入**任何** `hague/diagnostics/*` | 防止研究/回放工具或 `diagnostics/ast` 反向渗入生产驱动，同时放行 `protocol/*` 内核与只读 `store/errors` |
| **Rule J** (`J-no-unresolved-internal-imports`) | `error` | 存在任何未解析内部相对/别名导入即阻断 | 防止因拼写/路径变更导致静态检查盲区漏放跨层引用 |
| **Rule K** (`K-composition-root-registry`) | `error` | 除 `infrastructure/*` 内部外，仅 `COMPOSITION_ROOTS` 白名单登记文件允许运行时导入对应 `infrastructure/*` 适配器 | 防止扩展其它任意层私自实例化基础设施适配器 |

### 当前 `COMPOSITION_ROOTS` 注册表

1. `app/composables/useBillingWorkflow.ts` -> 允许装配 `infrastructure/billing/billing-adapters.ts`
2. `background/agent.ts` -> 允许装配 `infrastructure/mail/easy-mail-gateway-adapter.ts`

## 三、负向防绕过测试（`tests/architecture/architecture-bypass.test.ts`）

使用临时目录真实文件 AST 扫描与合成依赖清单，对全部 8 类恶意/疏漏绕过场景进行负向验证（100% 检出无误报）：

- 新建页面 `FutureReportPage.vue` 直接导入 `infrastructure/*` 或 `billing/xlsx-engine.ts` -> 同时被 **Rule D** 与 **Rule K** 拦截；
- 未登记 `useAdHocHelper.ts` 导入 `infrastructure/*` -> 被 **Rule D** 与 **Rule K** 拦截；
- Agent 或 `TasksPage.vue` 通过 Barrel `mail/index.ts` 转口导入 `mail/assemble.ts` -> 被 **Rule C** 与 **Rule G** 传递拦截；
- `application/*` 导入 `shared/message.ts` 或调用 `chrome.downloads` / `MessageType.*` -> 被 **Rule H** 拦截；
- `hague/http-driver.ts` 导入 `diagnostics/ast/analyzer.mjs` 或 `diagnostics/reports.ts`，以及 `hague/protocol/*` 导入 `diagnostics/store.ts` -> 被 **Rule I** 拦截；
- 纯 `import type { MailPort }` -> 允许通过，零误报；
- `application/mail/*` 内部运行时环与 `hague/protocol/*` 失效相对路径 -> 被 **Rule E** 与 **Rule J** 拦截。
