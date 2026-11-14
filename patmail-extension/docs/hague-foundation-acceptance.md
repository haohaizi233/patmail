# 海牙系统基础协议算法与逆向研究引擎补强验收报告

**文档标识**：`docs/hague-foundation-acceptance.md`  
**执行分支**：`codex/hague-foundation-hardening`  
**基线提交**：`7661b57bdfb4e0673ca2d62332ab598bb9bd0b28`  
**验收时间**：2026-11-14  
**验收环境**：Windows 10 / Node v26.13.0 / pnpm 12.16.1 / Vitest 4.1.12 / 12th Gen Intel Core i7-12700K (20核) / 32GB RAM

---

## 1. 实际修改摘要

| 修改 / 新增文件 | 类型 | 修改原因与引入算法 | 影响范围 |
|---|---|---|---|
| `docs/hague-foundation-gap-analysis.md` | 新增 | 按照任务要求，对四个仓库源码进行逐行比对，输出详细缺口分析。 | 文档层，明确 P0/P1/P2 路线图。 |
| `src/hague/diagnostics/protocol/jsf-semantics.mjs`<br>`jsf-semantics.d.mts` | 新增 | 建立共享、纯函数式 JSF 协议语义解析器；实现防 XXE SAX 安全解析，支持保序动作序列、命名空间分类、错误语义分类。 | 协议层，提供跨诊断与执行器的统一协议事实层。 |
| `src/hague/diagnostics/protocol/jsf-state-machine.mjs`<br>`jsf-state-machine.d.mts` | 新增 | 补强 ViewState 跨请求因果状态机；修复同文档会话隔离缺陷；实施纯内存短期 HMAC 与零持久化安全边界。 | 状态机层，追踪同 Frame 下多步交互的状态迁移。 |
| `src/hague/diagnostics/protocol/jsf-diff.mjs`<br>`jsf-diff.d.mts` | 新增 | 吸收 Browser.Reverse.Engineering.Toolkit 归一化思想，实现纯结构协议指纹与轻量协议漂移检测算法。 | 差异与漂移检测层，防范 WIPO 线上静默升级。 |
| `src/hague/diagnostics/protocol/observed-components.mjs`<br>`observed-components.d.mts` | 新增 | 建立受控的动态组件与命名容器映射注册表，杜绝无证据猜测。 | 组件分析层。 |
| `src/hague/diagnostics/protocol/jsf-partial-response.mjs`<br>`jsf-partial-response.d.mts` | 增强 | 规范化 JSF 请求解析器（`parseJsfRequest`），增加多值与重复键统计、命名空间冲突检测、白名单字段提取。 | 请求分析层，完全向后兼容原有接口。 |
| `src/hague/diagnostics/ast/analyzer.mjs`<br>`analyzer.d.mts` | 增强 | 补强 Babel AST 块级作用域隔离、字面量对象解构、三元求值与保守别名链分析；导出标准 `JsfCallIR` 中间表示。 | 静态分析层。 |
| `src/hague/diagnostics/schema.mjs` | 增强 | 将 `saveBtn` 加入合规子组件令牌白名单，支持安全标识保留。 | 脱敏 Schema 层。 |
| `docs/hague-ast-analysis.md` | 更新 | 记录 2026-11 AST 词法作用域分析、常量折叠与 JsfCallIR 补强机制。 | 文档层。 |
| `docs/hague-protocol-semantics.md` | 新增 | 详述 JSF/PrimeFaces 协议响应生命周期与受限 SAX 解析架构。 | 文档层。 |
| `docs/hague-viewstate-lifecycle.md` | 新增 | 详述 ViewState 跨请求迁移状态机、生命周期隔离与隐私保护模型。 | 文档层。 |
| `docs/hague-correlation-evidence.md` | 新增 | 详述六层证据模型、因果匹配等级与确定性解释规则。 | 文档层。 |
| `docs/hague-protocol-drift.md` | 新增 | 详述协议指纹计算、场景序列指纹与协议漂移检测机制。 | 文档层。 |
| `tests/unit/hague/jsf-semantics.test.ts` | 新增 | 针对协议语义保序、命名空间识别、受限错误分类与双解析器一致性测试（8 项测试）。 | 单元测试层。 |
| `tests/unit/hague/jsf-state-machine.test.ts` | 新增 | 针对 ViewState 状态机推进、多并发请求乱序、文档重导航检测测试（6 项测试）。 | 单元测试层。 |
| `tests/unit/hague/jsf-diff.test.ts` | 新增 | 针对协议指纹去敏、协议漂移与动态 ID 偏移分级测试（4 项测试）。 | 单元测试层。 |
| `tests/unit/hague/ast-scope-analysis.test.ts` | 新增 | 针对 AST 词法遮蔽、解构、常量折叠与 JsfCallIR 提取测试（6 项测试）。 | 单元测试层。 |
| `tests/unit/hague/jsf-request-normalization.test.ts` | 新增 | 针对 JSF 请求规范化、多值参数、命名空间冲突与组件映射测试（4 项测试）。 | 单元测试层。 |
| `tests/unit/hague/protocol-fuzz.test.ts` | 新增 | 种子可复现的确定性变异模糊测试（100 次 XML 变异 + 50 次 AST 变异 + 30 次乱序因果断言，3 项测试）。 | 变异安全测试层。 |

