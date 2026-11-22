# PatMail 架构治理重构验收报告（Refactoring Acceptance）

> 基线提交：`ff3f2553d7bf677d787c1252c5d844536b2f4763`  
> 代码与测试最新验证提交：`e350b99`（涵盖 Phase A–F 全部结构重整、适配测试与边界强化）

## 一、验收结论

**核心治理范围全部通过（严格约束边界 0 违规、0 运行时循环，功能与安全语义完整保留）；全仓非本次核心域的阶段二技术债按渐进原则显式登记于 [边界违规清单](./boundary-violations.md)。**

## 二、分层与耦合改进对比

| 指标 | 基线（`17ff27d` 初扫） | 当前（`e350b99`） | 达成结论 |
| --- | --- | --- | --- |
| 棘轮追踪架构违规数 | 10（Billing 5 + Agent 5） | **0** | PASS（清零并由 CI 锁定） |
| 运行时循环依赖 | 0 | **0** | PASS |
| AST 扫描源码文件数 | 493 | 516 | +23 个显式分层/模块化文件 |
| `BillingWorkflowPage.vue` 直连基础设施边 | 5 | **0** | PASS |
| `agent/*` 与 `background/agent.ts` 绕过应用层边 | 5 | **0** | PASS |
| `submit_easy` schema 与 `SYSTEM_PROMPT` 默认审核人一致性 | 存在语义冲突风险 | 统一锁定为 `defaultReviewer` | PASS |
| Export 导出状态模型 | 隐式布尔/单态混用 | 显式 6 态 `ExportOutcome` | PASS |
| Hague 生产流程与 AST 诊断隔离 | 无独立门户抽象 | `HagueGateway` + `import type` 隔离 | PASS |

## 三、自动化验证矩阵与实测结果

| 验证项 | 命令 | 实测结果 | 详细数据 / 证据 |
| --- | --- | --- | --- |
| 静态类型检查 | `pnpm typecheck` | **PASS** | `vue-tsc --noEmit` 0 errors |
| 代码规范与豁免指纹 | `pnpm lint` | **PASS** | ESLint 0 errors / 0 warnings（基线 0/0） |
| Prettier 格式门禁 | `pnpm format:check` | **PASS** | 全部匹配脚本与配置文件格式正确 |
| AST 依赖与架构测试 | `pnpm architecture:check` | **PASS** | 516 文件 / 1584 运行时边 / 0 循环 / 0 硬错 / 5 文件 8 用例全部通过 |
| 单元测试全量 | `pnpm test:unit` | **PASS** | **1,967 / 1,967** 通过（0 失败 / 0 跳过） |
| 集成测试全量 | `pnpm test:integration` | **PASS** | **71 / 71** 通过（0 失败 / 0 跳过） |
| 历史回归测试全量 | `pnpm test:regression` | **PASS** | **139 / 139** 通过（0 失败 / 0 跳过） |
| 专项架构重构单测 | `vitest run`（Mail/Billing/Background/Hague） | **PASS** | Billing Service 4/4、Mail Service 4/4、Background Registry 6/6、Hague 77 文件 523/523 |
| 覆盖率防退化门禁 | `pnpm test:coverage && node scripts/ci-report.mjs --coverage-gate` | **PASS** | Total Lines **78.71%** / Branches **64.92%** / Functions **76.83%**（全部高于基线） |
| 完整 CI 检查链 | `pnpm ci:check` | **PASS** | **13 / 13** 步通过（144.7s；Manifest 0 问题；Secrets 0 error；Licenses 26 依赖 0 异常） |
| 可复现构建校验 | `pnpm verify:repro` | **PASS** | 两次构建完全一致：448 文件，组合摘要 `f4f1eb93ccbe5e42…` |
| 请款 Playwright E2E | `pnpm test:e2e:billing` | **PASS** | **1/1 分组**（9 项工作流、3 模板、导出、草稿恢复与 Mermaid 检查全部通过，19.3s） |
| 冒烟 Playwright E2E | `pnpm test:e2e:smoke` | **PASS** | **2/2 分组**（`extension` 13 项检查 19.1s + `limits` 4 项检查 9.7s） |

### 核心模块覆盖率明细（相对基线提升情况）

| 模块 | Lines %（当前 vs 基线） | Branches %（当前 vs 基线） | Functions %（当前 vs 基线） |
| --- | --- | --- | --- |
| **Total（全仓）** | **78.71%** vs 73.42% | **64.92%** vs 59.63% | **76.83%** vs 70.94% |
| `background` | **64.88%** vs 51.42% | **55.24%** vs 41.79% | **55.68%** vs 44.74% |
| `mail` | **91.69%** vs 91.46% | **72.18%** vs 70.78% | **92.23%** vs 91.10% |
| `workflow` | **89.66%** vs 89.47% | **64.52%** vs 64.52% | **86.94%** vs 86.57% |
| `automation` | **73.50%** vs 73.50% | **69.10%** vs 69.10% | **68.73%** vs 68.67% |
| `browser-download` | **96.18%** vs 96.18% | **84.65%** vs 84.65% | **87.64%** vs 87.64% |
| `application`（新增） | **82.91%** | **63.96%** | **88.46%** |
| `hague` | **90.43%** | **74.86%** | **85.23%** |
| `billing` | **95.69%** | **77.47%** | **94.97%** |
| `agent` | **85.85%** | **70.14%** | **83.19%** |

## 四、业务与安全红线核查

1. **Chrome MV3 与隔离约束**：未引入常驻服务端，未放宽 CSP 或 `host_permissions`，未通过 `connectOverCDP` 连接日常浏览器。
2. **请款三套模板与工作簿输出**：`general-foreign`、`midea-foreign`、`midea-pct` Golden Master 单测与 `test:e2e:billing` 验证完全一致；浏览器 Blob 触发严格标记为 `download_started`，不伪造落盘完成。
3. **Agent 与 EASY 审核人红线**：`submit_easy` 参数模型、工具描述、系统提示与 `MailApplicationService` 一致对齐默认审核人（`defaultReviewer`），禁止自审或自动结单。
4. **Hague 不确定态与防重放**：`uncertain` 态保留、单次重试上限、`planIdentity` SHA-256 指纹核对及历史兼容迁移均由 `hague-gateway.test.ts` 与全套 `tests/unit/hague/`（523 用例）逐一回归通过。
