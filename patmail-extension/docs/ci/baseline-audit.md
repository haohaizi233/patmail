# PatMail CI 基线审计（Phase 0）

> 审计时间：2026-10-29。对象：`D:/desktop/project/patmail`（GitHub: haohaizi233/patmail）。
> 本文只记录审计结论与证据，不写方案。执行证据在仓库根 `test-results/baseline-*.log`。

## 1. 当前架构

| 项 | 事实 |
| --- | --- |
| 产品 | Chrome Manifest V3 扩展（Vue 3 + TypeScript + Vite + pnpm） |
| 主工程 | `patmail-extension/`（仓库根另有 `HAR/ DOM/ API/ UI/ public/` 业务数据与抓包证据目录） |
| 版本 | `patmail-extension/package.json` = `manifest.json` = 1.6.1 |
| Node | engines `^20.19.0 \|\| >=22.12.0`；packageManager 锁 `pnpm@12.16.1` |
| 构建 | `vue-tsc --noEmit && vite build && vite build --config vite.content.config.ts`（两段构建，content 段清空并重写 dist） |
| 运行时 | MV3 Service Worker（`background.js`, module）+ content script（`content.js`）+ 面板（closed shadow） |
| 数据面 | chrome.storage.local、IndexedDB（下载账本/WAL）、原生浏览器下载 + ZIP 流式封存（@zip.js/zip.js）、sql.js（wasm） |
| 遗留面 | Python 桥接 `scripts/stream-download-bridge.py`（127.0.0.1:42843，旧下载协议）；交付产物明确不得依赖它（E2E 断言 `dist/local-download` 不存在） |

## 2. 质量工具（审计时点）

| 工具 | 状态 | 证据 |
| --- | --- | --- |
| vue-tsc / tsc | 已有（`pnpm typecheck`） | baseline-typecheck.log：通过 |
| Vitest 4.1.11 + jsdom | 已有（`pnpm test` 等） | baseline-test.log |
| Playwright 1.58（chromium persistent context） | 已有（tests/e2e/） | tests/e2e/support/browser.mjs |
| ESLint 9 Flat Config + 棘轮 | 本次建设新增 | `eslint.config.js`、`scripts/eslint-ratchet.mjs`、`ci/eslint-baseline.json` |
| Prettier | 本次建设新增 | `.prettierrc.json`、`.prettierignore` |
| Manifest/产物/密钥/许可/可复现校验 | 本次建设新增 | `scripts/verify-*.mjs`、`scripts/scan-secrets.mjs`、`scripts/license-check.mjs` |
| GitHub Actions | 本次建设新增 | `.github/workflows/`（ci / e2e / security / release-check）+ dependabot |

## 3. 测试拓扑（审计统计）

