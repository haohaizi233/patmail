# 海牙底层研究引擎全链路集成缺口审计报告

**文档路径**：`docs/hague-foundation-integration-gap.md` / `patmail-extension/docs/hague-foundation-integration-gap.md`  
**基线 HEAD**：`42767c466d1c0dcec3cdc1c7b3b545b4652f5b9e` (PR #24 合并节点)  
**修复分支**：`codex/hague-foundation-integration-fix`  
**审计人员**：资深浏览器协议工程师、JSF/PrimeFaces 专家、AST 静态分析专家与系统架构师  
**审计时间**：2026-11-14  

---

## 1. 总体审计概要与集成断层总览

在 PR #24 (`codex/hague-foundation-hardening`) 中，团队新增了一批核心协议与算法文件（包括 `jsf-state-machine.mjs`、`jsf-semantics.mjs`、`jsf-diff.mjs`、`observed-components.mjs`），并补强了 AST 静态分析与 Fuzz 测试。

然而，通过全面代码审查与生产调用路径追踪，我们确认：**上述新算法和新模块仅在各自的单元测试中被引用，并未真正接入 PatMail 海牙 Research Mode 运行链路。** 生产 Research 链路仍然沿用旧版单请求 HMAC 比较、旧版简易 SAX 解析、缺少运行时组件动态推断、缺少协议漂移自动报告。

下表总结了当前生产链路中的全部核心集成缺口：

| 缺口编号 | 缺陷分类 | 严重等级 | 涉及生产文件 | 现状与核心问题 | 修复目标与规范 |
|---|---|---|---|---|---|
| **GAP-P0-1** | ViewState 因果追踪断裂与状态机未接入 | **P0** | `scripts/hague-research.mjs:86`<br>`scripts/hague-research-worker.mjs:5-14`<br>`src/hague/diagnostics/protocol/jsf-state-machine.mjs` | `contextKey` 包含 `requestId` 导致单请求孤立比较；Worker 仍使用 `createJsfProtocolAnalyzer()`；`createViewStateStateMachine()` 未接入实际链路；`inFlight` 无界无 TTL；首次 AJAX 响应错误标记为 `STATE_CHANGED` 而非 `INITIAL_OBSERVED`。 | 移除 `requestId` 建立严格 Document Scope；集成 `createViewStateStateMachine` 到 Worker；状态机增补容量限制、TTL 与清理时机；首次观测采用无前置状态的安全语义；修复并发/乱序返回。 |
| **GAP-P0-2** | 统一 JSF 共享语义解析器未接入生产链 | **P0** | `scripts/hague-research-worker.mjs:5-14`<br>`src/hague/http-context.ts:84-128`<br>`src/hague/diagnostics/protocol/jsf-semantics.mjs` | Research Worker 仍调用旧解析器；`http-context.ts` 仍自写 DOMParser 解释协议；`compareJsfDualParsers` 在测试中采用手写 Mock DOMParser 伪造一致性。 | Worker 全面改用 `parseJsfProtocol()`；建立安全 Trace 投影保持 TraceEvent 模式兼容；使 HTTP 诊断复用相同协议语义事实；建立真实语义双解析器对照验证。 |
| **GAP-P0-3** | AST PrimeFaces.bcn 执行安全边界需严密审计 | **P0** | `src/hague/diagnostics/ast/analyzer.mjs:71-80`<br>`src/hague/http-driver.ts:31-42` | AST 解析器新增对 `PrimeFaces.bcn` 的提取，因 `http-driver.ts` 调用此能力生成真实 HTTP Action，若存在取消语义、结构异常或参数篡改，可能导致误触发写操作或重复派发。 | 确立严格 fail-closed 白名单；增加完整的负面测试（空回调、多回调、取消逻辑、动态分支、别名遮蔽等），断言 `fetchMock` 零调用；正向场景恰好只调用一次。 |
| **GAP-P1-1** | 错误名称与组件角色信任边界不严 | **P1** | `src/hague/diagnostics/protocol/jsf-semantics.mjs:355-371`<br>`src/hague/diagnostics/protocol/observed-components.mjs:8-20` | `error-name` 提取任意 Java 类名后缀进入诊断；XML 错误正文累积无长度上限；组件角色仅凭 `save`/`upload` 包含字符串直接推断，且赋予业务语义。 | 引入受控 `KNOWN_ERROR_CATEGORY` 枚举，未知错误不透传原始名；限制 XML CDATA/Text 累积字节；组件角色必须基于 DOM + AST + Request 多重证据，不足则为 `unknown`，绝不凭字符串授权业务动作。 |
| **GAP-P1-2** | 协议漂移检测算法未融入诊断报告 | **P1** | `src/hague/diagnostics/protocol/jsf-diff.mjs`<br>`src/hague/diagnostics/reports.ts`<br>`src/hague/diagnostics/observer-adapter.mjs` | `detectProtocolDrift` 仅为独立离线算法函数，未连接 Research Worker 事件链与现有诊断报告；缺少基线缺失时的 `baseline_missing` 状态规范；动作比较未考虑保序性。 | 在 Worker/Adapter/Reports 中形成自动提取协议指纹、基线版本比对、输出漂移证据的闭环；报告展示指纹、漂移严重度与变更详情。 |
| **GAP-P1-3** | 全链路纵向集成与生命周期竞态验证薄弱 | **P1** | 全链路多模块 | 缺乏跨多组件的全流程模拟（Scenario A 正常交互、B 业务失败、C 协议漂移、D 生命周期竞态）；存在测试断言过宽（多个状态任选）。 | 建立全链路端到端集成测试，严格断言具体状态；消除宽容断言；增加受控 Fuzz 变异用例。 |

---

## 2. 详细缺口分析与代码位置定位

### 2.1 GAP-P0-1: ViewState 状态机与跨请求因果关系追踪

#### 代码断层位置
- `patmail-extension/scripts/hague-research.mjs` 第 86 行：
  ```javascript
  parsed = await this.worker.analyze('xml', body, {
    contextKey: `${r.sessionId}:${r.frameId}:${r.loaderId}:${r.requestId}`,
    mime: r.mime,
    httpStatus: r.status
  })
  ```
  **问题**：拼接了 `r.requestId`，导致每个 HTTP 请求的 `contextKey` 都是全新的，状态机在两次请求间永远无法关联前置状态。
- `patmail-extension/scripts/hague-research-worker.mjs` 第 5-6 行：
  ```javascript
  import { createJsfProtocolAnalyzer } from '../src/hague/diagnostics/protocol/jsf-partial-response.mjs'
  const protocol = createJsfProtocolAnalyzer()
  ```
  **问题**：Worker 根本没有引入 `createViewStateStateMachine()`。
- `patmail-extension/src/hague/diagnostics/protocol/jsf-state-machine.mjs` 第 29 行、第 158-175 行：
  - `const inFlight = new Map()`：无容量上限、无 TTL、无跨 Target / Frame 逐出机制。
  - 首次观测到响应 ViewState 时，若之前没有记录初始状态，直接进入 `transition = 'STATE_CHANGED'`，违反了“无前置状态证据应标记 `INITIAL_OBSERVED` 或 `STATE_UNVERIFIABLE`”的原则。
  - 宽容测试问题：`tests/unit/hague/jsf-state-machine.test.ts` 中存在 `expect(['STATE_CHANGED', 'STATE_CONFLICT', 'OUT_OF_ORDER']).toContain(res.transition)`，掩盖了错误的状态迁移。

---

### 2.2 GAP-P0-2: JSF 统一语义解析层接入

#### 代码断层位置
- `patmail-extension/scripts/hague-research-worker.mjs`：
  Worker 对 XML 分析请求直接转发给 `protocol.analyze(value, options)`，使用的是 `jsf-partial-response.mjs` 中的老 SAX 解析器，丢失了 `jsf-semantics.mjs` 的有序动作提取、命名空间识别、受控错误分类等能力。
- `patmail-extension/src/hague/http-context.ts` 第 84-128 行：
  HTTP 执行链路使用原生的 `DOMParser` 进行简单的元素查找，无法复用 SAX 解析器产出的协议事实。
- `patmail-extension/src/hague/diagnostics/protocol/jsf-semantics.mjs` 第 486-523 行：
  `compareJsfDualParsers()` 使用了一个内部局部实现的 DOMParser 逻辑，不能证明与 `http-context.ts` 或真实浏览器的行为一致。

---

### 2.3 GAP-P0-3: AST PrimeFaces.bcn 执行安全审计

#### 代码断层位置
- `patmail-extension/src/hague/diagnostics/ast/analyzer.mjs` 第 71-80 行：
  ```javascript
  if(execution&&active&&name==='PrimeFaces.bcn'){ ... }
  ```
- `patmail-extension/src/hague/http-driver.ts`：
  `jsfAction()` 依赖静态分析提取动作并由 `httpContext.post()` 执行。
  必须保证 `PrimeFaces.bcn` 在面对多于/少于 2 个回调、存在取消守卫返回 `false`、异步回调、条件分支或别名覆盖时，绝不能产生实际 HTTP 请求（fail-closed），并有 `fetchMock` 严格的调用次数断言。

---

### 2.4 GAP-P1-1: 错误名称与动态组件角色的信任边界

#### 代码断层位置
- `patmail-extension/src/hague/diagnostics/protocol/jsf-semantics.mjs` 第 355-371 行：
  `<error-name>` 中提取的类名后缀未经过白名单过滤直接写入 `protocolErrors`。
- `patmail-extension/src/hague/diagnostics/protocol/observed-components.mjs` 第 8-20 行：
  `inferRole()` 单纯通过 ID 是否包含 `save`、`upload`、`refresh` 等字符串来判定组件角色，容易被恶意或非标准组件欺骗，不能作为业务授权凭据。

---

### 2.5 GAP-P1-2: 协议漂移检测接入报告与事件链

#### 代码断层位置
- `patmail-extension/src/hague/diagnostics/protocol/jsf-diff.mjs`：
  虽然实现了 `computeProtocolFingerprint` 和 `detectProtocolDrift`，但从未在任何诊断日志生成路径中被调用。
- `patmail-extension/src/hague/diagnostics/reports.ts` 与 `HagueDiagnostics.vue`：
  报告展示中没有任何协议指纹、基线比对或漂移状态字段。

---

## 3. 修复计划与集成路线图

1. **阶段 A (P0)**：
   - 改造 `jsf-state-machine.mjs`：实现作用域分离、inFlight 有界与 TTL 管理、正确初始状态语义、并发乱序检测。
   - 接入 Worker：`scripts/hague-research.mjs` 和 `scripts/hague-research-worker.mjs` 统一接入 `createViewStateStateMachine()` 与 `parseJsfProtocol()`。
   - AST PrimeFaces.bcn 严格安全门禁与负面测试。
2. **阶段 B (P1)**：
   - `jsf-semantics.mjs` 错误分类收紧与缓冲区有界保护。
   - `observed-components.mjs` 角色推断多源证据约束与生命周期保护。
   - 修复双解析器对照测试的真实一致性。
3. **阶段 C (P1/P2)**：
   - 协议指纹与漂移检测接入 Worker 分析与 `reports.ts` 诊断报告。
   - 编写场景 A/B/C/D 纵向集成测试与 Fuzz 强化测试。
   - 性能压力回归测试与交付文档。