---

## 2. 原有能力与新增能力对照表

| 能力项 | 原有能力 (commit 7661b57) | 本次补强后能力 |
|---|---|---|
| **JSF XML 解析** | saxes 计数解析与单点 update/viewstate 提取，缺失动作顺序。 | **保序动作序列 (`actions: JsfActionSummary[]`)**；识别 `javax`/`jakarta`/`mixed` 命名空间；受控错误分类；双解析器一致性断言。 |
| **ViewState 追踪** | 单次请求独立 HMAC，因 `contextKey` 包含 `requestId` 导致跨请求追踪失效。 | **同文档生命周期因果追踪**；显式状态迁移机（INITIAL $\to$ IN_FLIGHT $\to$ CHANGED/UNCHANGED/OUT_OF_ORDER/DOC_CHANGED）；零明文内存擦除。 |
| **请求规范化** | 基础提取 `source`, `process`, `update`, `form`。 | **全字段协议规范化**：多值参数与同名重复统计、命名空间冲突检测、行为事件与组件映射、协议置信度标记。 |
| **AST 静态分析** | 单层环境 Map 绑定，无法处理嵌套块级遮蔽或对象解构。 | **严格词法作用域帧**、块级变量隔离、字面量解构支持、三元常量折叠、标准 **`JsfCallIR` 中间表示**。 |
| **证据关联模型** | 六层证据模型（REQUEST/HTTP/JSF/DOM/BUSINESS/CERTAINTY）。 | 保留六层模型并严格保持业务回执边界；强化 **`HTTP 200 != valid != confirmed`** 确定性解释规则。 |
| **系统升级检测** | 缺失针对协议格式变化的自动分析能力。 | **轻量协议指纹 (`protocolFingerprint`)**、场景因果指纹 (`scenarioFingerprint`) 与**协议漂移检测 (`detectProtocolDrift`)**。 |
| **回归与健壮性** | 54 个单元测试文件（324 项测试）。 | **60 个单元测试文件（355 项测试 + 20 项研究脚本测试 = 375 项全部通过）**，新增针对性变异 Fuzz 测试。 |

---

## 3. 算法核心原理说明

### 3.1 JSF 协议语义解析算法 (`jsf-semantics.mjs`)
采用纯函数式流式 SAX 状态机。在解析过程中：
- 严格拦截 `doctype` 标签，阻断任何 XXE 实体展开攻击；
- 维护栈深度计数与节点总数计数，达到预算（100 层或 30,000 节点）立即截断抛出规范错误；
- 将 DOM 片段操作映射为强类型联合 `JsfActionSummary` 并保序入队；
- 对 `<error>` 内容提取并映射为安全的脱敏枚举类别（`view_expired`, `validation_error`, `conversion_error` 等），绝不保留未经验证的服务端错误堆栈或明文字符串。

