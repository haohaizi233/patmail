# 质量门禁（Phase 1 / 2 / 4 / 7 / 8）

统一入口：`pnpm ci:check`（依次执行下表全部步骤，任何一步失败整体非零退出）。
GitHub Actions 按步骤拆并行 Job：`node scripts/ci-check.mjs --steps <a,b,c>`。

| 门禁 | 命令 | 判据 | 失败行为 |
| --- | --- | --- | --- |
| 类型检查 | `pnpm typecheck` | `vue-tsc --noEmit` 零错误 | 退出码 1 |
| Lint | `pnpm lint` | ESLint 9 Flat Config 棘轮（`ci/eslint-baseline.json`） | 超基线/新规则出问题 → 失败 |
| 格式 | `pnpm format:check` | Prettier 对 CI 工程文件（脚本/eslint/vitest/ci 配置/docs/ci/.github） | 有未格式化文件 → 失败 |
| 单元测试 | `pnpm test:unit` | tests/unit 129 文件全绿 | 失败用例 → 失败 |
| 集成测试 | `pnpm test:integration` | tests/integration 11 文件全绿 | 同上 |
| 回归测试 | `pnpm test:regression` | tests/regression 17 文件全绿 | 同上 |
| 构建 | `pnpm build` | vue-tsc + vite 双段成功 | 退出码非 0 |
| MV3 合规 | `pnpm verify:manifest` | manifest 结构/入口文件/权限审计/CSP/宽泛 Origin/update_url | 违规即失败，审计记录留档 |
| 产物校验 | `pnpm verify:dist` | 入口与静态资源完整、无 Node/Python/密钥/测试夹具、SHA-256 清单 | 违规即失败 |
| 密钥扫描 | `pnpm scan:secrets` | 工作树（Git 口径）凭据类 error=0 | error>0 失败；warn 仅登记 |
| 许可策略 | `pnpm licenses:check` | 直接依赖许可 ∈ 允许清单或登记例外（未过期） | 未知许可/过期例外 → 失败 |
| 可复现构建 | `pnpm verify:repro` | 两次构建逐文件 SHA-256 一致 | 不一致即失败并列出差异文件 |
| E2E | `pnpm test:e2e:smoke\|full\|legacy` | 分组场景全绿（`docs/ci/e2e-matrix.md`） | 失败/前置缺失（BLOCKED）→ 失败 |
| 汇总门禁 | `pnpm ci:report -- --gate` | summary 中无 FAIL/BLOCKED | 有则失败 |

## ESLint 棘轮（历史存量分级治理）

- 基线文件：`ci/eslint-baseline.json`（当前：**681 errors / 25 warnings，63 文件**，全部为历史存量）。
- 规则：数量**低于**基线 → 通过并提示可收紧；**高于**基线或出现基线外新规则 → 失败（新代码不得新增问题）。
- 危险规则硬门禁 0 容忍：`@typescript-eslint/no-floating-promises`、`no-misused-promises`、`no-explicit-any`（src）、`require-await`、`no-async-promise-executor`。
- 严禁整目录关闭规则；调整基线必须 `node scripts/eslint-ratchet.mjs --update` 并在变更说明写明原因。

## 覆盖率

- Provider：`@vitest/coverage-v8`；输出 text / json / json-summary / html / lcov → `test-results/coverage/`。
- 口径：全局（summary.total）与核心模块（`src/mail、workflow、automation、background、browser-download`）分别统计（`ci-report` 输出 core 分组）。
- **防退化门禁**：`node scripts/ci-report.mjs --coverage-gate` 对照 `ci/coverage-baseline.json`，任一指标下降即失败；首次执行自动落盘基线。
- 建议目标（不是当前硬阈值，达标后逐档启用）：全局 Lines 75% / Functions 75% / Branches 65%；核心模块 Lines 85% / Branches 75%。
- 明确禁止：排除复杂业务模块换覆盖率数字。
- **未自动化**：新增/变更代码（diff coverage）需要比对 PR diff，依赖远端 API，当前以人工评审 + 全局防退化替代（原因：离线可复现优先）。

## 交付约束（verify:dist 实测口径）

dist 中禁止出现：`node_modules/`、`package.json`、Node 内置模块引用、`process.binding`、`.py/.ps1`、`local-download/`、测试文件/夹具、`*.pem/*.key/.env*/cookies.txt`、疑似密钥内容。
必须存在：manifest 全部引用入口、4 个图标、`assets/sme-customers.json`、`licenses/zip.js.txt`、`使用说明.txt`、≥20 个头像资源。
当前实测：**182 个文件**，SHA-256 清单 `test-results/ci/artifact-manifest.json`。

## 反向验收（门禁确实会拦截）

见 `docs/ci/acceptance-report.md` 第 3 节：TypeScript 错误、ESLint 违规、格式错误、测试失败、manifest 入口缺失、假凭据样本、产物校验破坏，七类故障逐项注入并确认非零退出。
