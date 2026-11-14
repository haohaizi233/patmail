# 海牙 CDP、JSF 与 AST 确定性证据关联模型

**文件标识**：`docs/hague-correlation-evidence.md`  
**核心实现**：
- `src/hague/diagnostics/correlation/correlator.mjs`
- `src/hague/diagnostics/evidence/evidence-model.mjs`
**测试证据**：
- `tests/unit/hague/research-evidence.test.ts` (18/18 passed)
- `tests/unit/hague/protocol-fuzz.test.ts` (3/3 passed)

---

## 1. 六层证据体系结构

PatMail 诊断引擎坚持确定的层次隔离原则，严禁层级越权推断：

```text
┌────────────────────────────────────────────────────────┐
│ 层级 1: REQUEST      (网络请求派发与生命周期)          │
├────────────────────────────────────────────────────────┤
│ 层级 2: HTTP         (传输层状态码与 Header 事实)      │
├────────────────────────────────────────────────────────┤
│ 层级 3: JSF_PROTOCOL (XML 规范化结构、更新与状态)      │
├────────────────────────────────────────────────────────┤
│ 层级 4: DOM          (浏览器真实 DOM 树观测计数变迁)   │
├────────────────────────────────────────────────────────┤
│ 层级 5: BUSINESS     (WIPO Reference 与权威业务回执)   │
├────────────────────────────────────────────────────────┤
│ 层级 6: CERTAINTY    (全局事实确定性归纳)              │
└────────────────────────────────────────────────────────┘
```

### 六层状态事实定义

- **REQUEST**: `not_observed` | `dispatched` | `finished` | `failed`
- **HTTP**: `not_observed` | `observed` | `completed` (2xx) | `failed` (4xx/5xx)
- **JSF_PROTOCOL**: `not_observed` | `valid` | `redirect` | `failed` | `unrecognized`
- **DOM**: `not_observed` | `expected_only` | `application_model` | `observed_changed` | `observed_unchanged`
- **BUSINESS**: `unconfirmed` | `rejected` | `completed`
- **CERTAINTY**: `unknown` | `confirmed` | `rejected`

---

## 2. 因果图与匹配等级

```text
CDP Network Request (cdpRequestId, sessionId, initiator)
        │
        ├──────────────────────┐ (AST 静态源码调用边)
        ▼                      ▼
  HTTP Response          AST Source Call (scriptId, line, col)
        │                      │
        ▼                      ▼
JSF Partial Response     JsfCallIR (process, update, event)
        │
        ▼
Expected DOM Updates (updatedComponents)
        │
        ▼
Observed DOM Changes (applicants/creators/priorities/designs count)
        │
        ▼
Authoritative Business Receipt (WIPO Ref, Draft Matched)
```

### 匹配置信度判定准则

| 等级 | 条件要求 | 权限限制 |
|---|---|---|
| `exact` | 具备唯一、精确、生命周期一致的强身份标识（如相同的 `cdpRequestId`+`sessionId`，或匹配的 `traceId`+`caseRunId`+`requestId`，且无任何标识冲突）。 | 允许关联权威业务回执。 |
| `probable` | 仅存在有限弱证据（如相同路径、相同方法、时间窗口 $\le 1500\text{ms}$），但缺少权威直连标识。 | **严禁借用真实业务回执！** BUSINESS 必须保持 `unconfirmed`。 |
| `ambiguous` | 存在多个相互竞争的候选请求或标识冲突。 | 归入歧义候选，阻断任何成功判定。 |
| `unmatched` | 缺少直接或间接的匹配证据。 | 视为孤立事件。 |

---

## 3. 确定性解释示例

系统生成的每一条诊断解释均来自显式的规则规约，严禁使用大模型虚构事实：

### 典型场景：HTTP 200 但无业务回执

- **状态事实**：
  - `HTTP = completed (200)`
  - `JSF_PROTOCOL = valid`
  - `DOM = expected_only`
  - `BUSINESS = unconfirmed`
  - `CERTAINTY = unknown`
- **解释语句**：
  > “请求：finished；HTTP：completed；JSF 协议：valid；DOM：expected_only；业务：unconfirmed；确定性：unknown。HTTP 状态码：200。JSF update 数量：2。同文档真实 DOM 前后变化证据缺失；权威业务回执证据缺失。”

该机制确保当海牙系统仅返回空刷新或静默丢失时，自动化引擎永远不会将未经验证的网络响应误判为业务成功。