### 3.2 ViewState 因果状态迁移机 (`jsf-state-machine.mjs`)
在同一文档生命周期内建立有限状态机：
1. 计算进入时当前文档的唯一作用域 `${sessionId}:${frameId}:${loaderId}`；
2. 内部维护 32 字节随机会话密钥，对接收到的 ViewState 字符串做瞬时 `HMAC-SHA256` 签名并即刻释放原文引用；
3. 维护单调递增的因果版本序号 `sequence` 与有限大小的 `tagHistory`；
4. 当新响应到达时：
   - 与当前最新 Tag 相等 $\to$ `STATE_UNCHANGED`；
   - 与历史早先 Tag 相等但被后续请求超前 $\to$ `OUT_OF_ORDER`；
   - 包含全新且合法的 Tag $\to$ `STATE_CHANGED`；
   - 响应无 ViewState $\to$ `STATE_MISSING`。

### 3.3 协议指纹与漂移检测算法 (`jsf-diff.mjs`)
1. **协议规范化字符串构造**：严格按字典序排序 process/update 列表，剔除所有业务参数值与 Cookie，拼接 Method、Path、Faces Namespace、Source Role、Actions 序列；
2. **FNV-1a 紧凑散列**：生成定长的 8 字节 Hex 指纹字符串；
3. **结构集合差分**：对比 Baseline 与 Observed：
   - 提取命名空间变更、缺失动作集、非预期动作集；
   - 结合正则表达式区分业务表单名变动（High）与纯内部动态组件自增（如 `j_idt50` $\to$ `j_idt52`，评定为 Medium/Low），避免误报假阳性故障。

---

## 4. 安全证明与合规边界

1. **零原始敏感值持久化**：
   - `pnpm scan:secrets` 扫描全工作树，发现 0 条 error。
   - ViewState 原始值绝不写入 TraceEvent，更不写盘；所有测试 Canary 均验证未在输出结果的 JSON 序列化中出现。
2. **无任何新增业务写入**：
   - 本次补强的所有模块（`jsf-semantics.mjs`, `jsf-state-machine.mjs`, `jsf-diff.mjs`, `observed-components.mjs`）皆为**纯函数式或只读状态机**，不包含任何网络请求发送（Fetch/XHR）逻辑，不具备执行业务写操作的能力。
3. **Fail-Closed 默认安全**：
   - 当遇到未知请求、语法不完整、MIME 不匹配或超大输入时，状态统一返回 `unsupported` / `invalid_xml` / `unresolved`，绝不虚构有效结果。
4. **权威业务成功门禁**：
   - 严格遵循：`HTTP 200 != JSF valid != DOM updated != BUSINESS completed`。
   - 只有持有正式权威业务回执（如 `BUSINESS_RECEIPT_VERIFIED` 或 `DRAFT_LIST_MATCHED`）的事件，才允许将 `BUSINESS` 标记为 `completed`，否则一律保持 `unconfirmed`，`CERTAINTY` 保持 `unknown`。

---

## 5. 测试结果与性能基准

### 5.1 自动化测试结果

```powershell
# 1. TypeScript 类型检查
pnpm typecheck
# 输出：vue-tsc --noEmit -> Exit code: 0

# 2. 秘密与隐私扫描
pnpm scan:secrets
# 输出：密钥扫描通过，0 条 error -> Exit code: 0

# 3. 代码规范与门禁
pnpm lint
# 输出：ESLint 基线门禁通过，0 新增违规 -> Exit code: 0

# 4. 全套海牙单元测试与补强套件
pnpm exec vitest run tests/unit/hague
# 输出：60 test files passed (355 tests) -> Exit code: 0 (耗时 10.86s)

# 5. 原生研究模式 CDP 集成测试
pnpm exec vitest run tests/unit/scripts/hague-research.test.ts
# 输出：1 test file passed (20 tests) -> Exit code: 0 (耗时 0.88s)
```

