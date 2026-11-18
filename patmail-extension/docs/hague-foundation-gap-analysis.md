# 海牙基础协议算法与逆向研究引擎缺口审计报告
**文档标识**：`docs/hague-foundation-gap-analysis.md`  
**审计基线**：
- 主仓库：`haohaizi233/patmail` (commit: `7661b57bdfb4e0673ca2d62332ab598bb9bd0b28`，开发分支：`codex/hague-foundation-hardening`)
- 参考仓库 A：`RevTpark/vahan-scraper` (commit: `3ed714a3143fe1332d0411ca60b268fbe346ef0e`)
- 参考仓库 B：`Dvurechensky/Browser.Reverse.Engineering.Toolkit` (commit: `ecbe61af5004f6efa493749a623fbd98ab307a37`)
- 参考仓库 C：`primefaces/primefaces` (commit: `7325e478011843a3a08bb96290ebc858b2e25af4`)
**审计人员**：资深浏览器内核 / JSF 协议与静态分析专家  
**审计时间**：2026-11-14

---

## 1. 总体审计概要与差异矩阵

通过对主仓库及三个参考仓库的实际源码进行行级对比与架构审查，主仓库 PatMail 已经建立了坚实的 CDP 监听、脱敏 Schema、六层证据链、Babel AST 静态分析和 SAX XML 解析基础。然而在**底层协议语义一致性、跨请求 ViewState 状态机演化、AST 作用域与常量传播精度、运行时 Initiator 归因证据链、以及离线协议漂移检测**等五个关键维度上，仍存在明显的工程断层与改进缺口。

下表总结了关键模块的实现现状、风险等级与差距状态：

| 模块 / 能力维度 | 当前状态 | 风险等级 | 精确代码位置 | 核心缺口与问题 |
|---|---|---|---|---|
| **JSF 协议语义双解析器** | `partially_implemented` | **P0** | `src/hague/diagnostics/protocol/jsf-partial-response.mjs`<br>`src/hague/diagnostics/protocol.ts`<br>`src/hague/http-context.ts` | 存在 SAX 与 DOMParser 两套解析逻辑；未输出结构化操作序列 `JsfActionSummary[]`；未解析 `<error>` 子节点语义；未捕获 Faces 命名空间（`javax` vs `jakarta`）。 |
| **ViewState 跨请求因果状态机** | `partially_implemented` | **P0** | `scripts/hague-research.mjs:86`<br>`src/hague/diagnostics/protocol/jsf-partial-response.mjs:51-62` | `contextKey` 误包含了 `requestId`，导致每个请求的上下文隔离，无法对同一 Frame/Loader 下的连续请求对比 ViewState 迁移；缺少显式状态迁移机（INITIAL → IN_FLIGHT → OBSERVED → CHANGED/UNCHANGED/UNVERIFIABLE）。 |
| **JSF 请求规范化** | `partially_implemented` | **P1** | `src/hague/diagnostics/protocol/jsf-partial-response.mjs:66-88` | `parseJsfRequest` 仅处理标准前缀的部分参数；缺少多值参数语义检测、同名参数冲突检测、命名空间冲突检测，未识别 `@this/@form/@all/@none` 搜索表达式的规范化结构。 |
| **AST 词法作用域与求值器** | `partially_implemented` | **P1** | `src/hague/diagnostics/ast/analyzer.mjs:10-58` | 作用域管理仅包含浅层 Map 保存；块级作用域嵌套/遮蔽时变量状态容易退化为 UNKNOWN；未支持解构别名传播；未区分函数定义与实际调用；缺少统一的 `JsfCallIR` 中间表示。 |
| **Initiator 证据链关联** | `partially_implemented` | **P1** | `src/hague/diagnostics/correlation/correlator.mjs`<br>`scripts/hague-research.mjs:41-43` | 仅支持精准行列号匹配；若 Initiator 堆栈指向 jQuery/PF 库顶层包装，缺少回溯调用栈多候选锚点的归因判定；动态 `j_idt` 组件无结构映射。 |
| **六层证据与确定性解释** | `implemented` | **P0** | `src/hague/diagnostics/evidence/evidence-model.mjs` | 已实现六层模型，但对于业务未回执情况已严格 fail-closed；需补充细粒度协议事实解释，明确 `HTTP 200 != 协议有效 != 业务完成`。 |
| **协议指纹与协议漂移检测** | `missing` | **P2** | 尚无独立模块 | 缺少从脱敏事件构建场景因果图（Scenario Graph）与协议指纹（`sourceFingerprint`、`protocolFingerprint`、`scenarioFingerprint`）及离线基线漂移检测能力。 |

---

## 2. 深入审计缺口与细节分析

### 2.1 问题 A：JSF 协议语义双解析器与共享语义层缺失 (P0)

