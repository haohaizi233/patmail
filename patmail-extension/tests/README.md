# 测试工程说明

本目录按测试职责分层组织。所有 `*.test.ts` 由 Vitest 收集（见 `vitest.config.ts`，`environment: 'jsdom'`，`setupFiles: tests/setup/vitest-setup.ts`）；浏览器端到端脚本是 `tests/e2e/*.e2e.mjs`，用 Node + Playwright 直接运行，不经过 Vitest。

## 目录职责

```text
tests/
├── unit/                  单模块行为测试，依赖用 mock/假实现，不跨子系统装配
│   ├── agent/             AI 助手：规划、记忆、工具、LLM 调用、会话、追踪
│   ├── api/               请求参数构造、响应标准化、消息契约、字典读取
│   ├── automation/        任务执行、期限监控、文件管理工作流、只读策略、WAL 账本
│   ├── content/           内容脚本：DOM 扫描、语义解析、悬浮宿主注入
│   ├── customer/          客户与案件：名单、资料页、案件字段仲裁与联系人
│   ├── filing/            递交管理：查询、分页、导出、模板
│   ├── mail/              发文：规则、分组、签名、收发件人、期限发文提交
│   ├── pct/               PCT 专案：表格、工作簿、联系人、审核状态
│   ├── query/             查询模板、查询入口、选项树、字段标签、表单校验
│   ├── ui/                界面与展示：日期选择器、主题、Mermaid、首页、进度
│   └── workflow/          工作流目录、规划、预览、写开关
├── integration/           跨子系统装配的测试（真实服务类 + mock fetch/存储）
│   ├── easy/              EASY 传输、会话、运行时、查询模板传输、完整页面消息链
│   ├── background/        后台工作区消息、账号/客户模式切换
│   └── packaging/         打包与交付安全（校验 scripts/ 打包脚本产物）
├── regression/phases/     历史阶段回归（见该目录 README.md）
├── e2e/                   浏览器端到端脚本与支撑模块
│   ├── scenarios/         extension.e2e.mjs 的场景模块
│   └── support/           路径解析、fixture 服务、EASY mock、浏览器生命周期、产物输出
├── factories/             测试数据工厂（可复用的构造函数，支持 Partial 覆盖）
├── helpers/               测试基础设施（项目路径解析等）
├── setup/                 Vitest 全局 setup（jsdom 补丁等）
└── fixtures/              静态夹具（page.html 等）
```

每个 `unit/<模块>/support/`、`unit/<模块>/support/*.ts` 是该模块测试专用的共享脚手架，Vitest 只收集 `*.test.ts`，不会把它们当测试运行。

## 命名约定

- 测试文件：`<被测对象>.test.ts`，被测对象优先用 `src/` 里的模块名（如 `mail-process.test.ts` 对应 `src/api/mail-process.ts`）。
- 一个文件测多个行为时，用 `describe('模块或行为契约')` 分组，`it('输入条件 + 预期行为')` 描述用例；中文描述可以保留。
- 拆分出来的同域文件用行为后缀区分，例如 `limit-mail-submit-guards.test.ts`（提交门禁）、`limit-mail-submit-batch.test.ts`（批量提交）。
- 共享脚手架：`support/`（仅单模块使用）或 `tests/factories/`（跨模块使用）。
- 引用生产源码一律用相对路径，按文件深度写 `../../../src/...`；读取项目内文件（manifest、源码文本、外部 API 文档）用 `tests/helpers/project.ts` 的 `projectPath` / `srcPath` / `apiDocsPath`，不要用 `process.cwd()` 或按自身目录层级推算。

## 运行测试

在 `patmail-extension/` 目录下：

```bash
npm test                      # 全部 Vitest 测试（unit + integration + regression）
npm run test:unit             # 仅 tests/unit
npm run test:integration      # 仅 tests/integration
npm run test:regression       # 仅 tests/regression
npx vitest run tests/unit/mail                # 按目录
npx vitest run tests/unit/mail/mailset.test.ts # 单个文件
npx vitest run -t "发文密送"                    # 按用例名过滤
npm run test:all              # Vitest 全量 + 浏览器 E2E（extension + limit-query + download）
```

## 浏览器 E2E

