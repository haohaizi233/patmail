# PatMail Phase 2 验收与安全披露报告（Acceptance）

> 参考基线：`76bf0e34cd62c58c1a3e35c5e61a98acf35dc93a`\
> 代码验证提交：`a1300dd`（Phase 1–6 全量重整完成）

## 一、自动化门禁与实测结果

| 验证项 | 执行命令 | 实测结果 | 证据摘要 / 诚实备注 |
| --- | --- | --- | --- |
| 静态类型检查 | `pnpm typecheck` | **PASS** | `vue-tsc --noEmit` 0 errors（13.0s） |
| 代码规范与豁免指纹 | `pnpm lint` | **PASS** | ESLint 基线棘轮 0 errors / 0 warnings（25.2s） |
| Prettier 格式检查 | `pnpm format:check` | **PASS** | 全部匹配脚本与 CI 配置文件格式正确（0.5s） |
| 架构依赖与绕过门禁 | `pnpm architecture:check` | **PASS** | 523 文件 / 1,606 运行时边 / 0 循环 / 0 未解析内部导入 / 0 违规；`tests/architecture/` **6 文件 / 16 用例 PASS**（含 5 条 `architecture-bypass.test.ts` 负向验证） |
| 集成测试 | `pnpm test:integration` | **PASS** | **71 / 71** 通过（0 失败 / 0 跳过） |
| 历史回归测试 | `pnpm test:regression` | **PASS** | **139 / 139** 通过（0 失败 / 0 跳过） |
| 全量单元测试（限并发） | `npx vitest run tests/unit --maxWorkers=2 --reporter=default --reporter=junit --outputFile=test-results/junit/unit.xml` | **PASS** | **283 文件 / 1,979 用例通过**（0 失败 / 0 跳过，110.85s）。诚实备注：`pnpm ci:check` 内部直接调用无 `--maxWorkers` 上限的 `vitest run tests/unit` 在 Windows Node v26 宿主机上触发 `FATAL ERROR: Zone Allocation failed - process out of memory`（exit 134）；限制工作进程数为 2 后全量 1,979 用例 100% 通过，`pnpm ci:check` 其余 12/13 步一次性全通过 |
| 覆盖率与防退化门禁 | `npx vitest run --coverage --maxWorkers=2` + `node scripts/ci-report.mjs --coverage-gate` | **PASS** | Total Lines **79.17%**（19,680/24,855）/ Branches **64.81%** / Functions **77.38%**（均高于基线 73.42% / 59.63% / 70.94%） |
| 生产构建与安全校验 | `pnpm build && pnpm verify:manifest && pnpm verify:dist && pnpm scan:secrets && pnpm licenses:check` | **PASS** | `dist/` 448 文件；Manifest 0 异常 / 7 条审计记录；工作树 secrets 扫描 0 error；26 依赖许可正常 |
| 可复现构建校验 | `pnpm verify:repro` | **PASS** | 两次构建完全一致：448 个文件，组合摘要 `2429f84a194c1684…` |
| 请款 Playwright E2E | `pnpm test:e2e:billing` | **PASS** | **1 / 1** 组 9 项工作流场景通过（7.5s） |
| 冒烟 Playwright E2E | `pnpm test:e2e:smoke` | **PASS** | **2 / 2** 组通过（`extension` 13 项 12.7s + `limits` 4 项 6.1s） |
| 全量 Playwright E2E | `pnpm test:e2e:full` | **PASS** | **15 / 15** 组全通过（`extension`、`limits`、`workspace`、`download`、`browser-download`、`file-pages`、`download-editor`、`prewarm-pagination`、`jihua-upload`、`billing`、`browser-download-store`、`native-stream-lifetime`、`native-pipeline-fault`、`resume-protocol`、`docs`） |
| CI 汇总门禁 | `node scripts/ci-report.mjs --gate` | **PASS** | 总体 **PASS**（清除历史残留旧分片 JSON 后汇总 smoke+full **17/17** 与全量单测/集成/回归/构建/安全/覆盖率） |

