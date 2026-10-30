# 排障（CI 与本地门禁常见失败）

按症状索引。所有日志在 `test-results/`（`test-results/ci/` 为结构化报告）。

## E2E

| 症状 | 原因 | 处理 |
|---|---|---|
| `[easy-mock] fixture route not found: /AjaxServers/….ashx Call=…` + 浏览器 404 | 夹具缺该只读接口路由；脚手架故意 404 并大声告警，防止悄悄透传真实 EASY | 按 `Call=` 名称在 `tests/e2e/support/easy-mock.mjs` 的 `readOnlyFanout` 补**合法空响应**（字典字段显式给 `null`，否则适配器记 `invalid` 会让字典缓存反复重取）；禁止改成放行真实网络 |
| `extension.e2e.mjs` 末尾 `browser errors: … 404` | 同上，场景断言要求零 console 错误 | 补夹具路由；不要放宽断言 |
| `dist/ 不存在，先执行 pnpm build` | e2e 加载的是构建产物 | 先 `pnpm build` |
| Playwright 启动失败 / 找不到 Chromium | 浏览器未安装或版本与 lockfile 不匹配 | `npx playwright install --with-deps chromium` |
| workspace 场景报红（导航/绑定/生成计划等断言） | **已知红**：历史 UI 契约漂移（详见 `e2e-matrix.md` 与 `acceptance-report.md`），非环境问题 | 按 `e2e-matrix.md` 的整改计划推进；不要删断言或加 skip |
| legacy 组 `E2E 前置条件不满足，记为 BLOCKED` | 缺 `python` 命令或 `tests/stream-download-bridge.py` | 安装 Python 3；BLOCKED 不等于通过 |
| 端口/目录互扰 | 不应发生：每脚本独立进程 + `mkdtemp` + `listen(0)` | 检查是否有自改脚本共用了固定端口/固定临时目录 |

## 静态检查

| 症状 | 原因 | 处理 |
|---|---|---|
| `pnpm lint` 报超基线 | 新代码引入 ESLint 问题（基线棘轮只许减不许增） | 修掉新增项；确实要长期登记的，先治理再进基线（人工评审） |
| `pnpm format:check` 失败 | 新文件不在 `.prettierignore` 白名单内且未格式化 | `pnpm format:write`；历史业务源码不强改（已排除） |
| `vue-tsc` 报错但 `vite build` 能过 | Vite 不做类型检查 | 以 `pnpm typecheck` 为准 |

## 测试与覆盖率

| 症状 | 原因 | 处理 |
|---|---|---|
| `vitest` 偶发超时 | 机器负载（e2e 与 vitest 并行时） | 分开跑；CI 里本来就是独立 Job |
| `test:coverage --coverage-gate` 不过 | 覆盖率低于 `ci/coverage-baseline.json` 登记的基线 | 补测试；禁止删排除业务模块来抬数字 |
| JUnit 报告缺失 | 用 `pnpm test:unit` 等 ci-check 步骤入口（带 `--reporter=junit`） | 直接裸跑 `vitest` 不产 JUnit |

## 安全扫描

| 症状 | 原因 | 处理 |
|---|---|---|
| `scan:secrets` 报 error | 工作树出现密钥形态内容或禁用文件名（`*.pem`、`credentials.json`） | 移除/改注入；不要把正文写进 issue 或报告 |
| `scan:secrets --history` 报历史发现 | 历史补丁里的旧风险 | 逐条按指纹登记 `ci/secret-allowlist.json`（`reason` + `expires`），到期未续期自动重新失败 |
| 例外到期重新失败 | `expires` 过期 | 复审后续期或完成整改后删除条目 |
| `licenses:check` 失败 | 直接依赖许可不在 `ci/license-policy.json` 白名单 | 换包或登记 `exceptions`（必须带 reason/expires） |

## 构建与产物

| 症状 | 原因 | 处理 |
|---|---|---|
| `verify:manifest` 失败 | Manifest 引用的入口缺失 / CSP / 权限口径变化 | 按报告条目修复；HTTP 业务 Origin 不得无迁移方案强改 HTTPS |
| `verify:dist` 失败 | 产物混入测试夹具、密钥、Node 运行时依赖，或关键资源缺失 | 对照 `test-results/ci/artifact-manifest.json` 定位 |
| `verify:repro` 两次 Hash 不一致 | 构建非确定性 | 看 `test-results/ci/repro-report.json` 找差异文件；不得删输出强行一致 |

## GitHub Actions

| 症状 | 原因 | 处理 |
|---|---|---|
| Actions 页看不到 workflow | 仓库 Actions 服务被禁用 | 仓库 Settings → Actions → General → 允许 Actions（workflow 文件在仓库根 `.github/workflows/`，不属于 `patmail-extension/`） |
| workflow 不触发 | 触发条件：PR / push main / `workflow_dispatch`（security.yml 另有每周一定时） | 用 Actions 页 Run workflow 手动触发 |
| Job 飘红但测试日志全绿 | 汇总门禁 `CI Gate` / `Full Gate` 核对 `needs` 结果 | 看 Gate 步骤输出的「未通过的 Job」 |