| 层级 | 文件数 | 用例数 | 入口 |
| --- | ---: | ---: | --- |
| Unit | 129（tests/unit/**.test.ts） | — | `pnpm test:unit` |
| Integration | 11（tests/integration/**） | — | `pnpm test:integration` |
| Regression | 17（tests/regression/**） | — | `pnpm test:regression` |
| 合计（`pnpm test` 单次执行） | 157 文件 | **991 用例全绿**（121.16s） | `pnpm test` |
| E2E（Node） | 13 个 `tests/e2e/*.e2e.mjs` | — | `pnpm test:e2e:*` |
| Python 桥接单测 | 2 个 `tests/*bridge_test.py` | — | `pnpm test:stream-bridge` |

### `test:all` / `test:e2e` 与独立脚本的关系（重点调查结论）

- `test:e2e` = extension + limit-query + download + native-browser-download + file-pages 五连（默认入口）；
- `test:all` = `pnpm test` + 上述五连；
- **未进默认入口**：stream-download、durable-download（依赖 Python 桥接 + `python`）、download-editor、browser-download-store、native-stream-lifetime、resume-protocol、docs、browser-download。
- 不串行全跑的依据：stream-download / durable-download 需要 Python 桥接进程（`tests/e2e/support/stream-bridge.mjs` 管理生命周期）与 `python` 命令做 ZIP 校验，资源消耗大（81 文件批量下载、断点续传），与纯浏览器场景隔离要求不同。本次建设以 `scripts/run-e2e.mjs` 的 **smoke / full / legacy** 三分组落地（见 `docs/ci/e2e-matrix.md`），串行执行 + 每脚本独立扩展副本（mkdtemp）+ 独立下载目录 + 动态端口。

## 4. 基线执行记录（改动前 / 收口时复核）

| 命令 | 退出码 | 证据 | 说明 |
| --- | --- | --- | --- |
| `pnpm install --frozen-lockfile` | 0 | — | 新增 devDeps 后锁文件同步更新，CI 用 frozen 安装 |
| `pnpm typecheck` | 0 | baseline-typecheck.log | 全量通过 |
| `pnpm test` | 0 | baseline-test.log | 157 文件 / 991 用例 / 121s 全绿 |
| `pnpm build` | 0 | baseline-build.log | 双段构建成功（content.js 2.0MB、app.js 1.8MB） |
| E2E extension / limit-query | **1** | baseline-e2e-*.log、rerun-e2e-*.log | 见下 |

### E2E 基线失败（历史问题，如实登记）

1. baseline 阶段：`extension.e2e.mjs` 等待面板可见超时（`patmail-root .panel` 30s）；`limit-query.e2e.mjs` 等待“共 1 条”超时。
2. 重跑阶段（工作区含未提交业务改动）：`extension.e2e.mjs` 断言 `118 !== 116`（文件搜索行数，与 `src/assets/sme-customers.json` 客户数据量相关）；`limit-query.e2e.mjs` 报 4 个资源 404。
3. 归因：工作区存在**未提交的业务改动**（客户名单数据、injector closed shadow、cute-scroll、style），测试期望与数据量未同步；**不属于 CI 建设引入**。处置见 `docs/ci/acceptance-report.md`“失败与阻断项”。

## 5. 运行限制

- 无头 Chromium 下加载 MV3 扩展必须用 `chromium.launchPersistentContext` + `--load-extension`（tests/e2e/support/browser.mjs）；普通 `browser.newContext()` 不加载扩展。
- 生产注入器用 closed shadow，自动化在扩展隔离世界里把 `attachShadow` 临时改为 open（`openPanelShadow`），产品代码不动（契约由 `tests/unit/content/injector.test.ts` 守住）。
- Windows 开发机用 bsdtar（系统 tar）打 zip；Linux Runner 用 `TAR=bsdtar`（release-check 安装 libarchive-tools）。
- EASY 全部由本地代理/Route 拦截响应（`tests/e2e/support/easy-mock.mjs`），不触达真实服务器；不使用真实账号、Cookie、生产数据库。

## 6. 风险清单（按优先级）

| # | 风险 | 证据 | 治理 |
| --- | --- | --- | --- |
| 1 | 历史签名私钥 `patmail-extension/dist.pem` 曾入库（3 个提交），现移出并 .gitignore | `pnpm scan:secrets:history`，指纹 8a036db2/1d15aeff/fb52ceaa | 指纹登记 `ci/secret-allowlist.json`（expires 2027-04-27）；签名身份轮换为**独立风险建议**，不擅改扩展 ID |
| 2 | 历史硬编码 LLM API Key（`sk-…`）曾在 `src/agent/config.ts` | 指纹 c9bd17c6f3c35fe1 | 已改 `VITE_*` 环境注入；建议服务商侧吊销（本地人工操作）；同上登记 |
| 3 | 抓包证据目录含 Cookie/PII（`HAR/2026-10-28/cookies.txt` 等） | 工作树扫描 warn 记录 | 差异化策略：凭据 error、PII warn 登记；脱敏需授权，不删证据 |
| 4 | 业务 Origin 全部是明文 HTTP（`http://183.36.43.66:88` 等）+ 本地调试面 `127.0.0.1/localhost` | `pnpm verify:manifest` 审计记录 | 登记在案；无迁移方案不强制 https（约束 4/5） |
| 5 | ESLint 历史存量 681 errors / 25 warnings（63 文件）；2026-11-14 已清零为 0/0 | `ci/eslint-baseline.json` | 棘轮冻结：新代码不得增加；危险规则（浮空 Promise 等）0 容忍；清零与豁免说明见 `docs/ci/quality-gates.md` |
| 6 | E2E 基线与未提交业务数据不同步（118 vs 116、404） | baseline/rerun e2e 日志 | 属业务改动范畴，见 acceptance-report“阻断项”；CI 门禁会如实拦下 |
| 7 | 覆盖率此前无基线 | 本次采集 | 防退化基线 `ci/coverage-baseline.json`（首次 `--coverage-gate` 自动落盘） |