### 模块覆盖率明细（Phase 2 覆盖率实测）

| 模块 | 文件数 | Lines % | Branches % | Functions % |
| --- | --- | --- | --- | --- |
| **Total（全仓）** | - | **79.17%** | **64.81%** | **77.38%** |
| `application`（含 Mail Port） | 11 | **88.14%** | **69.09%** | **88.57%** |
| `infrastructure`（Billing + Mail 适配器） | 2 | **75.40%** | **61.22%** | **50.00%** |
| `billing` | 5 | **95.69%** | **77.47%** | **94.97%** |
| `mail` | 38 | **91.69%** | **72.34%** | **92.23%** |
| `hague` | 42 | **90.46%** | **74.90%** | **85.25%** |
| `agent` | 26 | **85.85%** | **70.14%** | **83.19%** |
| `workflow` | 22 | **89.66%** | **64.52%** | **86.94%** |
| `browser-download` | 4 | **96.18%** | **84.65%** | **87.64%** |
| `automation` | 39 | **73.50%** | **69.10%** | **68.73%** |
| `background` | 20 | **64.88%** | **55.24%** | **55.58%** |

## 二、业务与架构红线守恒结论

1. **MV3 架构原样保留**：未引入独立服务端，未放宽 CSP 或 `host_permissions`，未对日常浏览器使用 `connectOverCDP()`。
2. **关键业务操作语义零篡改**：
   - EASY 发文审校继续使用配置项 `defaultReviewer`，绝不改为当前操作人或自动结单；
   - WIPO eHague 保持 `uncertain` 非自动重放、`planIdentity` SHA-256 校验、单次重试预算、Web Locks、Session Gate 与 Creation Pool；
   - `unknown` / `download_started` 与 `download_completed` 严格区分，禁止超时自动重复提交或伪报落盘完成。

## 三、独立安全风险披露（Important Security Disclosure）

本轮重构严格按照“禁止擅自改动现有外部连接与认证语义”保持了 `patmail-extension/src/agent/config.ts` 原有行为。经复核，**以下客户端安全风险真实存在且未由工作树 `pnpm scan:secrets` 消除**：

1. **前端产物明文暴露密钥**：`src/agent/config.ts` 中通过 Vite 构建期环境变量注入的 `import.meta.env.VITE_AGENT_DEFAULT_KEY`（第 20 行）与 `import.meta.env.VITE_AGENT_FALLBACK_KEY`（第 32 行），尽管未以硬编码形式进入 Git 仓库源码（因此 `scan:secrets` 在仓库源码树报 0 error），**一旦带 `.env` 注入构建，完整 Key 仍会明文打入发布包 JS 产物，任何拿到扩展 `.zip` / `dist` 的用户均可直接提取（源码第 30 行注释亦明确指出了这一点）**。
2. **明文 HTTP 默认大模型端点**：`AGENT_CONFIG_DEFAULT.baseUrl` 默认配置为 `http://43.138.138.200:8588/v1`（第 17 行，未加密明文 HTTP），经该默认通道发送的 Prompt、上下文或携带的 `Authorization: Bearer` / `x-api-key` 请求头在传输链路不具备 TLS 机密性与防篡改保护（仅内网直连部署约定使然，不得在不做迁移方案的前提下擅改）。
3. **内置备用外网模型回退（MiMo）**：`AGENT_FALLBACK`（第 27–34 行）写死了备用外部端点 `https://api.xiaomimimo.com/v1`（模型 `mimo-v2.6-pro`）及 `VITE_AGENT_FALLBACK_KEY`，“地址和密钥不进设置页”，主模型连通失败时可能静默切至该外部端点。
4. **安全治理边界说明**：CI 的 `scan:secrets` 仅验证源代码仓库不包含已泄漏静态秘钥，**不能等同于解决客户端打包秘钥暴露或明文 HTTP 传输问题**；生产发布或外部化前需依赖服务端代理鉴权与 HTTPS 改造方案单独治理。