```bash
npm run test:e2e          # extension、limit-query、download 三个浏览器脚本
npm run test:e2e:download # HTTP 页面打包、后台消息、浏览器下载记录及磁盘文件校验
npm run test:e2e:download-editor # 选择五段模板、修改固定字符，核验GetFileName收到完整当前配方
npm run test:e2e:files    # 1597条文件全选：100条分页、复用已读页、六路在途、选中数量和完成提示
npm run test:e2e:limits   # 期限监控流程
npm run test:e2e:docs     # 文档 / Mermaid 展示
```

环境依赖：

- 需要 Playwright Chromium（`npx playwright install chromium`）。
- 需要先构建扩展：`npm run build`（E2E 从 `dist/` 加载；也可用 `PATMAIL_TEST_DIST=<目录>` 指定其它构建产物）。
- E2E 会在本地起 fixture 服务并拦截 `http://183.36.43.66:88/**`（EASY 业务地址）：所有业务请求都被 mock，脚本不允许、也不会访问真实业务服务器。
- 下载脚本通过本地 HTTP 代理响应所有浏览器请求，代理从不转发到真实服务器。使用非 localhost 的 HTTP 页面，保留 `crypto.randomUUID` 不可用的真实条件，并校验 `chrome.downloads` 完成状态和落盘字节。
- 下载回归以141个文件触发2批命名（一批100个），故意让批次乱序返回，逐项校验编号与名称对应，只提交一次压缩请求，并检查命名、压缩、交给浏览器和浏览器下载四个进度阶段；最终结果带浏览器下载完成终态和落盘字节。
- v1.4.5下载回归先确认短受理，再独立接收最终结果；夹具分块发送打包JSON，验证响应字节持续增长，最后仍由浏览器直接取包落盘。长时间准备另用假时钟覆盖6分钟首字节等待、7分钟响应流和超过30分钟的任务状态续期，不让测试真的等待半小时。
- 文件全选脚本从工作台真实按钮进入，保留后台、内容脚本及查询来源记录；拦截全部外部 HTTP 请求。1597条夹具先查询100条，再确认只补读15页、同时在途峰值为6、1597个不同文件全部选中。
- 文件全选夹具包含原站折叠后的文件条件行；校对字段后四个主条件仍可见，全选完成超过旧版2秒自动清除期限后，彩虹条仍保留完成状态。
- 截图与产物写入 `<项目根>/test-results/`（已在 .gitignore 中忽略）。

## 新增 Fixture / Mock / Factory

- `tests/fixtures/`：静态文件（HTML 夹具、样例数据文件）。
- `tests/factories/`：纯数据构造函数，签名形如 `xxx(overrides: Partial<T> = {})`，每次返回全新对象，不共享可变引用；默认值取自现有测试中的常见取值，调用点用 override 还原自己的数据。
- `tests/unit/<模块>/support/` 或 `tests/integration/**` 内的局部 mock：只被一个模块用到的行为假实现（假 fetch、假存储、假计时）放这里或直接放测试文件内；只用一次且很短的局部 mock 不要强行抽象。
- mock 不得静默吞掉生产错误（不要用空 catch 或无条件返回成功的假实现掩盖失败路径）。
- 网络一律走注入的 `fetcher` 或 `vi.stubGlobal('fetch', ...)`，并在用例内还原（`vi.unstubAllGlobals()`）；禁止真实网络写操作。

## Phase 历史测试（regression/phases）

`tests/regression/phases/` 保存各开发阶段沉淀的业务契约与回归断言，文件名保留阶段编号以便对照 `docs/phase*-*.md` 历史报告。维护方法、逐文件语义清单和迁移映射见 `tests/regression/phases/README.md`。

要点：

- 这些文件大多是跨模块场景，属于回归层，不要按文件名猜它是单元测试。
- 新增的跨模块回归场景放这里；如果某个 describe 的职责已经完全落在一个稳定业务模块内，可以迁到 `tests/unit/<模块>/`，迁移时在 `tests/regression/phases/README.md` 记录旧路径。

## 迁移映射

本次目录重构的「原路径 → 新路径」全量映射、拆分明细与其它调整见 `tests/MIGRATION.md`。