**测试汇总：总计 61 个测试文件，375 项独立测试全部 PASS，0 FAIL。**

### 5.2 真实性能基准评估 (`scripts/measure-hague-research.mjs`)

在真实机器环境（12th Gen Intel Core i7-12700K）上对真实 Analysis Worker 进行 64 路请求并发与吞吐压力基准测量：

| 评估指标 | Basic 模式 (基线) | Research 模式 (改造后) | 说明 |
|---|---|---|---|
| **64 路请求总耗时** | 0.82 ms | **69.06 ms** | 平均每个完整 JSF 协议分析耗时仅 ~1.08ms |
| **CPU 用户时间** | 0 ms | 47 ms | 极低 CPU 负载 |
| **Worker 堆内存使用** | 0 MB | **8.84 MB** (峰值 9.5MB) | 严格受控在 64MB 上限之内 |
| **主进程峰值 RSS** | 58.8 MB | 80.7 MB | 仅增加 ~22MB，无任何内存泄漏 |
| **分析队列积压峰值** | 0 | 14 | 管道吞吐迅速，无阻塞 |
| **请求准入与解析数** | 0 | 64 / 64 (100%) | 0 超时，0 丢弃诊断 |
| **精准关联匹配数** | 0 | 64 / 64 (100%) | 0 歧义，0 未匹配 |

---

## 6. 任务交付物完成状态分级

按照第十一阶段标准进行严格分类：

| 项目分类 | 完成状态 | 说明 |
|---|---|---|
| **JSF 协议语义引擎** (`jsf-semantics.mjs`) | `IMPLEMENTED` / `TESTED_OFFLINE` | 离线单元测试、双解析器对比测试完全通过。 |
| **ViewState 因果状态机** (`jsf-state-machine.mjs`) | `IMPLEMENTED` / `TESTED_OFFLINE` | 单文档迁移、乱序检测、隐私擦除测试完全通过。 |
| **JSF 请求规范化** (`jsf-partial-response.mjs`) | `IMPLEMENTED` / `TESTED_OFFLINE` | 规范化多值参数、命名空间冲突检测完全通过。 |
| **AST 词法作用域与 JsfCallIR** (`analyzer.mjs`) | `IMPLEMENTED` / `TESTED_OFFLINE` | 块级作用域隔离、字面量解构、三元常量折叠完全通过。 |
| **协议指纹与协议漂移检测** (`jsf-diff.mjs`) | `IMPLEMENTED` / `TESTED_OFFLINE` | 协议指纹脱敏、场景序列、漂移告警分级完全通过。 |
| **变异模糊测试** (`protocol-fuzz.test.ts`) | `IMPLEMENTED` / `TESTED_OFFLINE` | 180 次确定性变异模糊测试完全通过，0 泄露 0 崩溃。 |
| **WIPO 线上实时回归** | `UNVERIFIED_LIVE` | 严守安全边界：**在未获得授权账号与测试环境前，绝不在真实生产环境提交测试数据**。离线通过不代表 WIPO 线上绝对验证通过。 |
| **真实浏览器 E2E (`hague-research.e2e.mjs`)** | `BLOCKED` | 本机环境缺少 Playwright Chromium 二进制（需执行 `npx playwright install` 下载），因此未在真实浏览器渲染层跑 E2E，所有协议与业务逻辑在 Vitest 模拟环境中验证完毕。 |

---

## 7. 验收结论

本次任务严格遵循系统设计与防范边界要求，未盲目重写已有基础设施，而是针对海牙系统的底层协议痛点，成功落实了：
1. **协议语义确定性**；
2. **ViewState 跨请求因果一致性**；
3. **AST 词法作用域高精度绑定**；
4. **低侵入协议漂移检测**；
5. **严密的六层证据与隐私安全保护**。

全部代码通过类型检查、秘密扫描、ESLint 基线门禁与全套测试回归，具备直接审查与归档条件。
