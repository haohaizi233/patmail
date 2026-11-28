# PatMail 工程工具链

这里维护扩展的构建、验证、CI、打包和本机诊断脚本。[资产盘点和逐文件迁移表](asset-inventory.md) 记录调用方、输入、输出和副作用。[迁移验收报告](../../docs/toolchain-refactor.md) 记录基线和验证结果。

## 目录

| 目录 | 职责 |
|---|---|
| `architecture/` | 应用架构检查和工具链目录、引用、依赖检查 |
| `build/` | 构建快照准备、Manifest、产物和可复现构建 |
| `ci/` | 步骤编排、报告汇总、E2E 分组及预检 |
| `quality/`、`security/` | ESLint 棘轮和豁免、密钥扫描、许可证检查 |
| `release/` | 源码与交付归档、交付路径规则、发布前校验 |
| `docs/` | 文档链接、目录治理及审计 |
| `cdp/` | 原生 CDP 观察服务及 CLI |
| `hague/` | 海牙诊断、受限 Worker 研究、性能基准 |
| `download/` | 本机 Python / PowerShell 桥接、下载实验、现场只读诊断 |
| `data/`、`graphics/` | 客户快照生成、三维图标生成 |
| `shared/` | 工具链共用的路径定位 |

## 稳定入口

以下命令从扩展目录运行。仓库根目录也保留原有 `pnpm build` 和 `pnpm cdp:start|status|stop`。

| 命令 | 用途 | 对应入口 |
|---|---|---|
| `pnpm build` | 开发构建并启动或复用本机观察服务 | [快照](build/ensure-sme-snapshot.mjs)、[CDP CLI](cdp/cdp-observer.mjs) |
| `pnpm build:ci` | 隔离构建 | [快照](build/ensure-sme-snapshot.mjs) |
| `pnpm architecture:check` | 应用架构和工具链门禁 | [应用架构](architecture/architecture-check.mjs)、[工具链布局](architecture/scripts-layout-check.mjs) |
| `pnpm lint` | ESLint 质量门禁 | [棘轮](quality/eslint-ratchet.mjs) |
| `pnpm ci:check` | CI 步骤编排 | [步骤入口](ci/ci-check.mjs) |
| `pnpm test:e2e:full` | 全量浏览器 E2E | [E2E 执行器](ci/run-e2e.mjs) |
| `pnpm cdp:start` | 启动或复用本机浏览器观察服务 | [CDP CLI](cdp/cdp-observer.mjs) |
| `pnpm release:check` | 发布前验收 | [发布检查](release/release-check.mjs) |

## 路径和跨语言运行

Node 工具通过 [共享路径](shared/paths.mjs) 找到仓库根、扩展、源码、报告和资源目录。程序内传给子进程的是绝对脚本路径，并按各自协议指定 cwd。用户传入的输入文件或输出目录仍按调用者 cwd 解析。发布报告继续写入扩展的 `test-results/ci`，归档继续写入 `test-results/delivery`。

根 `public/` 与扩展 `public/` 分开维护。客户快照继续进入根目录的 public 和扩展的源码资源。图标生成继续默认写入扩展的 `public/assets/workflow-ocean`。验证生成器时可传临时输出目录。已提交图标的 manifest 仍记录当时的生成路径。

CDP 后台进程继续以原生 WebSocket 工作，本机锁和日志位于仓库 `log/cdp`。海牙分析 Worker 使用文件 URL 和原有内存上限。普通开发构建会启动观察服务。CI 如需无真实数据构建，按原规则显式设置 `SME_SNAPSHOT_STUB=1`。

Python 和 PowerShell 下载桥接在 [下载桥接](download/bridge/stream-download-bridge.py) 内。PowerShell 从自身目录定位 Python 文件，继续隐藏启动子进程。既有 Windows 计划任务可继续调用旧绝对路径。两份根目录兼容文件只转发，新任务应使用规范位置。迁移既有任务时先在任务计划程序确认当前操作，再把脚本路径改为新路径。本次不修改任何已注册任务。兼容入口保留到已部署任务完成迁移，暂未指定移除版本。

`pnpm live:readonly` 对应实现曾在 `f933b3c` 移除，当前命令依旧缺失实现。另有两个需要授权环境的独立只读审计工具，见 [命名审计](download/audits/live-download-name-editor-audit.mjs)和[分页审计](download/audits/live-file-pagination-audit.mjs)。

## 新增脚本

为脚本指定职责域和 CLI、Library、Worker 或 Bridge 身份。根目录保留说明、资产盘点与必要的历史转发。将类型声明放在实现旁边。复用共享根路径，保持输入输出及退出码明确。遵循域内依赖优先，共享层只引用 Node 内建模块。增加测试和操作说明时，记录需要访问的本机进程、外部连接和生成文件。
