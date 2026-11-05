# CI 架构（Phase 6 / Phase 8）

## 1. 分层与触发

| 层 | Workflow | 触发 | 内容 |
| --- | --- | --- | --- |
| **Fast Gate** | `.github/workflows/ci.yml` | PR、push main、手动 | 静态检查、单测/集成、回归、密钥+许可扫描、构建与产物校验、E2E Smoke、CI Gate |
| **Full Gate** | `.github/workflows/e2e.yml` | push main、手动 | Full E2E（下载/取消/续传/故障注入）、Legacy 桥接兼容、覆盖率、构建可复现性、Full Gate |
| **Scheduled Security** | `.github/workflows/security.yml` | 每周一 03:23 UTC、手动、push main | 工作树+Git 历史密钥扫描、pnpm audit、许可策略 |
| **Release Check** | `.github/workflows/release-check.yml` | 手动、tag `v*` | 版本一致性、可复现构建、产物安全、E2E Smoke、打包归档、SHA-256 清单 |

## 2. Job 依赖（ci.yml）

```text
                Pull Request / Push
                         |
        +----------------+----------------+
        |                |                |
   Static Checks   Unit & Integration   Regression     Security
        |                |                |             |
        +----------------+----------------+             |
                         |                              |
              Build & Artifact Verification <───────────┘（并行，无硬依赖）
                         |
                     E2E Smoke
                         |
                      CI Gate（if: always()，汇总门禁）
```

说明：Security 与构建/E2E 并行；`CI Gate` 汇总所有 Job 结果与报告，任一 Job 非 success 或报告出现 FAIL/BLOCKED 即失败。E2E Full 的 `Full Gate` 同构。

## 3. 复用的本地能力（不重复造轮子）

| 能力 | 实现 | Workflow 消费方式 |
| --- | --- | --- |
| 工具链安装 | `.github/actions/setup-patmail`（pnpm 锁 packageManager，Node 22，`pnpm install --frozen-lockfile`） | 所有 Job 首步 |
| 统一门禁 | `scripts/ci-check.mjs --steps a,b,c` | 每个 Job 只跑自己的步骤，结果写 `test-results/ci/steps/<name>.json` |
| E2E 分组 | `scripts/run-e2e.mjs smoke\|full\|legacy` | E2E Job |
| 报告汇总 | `scripts/ci-report.mjs [--gate] [--coverage-gate]` | Gate Job / Coverage Job |
| 隔离执行 | `tests/e2e/support/paths.mjs`（mkdtemp 扩展副本 + 独立下载目录）、动态端口、`easy-mock.mjs` 路由拦截 | 全部 E2E |
| 打包归档 | `scripts/pack-source.mjs` / `pack-delivery.mjs` / `verify-archive.mjs`（`TAR=bsdtar`） | release-check |

## 4. 权限与安全（Action 层）

- 所有 Workflow `permissions: contents: read`；不使用 `pull_request_target`；不向 PR 传递任何 Secret。
- 第三方 Action 全部锁 **完整 Commit SHA**（注释标注对应 tag）：checkout v5、setup-node v5、pnpm/action-setup v5.0.0、setup-python v5、upload/download-artifact v5、cache v4。
- `concurrency` 按 `workflow + ref` 分组，`cancel-in-progress: true`（release-check 除外，避免取消发布校验）；只影响同分支/同 PR。
- 制品保留：常规报告 14 天，安全与发布制品 30 天。

## 5. 缓存

| 缓存 | Key | 说明 |
| --- | --- | --- |
| pnpm store | `actions/setup-node` 内置（`cache: pnpm` + lockfile hash） | OS + Node + `patmail-extension/pnpm-lock.yaml` 参与 key |
| Playwright Chromium | `~/.cache/ms-playwright`，key `playwright-{os}-{lockfile hash}` | 浏览器版本随 playwright 锁定；缓存键含 lockfile hash |
| **不缓存** | 浏览器 Profile、下载目录、IndexedDB、任何凭据/配置 | 每次 E2E 全新 mkdtemp |

## 6. 报告产物布局

```text
patmail-extension/test-results/
├── ci/
│   ├── summary.json / summary.md      # ci:report 汇总（Gate 判据）
│   ├── artifact-manifest.json         # 构建产物 SHA-256 清单（verify:dist）
│   ├── ci-check.json + steps/*.json   # 各门禁步骤执行记录
│   ├── eslint.json                    # ESLint JSON 报告
│   ├── manifest-report.json           # MV3 合规审计记录
│   ├── dist-report.json               # 产物校验
│   ├── repro-report.json              # 双构建比对
│   ├── secret-scan.json               # 密钥扫描（仅指纹）
│   ├── license-report.json            # 许可策略
│   ├── e2e-{smoke,full,legacy}.json   # E2E 分组结果
│   └── release-report.json            # 发布前校验
├── junit/{unit,integration,regression}.xml
├── coverage/                          # text/json/json-summary/html/lcov
└── extension-*/                       # E2E 隔离扩展副本（不入 Git）
```

`test-results/` 由 `.gitignore`（仓库根与 patmail-extension）排除，不进入提交。

普通 CI / E2E 显式设置 `SME_SNAPSHOT_STUB=1`，允许无客户数据的检出生成、校验空占位快照。`GITHUB_ACTIONS` 本身不提供豁免。
Release Check 设置 `SME_SNAPSHOT_STUB=0`，需要先提供真实客户快照；`pack:delivery` 和 `release:check` 始终调用 `verify-dist.mjs --delivery`，即使环境设置了占位豁免，也拒绝空名单。

## 7. 报告口径（Phase 10）

`summary.md` 固定包含：Commit、Branch、Node、pnpm、Chromium、Typecheck、Lint、Unit、Integration、Regression、E2E、Coverage、Build、Security、Artifacts、Duration。
状态口径：**PASS**=已执行且通过；**FAIL**=已执行且失败；**NOT RUN**=本次未执行（绝不显示为 PASS）；**BLOCKED**=前置条件缺失被阻断。
