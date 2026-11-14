# CI 工程建设验收报告

- 仓库：`patmail`（Chrome MV3 扩展 `patmail-extension` + 脚本/文档）
- 验收日期：2026-10-29 ~ 2026-10-30
- 验收提交：`3ecc45f`（含本次待提交的 E2E 脚手架与门禁基线收尾改动）
- 口径：所有命令在 `patmail-extension/` 下执行，与 `.github/workflows/*.yml` 同一套 `scripts/ci-check.mjs` 入口（见 `docs/ci/local-reproduction.md`）

## 1. 验收结论

| 项目 | 结论 |
| --- | --- |
| 静态门禁（typecheck / lint 棘轮 / format） | ✅ 全部通过 |
| 测试三层（unit / integration / regression） | ✅ 1008 例全部通过，0 失败 0 跳过 |
| 构建与产物（build / manifest / dist / SHA-256 清单） | ✅ 通过 |
| 安全（密钥扫描 / 依赖许可 / 历史扫描） | ✅ 通过（历史发现按指纹登记 `ci/secret-allowlist.json`，含整改计划） |
| 覆盖率防退化基线 | ✅ 本次采集落盘 `ci/coverage-baseline.json`（`--coverage-gate` 首次自动登记） |
| E2E smoke（extension + limits） | ✅ 2/2 通过 |
| E2E full 组其余场景 | ⚠️ workspace 为历史已知红（§4.1）；native-pipeline-fault 恢复续传阶段确定性红，重跑 5 次同点失败（§4.2） |
| 反向验收（七类故障注入） | ✅ 逐项确认门禁非零退出（§3） |

## 2. 门禁结果明细（`pnpm ci:check`，2026-10-29）

| 门禁 | 入口 | 结果 | 证据 |
| --- | --- | --- | --- |
| Typecheck | `pnpm typecheck` | PASS（26.5s，exit=0） | `test-results/ci/steps/typecheck.json` |
| Lint 棘轮 | `pnpm lint` | PASS（exit=0；存量 635 errors / 25 warnings，较基线 681→635 收紧；2026-10-29 历史快照，2026-11-14 已清零，见 `docs/ci/quality-gates.md`） | `ci/eslint-baseline.json`、`test-results/ci/steps/lint.json` |
| Format | `pnpm format:check` | PASS（exit=0） | `test-results/ci/steps/format.json` |
| Unit | `pnpm test:unit` | PASS（806 用例） | `test-results/ci/steps/unit.json` |
| Integration | `pnpm test:integration` | PASS（63 用例） | `test-results/ci/steps/integration.json` |
| Regression | `pnpm test:regression` | PASS（139 用例） | `test-results/ci/steps/regression.json` |
| E2E smoke | `pnpm test:e2e:smoke` | PASS（extension + limits，2/2） | `test-results/ci/e2e-smoke.json`、`test-results/phase2-ext.log`、`test-results/phase2-limits.log` |
| Coverage | `pnpm test:coverage` + `ci-report --coverage-gate` | PASS（基线落盘，见 §2.1） | `ci/coverage-baseline.json`、`test-results/coverage/` |
| Build | `pnpm build` | PASS（216.9s，exit=0） | `test-results/ci/steps/build.json` |
| 构建一致性 | `pnpm verify:repro` | PASS（两次独立构建 382 文件逐项 Hash 一致，组合摘要 `6bdb4237fc310fb6…`） | `test-results/verify-repro.log` |
| Security | `pnpm scan:secrets` / `licenses:check` | PASS（0 error / 191 warn / 1 例外；23 直接依赖 0 问题） | `test-results/ci/secret-scan.json`、`license-report.json` |
| Manifest / 产物 | `verify:manifest` / `verify:dist` | PASS（0 问题 / 7 审计记录；382 文件，组合摘要 `6bdb4237fc310fb6…`） | `test-results/ci/manifest-report.json`、`artifact-manifest.json` |
| 总体 | `pnpm ci:check` | PASS（各已执行项全过；full E2E 与 workspace 状态见 §4） | `test-results/ci/summary.md` |

### 2.1 覆盖率防退化基线

`node scripts/ci-report.mjs --coverage-gate` 首次执行自动把当前覆盖率写入 `ci/coverage-baseline.json`（total + core 模块），
此后任一指标（lines / branches / functions，含 core 模块）低于基线即失败。禁止以删除测试或排除业务模块的方式抬高数字；
上调基线必须在提交说明中明确原因。详见 `docs/ci/quality-gates.md`。

