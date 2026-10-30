# 本地复现（与 CI 同口径）

所有命令在 `patmail-extension/` 下执行（Windows PowerShell / Linux bash 均可）。
CI 使用的命令与本地完全一致：`.github/workflows/*.yml` 只是把 `scripts/ci-check.mjs --steps …`
分发到并行 Job，不在 workflow 里另写检查逻辑。

## 1. 环境要求

| 依赖 | 版本 | 来源 |
|---|---|---|
| Node.js | `^20.19.0 \|\| >=22.12.0` | `package.json` `engines`（CI 用 Node 22 LTS） |
| pnpm | `package.json` `packageManager` 锁定 | `corepack enable` 后自动按该版本 |
| Chromium | Playwright 自带 | `npx playwright install --with-deps chromium` |
| Python | 3.x（仅 legacy 组：ZIP 校验 / 旧桥接协议） | 系统安装，缺失时 legacy 组记 BLOCKED |

```bash
corepack enable
pnpm install --frozen-lockfile     # CI 不允许改写锁文件，本地同口径
npx playwright install --with-deps chromium
pnpm build                          # e2e 前必须有 dist/（run-e2e.mjs 会校验）
```

## 2. 门禁命令（与 CI 一一对应）

```bash
pnpm typecheck          # vue-tsc 静态类型检查
pnpm lint               # ESLint 基线棘轮（scripts/eslint-ratchet.mjs）
pnpm lint:eslint        # ESLint 全量输出（不限基线，供治理用）
pnpm format:check       # Prettier 检查（.prettierignore 已排除产物/数据/历史 JS）
pnpm test:unit          # 单元测试
pnpm test:integration   # 集成测试
pnpm test:regression    # 历史业务契约回归
pnpm test               # 以上三层全量（vitest run）
pnpm test:coverage      # 覆盖率（text/json/lcov/html → test-results/coverage/）
pnpm build              # 构建（vue-tsc + vite 双段）
pnpm verify:manifest    # Manifest V3 合规校验
pnpm verify:dist        # 构建产物完整性与交付安全校验
pnpm verify:repro       # 两次独立构建比对 Hash（可复现性）
pnpm scan:secrets       # 密钥扫描（工作树）
pnpm scan:secrets:history  # 密钥扫描（全部 Git 历史补丁）
pnpm licenses:check     # 直接依赖许可策略
pnpm audit:deps         # pnpm audit（prod，high+ 失败）
pnpm ci:report          # 汇总 CI 报告（summary.json / summary.md）
pnpm ci:check           # 以上全部门禁串行入口（统一退出码）
pnpm release:check      # 发布前校验（版本一致性 / SHA-256 / 产物命名）
```

`pnpm ci:check --list` 列出全部步骤；`pnpm ci:check --steps unit,integration` 只跑指定步骤
（GitHub Actions 就是这样把步骤拆到并行 Job 的）。每步结果落 `test-results/ci/steps/<name>.json`。

## 3. E2E 分组

```bash
pnpm test:e2e:smoke     # PR 门禁：extension + limits（快、离线、稳定）
pnpm test:e2e:full      # main/手动：smoke + workspace + 下载/ZIP/取消/续传/分页/故障注入
pnpm test:e2e:legacy    # 旧 Python 桥接下载协议兼容 + 桥接单测（需 python）
node scripts/run-e2e.mjs <suite>   # 单跑一个场景，如 workspace / download / browser-download
node scripts/run-e2e.mjs smoke --bail   # 首败即停
```

隔离保障（每个 `*.e2e.mjs` 独立进程）：

- 扩展目录与下载目录由 `tests/e2e/support/paths.mjs` 用 `mkdtemp` 生成，互不共享；
- 端口全部 `listen(0)` 动态分配，无固定端口冲突；
- EASY 业务 Origin 由 `tests/e2e/support/easy-mock.mjs` 全量路由拦截，未匹配路由 404 + 大声告警；
- 浏览器 Profile 为测试专用临时目录，不复用日常 Chrome Profile。

## 4. 产物与报告布局（`test-results/`，不入库）

```text
test-results/
├── ci/            # summary.json / summary.md / artifact-manifest.json / steps/ / e2e-*.json
├── coverage/      # 覆盖率（text/json/lcov/html）
├── junit/         # Vitest JUnit XML
└── playwright/    # 失败证据（截图、脱敏日志）
```

## 5. Windows 与 Linux 差异

- 脚本全部走 `node`，不依赖 shell 特性；`cmd /c` 与 bash 均可执行。
- 打包脚本用 `TAR` 环境变量选择归档工具（Linux CI 用 `bsdtar`，Windows 用自带 tar）。
- Git 换行符警告（LF→CRLF）不影响执行；仓库内脚本统一 LF。
- legacy 组需要 `python` 命令在 PATH；缺失时 `run-e2e.mjs` 记 BLOCKED 并以非零退出，不算通过。

## 6. 反向验收（验证门禁真的拦得住）

在临时副本里注入故障，确认对应命令以非零退出后恢复：

| 注入 | 应失败的入口 |
|---|---|
| 任意 `.ts` 类型错误 | `pnpm typecheck` |
| 新增未使用变量 | `pnpm lint`（超出基线） |
| 缩进/引号格式错误 | `pnpm format:check` |
| 改坏一个断言 | `pnpm test:unit` |
| 删除 `dist` 里 Manifest 引用的入口 | `pnpm verify:manifest` / `pnpm verify:dist` |
| 在测试夹具放假凭据（如 `AKIA…`、`-----BEGIN RSA PRIVATE KEY-----`） | `pnpm scan:secrets` |
| 篡改 `dist` 任一字节 | `node scripts/verify-dist.mjs --against test-results/ci/artifact-manifest.json`（与留档 SHA-256 清单比对，不一致即失败） |
