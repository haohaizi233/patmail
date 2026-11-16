# 证据关联

核验：2026-11-16，代码基线 `de2ee0d`；证据等级 code_verified，关联离线测试入口如下。正式状态见治理清单。

## 六层实际定义

[evidence-model.mjs](../../../src/hague/diagnostics/evidence/evidence-model.mjs)的六层输出键是 NETWORK、HTTP、JSF_PROTOCOL、DOM、BUSINESS、CERTAINTY。输入事件先过 sanitizeTraceEvent；selector 再限制请求/案件范围。网络失败、HTTP 状态、协议错误、DOM 观测、业务核验和确定性分别记录，不能把一层的成功冒充六层完成。

DOM 层区分 observed_changed、observed_unchanged、application_model、expected_only；应用维护的 DOM 模型不是浏览器真实 DOM 前后观测。业务层要有匹配身份的 business.validated / 核验回执；HTTP 2xx、AST 精确位置和“应更新组件”都不足以构成业务成功。

## 关联等级

| 等级 | 当前条件 | 禁止推断 |
|---|---|---|
| exact | 唯一直接请求身份；session+cdpRequestId，或 requestId+caseRunId+traceId，且无作用域冲突 | 不能因 exact 就说业务已完成 |
| probable | 无直接唯一身份，但同 target/frame/method/path 且 1500ms 内唯一候选 | 不能借用候选案件的业务回执 |
| ambiguous | 多个直接或结构时间候选 | 不能任选最近者归案 |
| unmatched | 没有足够证据 | 不能反推请求未执行 |

[correlateRequest](../../../src/hague/diagnostics/correlation/correlator.mjs)优先直接 ID，作用域任何显式冲突都会排除；仅 exact 才传播案件拥有权。与 AST 源码位置的 astCorrelationConfidence 是独立结论，不与网络关联等级混用。

## 状态与因果边界

跨 application/CDP 事件归并时，证据模型要求 exact 与同 session，并有直接 CDP 身份或完整应用请求身份。历史按时间猜测的日志不会在回放时升级为业务确认。缺少 request 派发、有效 JSF、真实 DOM 或权威业务回执时，missingEvidence 明确列出，不通过多数票补齐。

算法先筛选有限事件再按关系投影；不同分析分支会多次扫描集合，复杂度与实际事件量相关，不能宣称跨任意长日志常数时间。采集器和来源索引的容量限制见[架构](architecture.md)及 [CDP](cdp-research.md)。

测试：[研究证据](../../../tests/unit/hague/research-evidence.test.ts)、[诊断协议](../../../tests/unit/hague/diagnostics-protocol.test.ts)。离线测试验证裁决规则；本轮不重演原站业务。