- **当前功能**：
  - `src/hague/diagnostics/protocol/jsf-partial-response.mjs` 使用 `saxes` 的 SAX 解析器，在流式解析中计算 `updateCount`, `insertCount`, `deleteCount`, `evalCount`, `extensionCount`, `unknownNodeCount`，并识别 `viewStatePresent`、`jsfError`、`validationFailed` 和 `redirectDetected`。
  - `src/hague/diagnostics/protocol.ts` 中的 `xmlEvidence` 使用浏览器的 `DOMParser`，在业务执行器中计算部分更新计数。
  - `src/hague/http-context.ts` 中又通过 DOMParser 遍历 `update` 节点并手动匹配 `/javax.faces.ViewState/`，执行 DOM 替换。
- **参考仓库对比 (PrimeFaces 官方源码)**：
  - `PrimePartialResponseWriter.java` 与 `core.ajax.response.ts` 明确规定了 `<partial-response>` 下的标准节点与顺序：
    1. `<redirect url="...">`（PrimeFaces 规定在执行完 changes/eval 后最后跳转，见 #13289）
    2. `<changes>` 包含 `<update id="...">`, `<insert>`, `<delete>`, `<attributes>`, `<eval>`, `<extension>`
    3. `<extension ln="primefaces" type="args">{"validationFailed":true,...}</extension>` 和 `type="script"`
    4. `<error><error-name>...</error-name><error-message>...</error-message></error>`
  - PrimeFaces 官方在 Faces 4.0 中将参数和状态名全面切换为 `jakarta.faces.*`，而老版本及 WIPO 使用 `javax.faces.*`。
- **现有缺口**：
  1. 当前 SAX 解析器未输出动作序列 `actions: JsfActionSummary[]`，丢失了服务端的实际操作执行顺序。
  2. `<error>` 节点仅记录 `jsfError = true`，未安全捕获其 `error-name` 与 `error-message` 分类，无法用于结构化诊断。
  3. 未识别并标记使用的 Faces 命名空间（`javax` vs `jakarta` vs `mixed`）。
  4. 业务执行器（DOMParser）与只读诊断（SAX）对同一 XML 的事实解释可能出现分歧。
- **建议修改**：
  - 在 `src/hague/diagnostics/protocol/` 中抽取出纯函数式的结构化解析器，统一返回只读规范模型 `JsfProtocolResult`。
  - 严格保持防 XXE / 防外部实体 / 防大包注入 / 不执行 eval 的安全底线。

### 2.2 问题 B：ViewState 跨请求迁移跟踪与作用域断裂 (P0)

- **当前功能**：
  - `jsf-partial-response.mjs` 中定义了 `createJsfProtocolAnalyzer()`，利用内存中 32 字节随机会话密钥进行 HMAC-SHA256 签名并与历史 Tag 比较 `viewStateChanged`。
- **现有缺口 (严重缺陷)**：
  - 在 `scripts/hague-research.mjs` 第 86 行：
    ```javascript
    parsed = await this.worker.analyze('xml', body, {
      contextKey: `${r.sessionId}:${r.frameId}:${r.loaderId}:${r.requestId}`,
      mime: r.mime,
      httpStatus: r.status
    })
    ```
    这里的 `contextKey` 拼接了 `r.requestId`！每个 HTTP 请求的 `requestId` 都是唯一的，导致每个请求计算时 `tags.get(options.contextKey)` 必定为 `undefined`。
    **结果：在原生 CDP 研究模式下，跨请求的 `viewStateChanged` 永远无法被检测到！**
  - 没有引入明确的 ViewState 状态机：
    `UNKNOWN` → `INITIAL_OBSERVED` → `REQUEST_IN_FLIGHT` → `RESPONSE_OBSERVED` → `STATE_CHANGED` / `STATE_UNCHANGED` / `STATE_UNVERIFIABLE`。
  - 缺乏生命周期感知：当 Frame 重新导航、Loader 改变或 Session 销毁时，缺少显式的 `DOCUMENT_CHANGED` 迁移。
- **建议修改**：
  - 修正 `contextKey` 为 `${r.sessionId}:${r.frameId}:${r.loaderId}`（同文档/同生命周期），并按表单维度（如果识别到表单 ID）进行隔离。
  - 建立专用的 `JsfStateMachine` / `ViewStateTracker`，实现纯内存短期 HMAC，严禁持久化明文，严格隔离 generation。

### 2.3 问题 C：JSF 请求规范化与动态组件分析 (P1)

