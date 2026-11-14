# 海牙协议指纹与协议漂移检测引擎 (Protocol Drift Detection)

**文件标识**：`docs/hague-protocol-drift.md`  
**核心实现**：`src/hague/diagnostics/protocol/jsf-diff.mjs` / `jsf-diff.d.mts`  
**测试证据**：`tests/unit/hague/jsf-diff.test.ts` (4/4 passed)

---

## 1. 架构目标与工程边界

企业级自动化系统在面对海牙（WIPO eHague）等复杂的第三方政企系统时，面临的最大挑战是**系统静默升级、组件重构与协议漂移**。

参考 `Browser.Reverse.Engineering.Toolkit` 的端点证据聚合与情境归一化思想，PatMail 设计了一套低侵入、全脱敏的协议指纹计算与协议漂移检测算法。

### 安全与低侵入原则

- **禁止页面代码注入**：不向真实客户浏览器注入大型爬虫框架或监控探针。
- **禁止存储采集**：不遍历、不采集 `localStorage`、`sessionStorage`、`IndexedDB`。
- **纯结构计算**：指纹计算仅依赖脱敏后的标准协议特征，彻底剔除所有客户业务字段、密码、Token 与 Cookie。

---

## 2. 协议指纹算法

系统区分三种不同用途的指纹：

### 2.1 协议请求指纹 (`protocolFingerprint`)

表达单次请求的规范化协议形态：
```text
canonical = [
  HTTP_METHOD,
  NORMALIZED_PATH,
  FACES_NAMESPACE,
  SAFE_SOURCE_COMPONENT,
  SORTED_PROCESS_EXPRESSIONS,
  SORTED_UPDATE_EXPRESSIONS,
  BEHAVIOR_EVENT,
  SORTED_OBSERVED_ACTIONS
].join('|')

protocolFingerprint = "proto:" + fnv1a(canonical)
```

### 2.2 场景流程序列指纹 (`scenarioFingerprint`)

表达多步业务交互链条的因果序列：
```text
scenario = steps.map(s => `${s.step}:${s.action}:${s.path}`).join('->')
scenarioFingerprint = "scenario:" + fnv1a(scenario)
```

---

## 3. 协议漂移检测算法 (Drift Detection)

当系统以离线录制或已确认的基线（Baseline）对比新捕获的运行时事件（Observed）时，触发差异比对：

```text
Baseline (已知基线)               Observed (当前观测)
  ├─ Faces Namespace: javax         ├─ Faces Namespace: jakarta  ──► [namespace_changed: High]
  ├─ Actions: [update, extension]   ├─ Actions: [redirect]       ──► [unexpected_action: High]
  ├─ ViewState: changes             ├─ ViewState: missing        ──► [viewstate_anomaly: High]
  └─ Source: j_idt50                └─ Source: j_idt52           ──► [component_id_shift: Medium]
```

### 差异等级评定准则

1. **High 严重度**：
   - Faces 命名空间发生结构性迁移（`javax` $\to$ `jakarta`）；
   - 预期中的核心更新动作（`update`）缺失，代之以 `error` 或登录跳转（`redirect`）；
   - ViewState 行为异常终止（`missing`）；
   - 核心静态业务表单身份发生结构改变（如 `ApplicantForm` 变为未知表单）。
2. **Medium / Low 严重度**：
   - **动态内部组件编号偏移**：如服务端重新渲染导致 `j_idt50` 变为 `j_idt52`。算法显式识别 `^j_idt\d+$` 规则，**严禁仅凭组件 ID 变化就盲目报出致命业务故障**，将其归类为可解释的 `component_id_shift`（中/低风险）。