## 3. 反向验收：七类故障注入（门禁真的拦得住）

方法：在工作树临时注入故障 → 运行对应门禁 → 确认非零退出 → 恢复原状（脚本 `test-results/reverse-acceptance.ps1`，
逐项输出记录 `test-results/reverse-acceptance.log`）。测试夹具中的假凭据样本为一次性注入物，验证后立即删除。

| # | 注入 | 应失败的入口 | 结果 |
| --- | --- | --- | --- |
| 1 | 任意 `.ts` 类型错误 | `pnpm typecheck` | ✅ 拦截（TS2322，exit=2） |
| 2 | 新增未使用变量（超出棘轮基线） | `pnpm lint` | ✅ 拦截（no-unused-vars 635→636，棘轮 exit=1） |
| 3 | 格式错误（`ci/**/*.json`） | `pnpm format:check` | ✅ 拦截（4 文件不合规，exit=1） |
| 4 | 改坏一个断言 | `pnpm test:unit` | ✅ 拦截（1 用例失败，exit=1） |
| 5 | 删除 `dist` 中 manifest 引用的入口 | `pnpm verify:manifest` / `pnpm verify:dist` | ✅ 拦截（两入口均 exit=1；首次注入删错文件未被拦，修正注入后复测通过） |
| 6 | 测试夹具放假凭据样本（`AKIA…` + PEM 私钥） | `pnpm scan:secrets` | ✅ 拦截（1 error，exit=1，验证后样本已删除） |
| 7 | 篡改 `dist` 任一字节 | `pnpm verify:dist` 的 SHA-256 清单 | ✅ 拦截（`content.js` 与留档清单不一致，exit=1，恢复后 exit=0；首次仅比对当次重算清单未被拦，补 `--against` 留档比对后复测通过） |

注入全部恢复后复跑干净门禁（`clean-lint` / `clean-secrets` / `clean-manifest` / `clean-dist` / `clean-format`）全部 exit=0，工作树无残留注入（`zz-diag.e2e.mjs` 等临时文件已删除）。
反向验收脚本内嵌的 coverage 步骤因与并发覆盖率运行争用 `test-results/coverage/.tmp` 报 ENOENT 失败，属执行顺序问题而非门禁缺陷；随后串行单独重跑 `pnpm test:coverage` + `ci-report --coverage-gate` 全绿（两步 exit=0，基线写入），见 §2 Coverage 行与 §2.1。

## 4. 失败与阻断项（如实记录，不删断言、不加 skip）

### 4.1 workspace 场景：历史 UI 契约漂移（已知红）

`tests/e2e/scenarios/workspace.mjs` 首步即失败（等待 `navigation[name=工作台导航] link[客户管理]` 超时）。
根因：场景断言 2026-09-26/09-28 时代的界面契约，产品界面在 09-28、09-29、10-27 三次演进后未同步；
绑定与生成计划入口已移到 EASY 面板。**不属于 CI 建设引入的退化**（对比基线：CI 建设前该场景同样报红）。
整改计划见 `docs/ci/e2e-matrix.md` §4（按现行 UI 契约重写导航与操作路径，保留业务断言语义，完成后由红转绿）。
证据：`test-results/phase2-ws.log`。

### 4.2 native-pipeline-fault：恢复续传阶段确定性红（跟踪中）

`tests/e2e/native-pipeline-fault.e2e.mjs` 在恢复续传阶段报红，2026-10-30 重跑 5 次均在同一点失败：
第二阶段点击 `继续下载` 后等待 `activeTask.status === 'done'` 的窗口内测试浏览器被关闭
（`event: app closed / context closed / browser disconnected`），`waitForPageCondition` 报
*Target page, context or browser has been closed*。中断、暂停、恢复横幅与查询状态恢复断言均已稳定通过。
判定为确定性红（恢复续传链路或脚手架生命周期管理的真实问题），保留原断言与证据、不加 skip。
整改计划见 `docs/ci/e2e-matrix.md` §5；证据 `test-results/pf-e2e-4.log`（`NPF_EXIT=1`）。

### 4.3 既有技术债的处置