- **参考仓库对比 (vahan-scraper 与 PrimeFaces)**：
  - `vahan-scraper` 的 `ajax_post` 构造了标准的 PrimeFaces 请求：
    - `javax.faces.partial.ajax: true`
    - `javax.faces.source`: source component id
    - `javax.faces.partial.execute`: 搜索表达式（如 `@this`, `@all`, 组件 ID 列表）
    - `javax.faces.partial.render`: 搜索表达式（如 `@all`, 组件 ID 列表）
    - `javax.faces.behavior.event` / `javax.faces.partial.event`
    - 按钮点击时附带 `sourceId: sourceId` 参数
    - DataTable 附带分页参数：`[dtId]_pagination`, `[dtId]_first`, `[dtId]_rows` 等
  - PrimeFaces `core.ajax.request.ts` 展示了命名容器前缀（如 `formId:subId`）、`partialSubmit` 过滤、多值序列化等机制。
- **当前功能与缺口**：
  - 当前 `parseJsfRequest` 仅粗略提取 `source`, `process`, `update`, `form`，对非法或重复参数统计不足。
  - 缺少规范化字段：`behaviorEvent`, `ajaxMarkerPresent`, `viewStatePresent`, `viewStateMetadata`, `duplicateParameterCount`, `unknownParameterCount`, `protocolConfidence`。
  - 缺少对动态组件（如 `j_idt66`, `j_idt71` 随着服务端重新渲染变化的动态 ID）的结构化角色识别模型（`ObservedComponent`）。

### 2.4 问题 D：AST 静态分析器作用域与常量传播补强 (P1)

- **当前功能**：
  - `src/hague/diagnostics/ast/analyzer.mjs` 基于 Babel 解析，可提取 `PrimeFaces.ab`, `mojarra.ab`, `PrimeFaces.cw` 等调用。
  - 具备执行限制（maxNodes, maxDepth, maxTimeMs）。
- **现有缺口**：
  - 符号表与词法作用域处理简陋：同名变量在嵌套块中被重新定义时，未做严格的块级作用域隔离；
  - 常量传播不支持简单条件三元表达式（除最浅层外）、逻辑与或短路求值、常量数组展开；
  - 缺少统一的 `JsfCallIR` 中间表示，输出结构在不同调用类型间不规整；
  - 没有明确区分“AST 源码中声明的调用”与“运行时真正被派发的调用”。

### 2.5 问题 E：六层证据模型与协议漂移检测 (P0/P2)

- **当前功能**：
  - `evidence-model.mjs` 实现 6 层证据模型，严格区分 `REQUEST`, `HTTP`, `JSF_PROTOCOL`, `DOM`, `BUSINESS`, `CERTAINTY`。
  - 严格保持当缺失权威业务回执（`BUSINESS_RECEIPT_VERIFIED` 或 `DRAFT_LIST_MATCHED`）时，`BUSINESS` 必为 `unconfirmed`，`CERTAINTY` 必为 `unknown`。
- **参考仓库对比 (Browser.Reverse.Engineering.Toolkit)**：
  - 借鉴其在 `SiteSnapshotter/modules/scenario.js`、`evidence.js` 和 `SiteReconstructor/src/reconstructor/analysis.js` 中的协议归一化、端点聚合、指纹比对机制。
  - 在不侵入用户真实浏览器、不窃取存储的前提下，提取脱敏的协议场景图（Scenario Graph）。
- **现有缺口**：
  - 缺少 Protocol Fingerprint 计算机制（按 Method + Path + Faces Namespace + Source Component Role + Execute/Render Pattern 生成）。
  - 缺少 Protocol Drift Detection 算法：当海牙系统升级或页面重构，导致请求参数缺失、新的 JSF action、命名空间变化或 ViewState 行为异常时，无法进行结构化差异告警。

---

## 3. 分阶段实施路线图

按照 prompt 要求的严格优先级推进：

- **阶段一 (当前已完成)**：完成四个仓库的实测代码比对与缺口审计报告（本文档）。
- **阶段二 (P0)**：JSF / PrimeFaces 共享协议语义引擎与受限 XML 解析补强（新建 `src/hague/diagnostics/protocol/jsf-semantics.mjs` 与相关单元测试）。
- **阶段三 (P1)**：JSF 请求规范化（`parseJsfRequest` 增强）与动态组件映射模型。
- **阶段四 (P0)**：修复 `contextKey` 跨请求丢失缺陷，实现限定作用域、安全 HMAC 的 ViewState 状态机与因果追踪。
- **阶段五 (P1)**：AST 词法作用域分析、常量折叠与标准 `JsfCallIR` 中间表示。
- **阶段六 (P0)**：确定性事件关联、多源并发乱序处理与六层证据解释规则加固。
- **阶段七 (P2)**：轻量协议场景图、协议指纹与协议漂移检测（Protocol Drift Detection）。
- **阶段八 (P0/P1)**：全方位单元测试、边界测试、变异模糊测试与性能基准评估。
- **阶段九 & 十**：全套回归测试、秘密扫描与技术文档交付。
