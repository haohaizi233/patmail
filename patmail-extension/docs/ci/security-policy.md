# 安全策略（供应链 · 密钥扫描 · 业务数据防泄漏）

本文描述 CI 工程实际落地的安全门禁：配置在哪、怎么跑、失败口径、例外登记与整改计划。
所有命令均在 `patmail-extension/` 下执行，产出统一落在 `test-results/ci/`（不入库）。

## 1. 依赖与供应链

| 能力 | 入口 | 说明 |
|---|---|---|
| 依赖漏洞审计 | `pnpm audit:deps`（`pnpm audit --prod --audit-level high`） | 只审计生产依赖；high 及以上失败退出 |
| 锁文件完整性 | `pnpm install --frozen-lockfile`（`.github/actions/setup-patmail`） | CI 不允许改写 `pnpm-lock.yaml` |
| 许可策略 | `pnpm licenses:check`（`scripts/license-check.mjs`） | 直接依赖按 `ci/license-policy.json` 校验 |
| 依赖更新 | `.github/dependabot.yml` | npm 生态（`patmail-extension/`）+ GitHub Actions，每周一 |

- 许可白名单：MIT / ISC / BSD-2/3 / Apache-2.0 / 0BSD / Unlicense / CC0-1.0 / CC-BY-3.0/4.0 / BlueOak-1.0.0 / Python-2.0。
- 许可例外：登记在 `ci/license-policy.json` 的 `exceptions`，必须带 `reason` 与 `expires`（到期复审，未续期自动失败）；当前为空。
- 传递依赖清单由人工复审，未自动放行；报告见 `test-results/ci/license-report.json`。
- 工具链版本唯一来源：`patmail-extension/package.json` 的 `packageManager` 与 `engines`（Node `^20.19.0 || >=22.12.0`），CI 用 Corepack 按此锁定 pnpm。

## 2. 密钥与敏感信息扫描

实现：`scripts/scan-secrets.mjs`（自研、仓库内可审计，规则按风险分层）。

```bash
pnpm scan:secrets              # 工作树扫描（PR 门禁，快）
pnpm scan:secrets --history    # 全部 Git 历史补丁（一次性审计 / 定期安全任务）
pnpm scan:secrets --write-baseline  # 把当前发现登记进例外表（必须人工补 reason）
```

规则分层：

- **error（阻断）**：私钥 PEM 正文、API Key / Token（含 `sk-` 前缀模式）、Cookie / Authorization 头、JWT、禁用文件名（`*.pem`、`credentials.json` 等）。
- **warn（登记）**：业务数据目录（`HAR/`、`DOM/`、`API/`、`UI/`、客户名单 JSON）中的个人信息与敏感业务响应——保留字段结构与测试价值，登记审计记录，不打印正文、不删证据。
- 报告只写**指纹**（内容哈希前缀），绝不写密钥正文。产出 `test-results/ci/secret-scan.json`。

### 2.1 日常扫描与历史审计拆分

历史补丁中的风险**不会**卡死后续每个 PR：

- `ci.yml` 的 `security` Job 只跑工作树扫描 + 许可策略（每次 PR / push）。
- `security.yml`（每周一定时 + push main + 手动）跑 `--history` 全历史扫描与 `pnpm audit`，`fetch-depth: 0` 取完整历史。

### 2.2 已登记历史发现（指纹化管理）

登记表：`ci/secret-allowlist.json`，每条含 `fingerprint` / `rule` / `file` / `reason` / `addedAt` / `expires`。到期未续期自动重新失败。

| 指纹 | 文件 | 风险 | 整改 |
|---|---|---|---|
| `c9bd17c6f3c35fe1` | `src/agent/config.ts` | 历史硬编码 LLM API Key（`sk-…`） | 已改为 `import.meta.env.VITE_*` 注入；Key 吊销/轮换在服务商侧人工操作（不走 CI） |
| `8a036db22e72658f` / `1d15aefff2ed06b8` / `fb52ceaa61cfd72b` | `dist.pem` | 历史 Chrome 扩展签名私钥曾入库 | 已移出工作树并加 `.gitignore`；按约束**不改写 Git 历史、不删除证据**；签名身份轮换作为独立风险处理（不擅改扩展 ID、不在 CI 使用 `dist.pem`） |

## 3. 业务数据泄漏防护

- 差异化策略：抓包 / DOM / API / 客户名单等**不视为天然安全**，按 warn 级扫描生产凭据、客户个人信息、敏感业务响应；如需脱敏旧记录，保留字段结构、数据类型与测试价值，**未经授权不删除原始证据**。
- E2E 证据（trace / 截图 / 日志 / 摘要）在写入报告前统一脱敏：不写 Cookie、Authorization、Session Token、邮件地址明文、客户合同原文与业务敏感请求字段（`tests/e2e/support/report.mjs` 与 `scripts/ci-report.mjs` 只输出状态码、路径与计数）。
- CI 不接触任何 Secret：所有 workflow `permissions: contents: read`，不引用 `secrets.*`，不使用 `pull_request_target`。

## 4. 测试的网络隔离（强制门禁）

- EASY 业务 Origin（`http://183.36.43.66:88` 等）**只允许被 Playwright 路由拦截**（`tests/e2e/support/easy-mock.mjs`），未匹配路由返回 404 并大声告警，绝不透传。
- 不使用真实 EASY 账号 / 生产 Cookie，不发真实发文与审核请求，不连生产库；浏览器 Profile 与扩展目录由 `tests/e2e/support/paths.mjs` 用 `mkdtemp` 隔离，不复用日常 Chrome Profile。
- CI 环境无显示器下用 Persistent Context 加载 MV3 扩展（`tests/e2e/support/browser.mjs`），不假定 `browser.newContext()` 能加载扩展。

## 5. 供应链动作安全

- 第三方 Action 全部锁定完整 Commit SHA（`actions/checkout`、`setup-node`、`setup-python`、`cache`、`upload/download-artifact`），Dependabot 负责升级。
- workflow 级 `permissions: contents: read`，非必要不给 `contents: write`；并发取消只作用于同分支 / 同 PR（`concurrency.group` 含 `github.ref`）。
- 不在 CI 输出未经校验的脚本插值（`${{ github.* }}` 不直接进 `run:` 拼接执行）；制品保留 14–30 天。