ESLint 存量 635 errors / 25 warnings 采用**基线棘轮**治理（`ci/eslint-baseline.json`）：只降不升，
新代码不得增加存量问题（反向验收 #2 验证拦截有效）。历史密钥/私钥发现按指纹登记 `ci/secret-allowlist.json`
（expires 强制复查），整改计划见 `docs/ci/security-policy.md`。
本节为 2026-10-29 验收时点快照；ESLint 棘轮已于 2026-11-14 清零并转为硬门禁，见 `docs/ci/quality-gates.md`。

## 5. 证据索引

| 证据 | 位置 |
| --- | --- |
| CI 汇总报告 | `test-results/ci/summary.md`、`summary.json` |
| 分步结果 | `test-results/ci/steps/<name>.json` |
| E2E 分组结果 | `test-results/ci/e2e-smoke.json`、`e2e-full.json` |
| 反向验收逐项输出 | `test-results/reverse-acceptance.log` |
| 覆盖率 | `test-results/coverage/`、`ci/coverage-baseline.json` |
| 产物 SHA-256 清单 | `test-results/ci/artifact-manifest.json` |
| 构建一致性 | `test-results/verify-repro.log`（两次构建 382 文件 Hash 全一致） |
| 失败证据（截图/日志） | `test-results/`（脱敏，不入库） |

## 6. GitHub Actions 远程验证状态与遗留风险

### 6.1 远程验证：BLOCKED

本次环境未获授权向远程仓库推送，**没有运行过真实 GitHub Workflow，远程验证标记 BLOCKED，不标 PASS**。
已完成的本地静态验证：

- 4 个工作流（`ci.yml` / `e2e.yml` / `security.yml` / `release-check.yml`）YAML 语法经 Prettier 解析通过；
- `jobs` / `needs` 引用无悬空（结构校验：4 文件 `needs-dangling=[]`）；
- 每个工作流均声明顶层 `permissions` 最小化，配置了按分支/PR 的并发取消与制品保留期限；
- 复用 `.github/actions/setup-patmail` 复合 Action 统一 Node/pnpm/Chromium 安装，`.github/dependabot.yml` 负责依赖更新。

工具缺口如实记录：本机未安装 `actionlint`，深度静态分析未执行（缺工具不等于通过）。

**最小后续验证步骤**：推送 CI 专用分支（不推 main）→ 触发 `ci.yml`（PR）与 `e2e.yml`（push）→
收集 Run URL 与制品 → 核对 Job Summary 与 `test-results/ci/summary.md` 口径一致 →
将 Run URL 回填本报告并把本节 BLOCKED 改为 PASS/FAIL。

### 6.2 未解决工程风险

1. `scenarios/workspace.mjs` 红：历史 UI 契约漂移（§4.1），整改计划见 `docs/ci/e2e-matrix.md` §4；
2. `native-pipeline-fault` 恢复续传阶段确定性红（§4.2），整改计划见 `docs/ci/e2e-matrix.md` §5；
3. ESLint 存量 635 errors / 25 warnings：基线棘轮只降不升，新代码不得新增存量问题（2026-10-29 时点；2026-11-14 已清零为 0/0 硬门禁，见 `docs/ci/quality-gates.md`）；
4. 历史密钥/私钥发现按指纹登记 `ci/secret-allowlist.json`（含 `expires` 强制复查）；
5. 业务 Origin 仍为 HTTP（如 `http://43.138.138.200:8588/*`），未在无迁移方案下强切 HTTPS，需独立迁移工作项；
6. 历史 `dist.pem` 签名私钥风险：仅形成风险处理建议——不轮换、不改变扩展 ID、CI 不使用该密钥；
7. 远程 GitHub Actions 未验证（§6.1）。

### 6.3 后续维护建议

- PR Fast Gate 与 Full Gate 分层已落地（`ci.yml` / `e2e.yml`），保持 PR 门禁在 10 分钟量级，全量回归放 main/手动；
- 覆盖率基线上调必须在提交说明中写明原因，禁止删测试或排除业务模块抬数字（`docs/ci/quality-gates.md`）；
- 存量 lint 问题持续走棘轮下降，新增代码零存量；
- 依赖安全更新走 Dependabot，安全告警例外必须带 reason 与失效日期（`docs/ci/security-policy.md`）；
- 排障入口：`docs/ci/troubleshooting.md`、`docs/ci/local-reproduction.md`（本地一条命令复现 `pnpm ci:check`）。
