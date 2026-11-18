# 协议指纹与漂移

核验：2026-11-16，代码基线 `de2ee0d`；证据等级 code_verified，关联离线测试入口如下。正式状态见治理清单。

## 规范化和指纹

[jsf-diff.mjs](../../../src/hague/diagnostics/protocol/jsf-diff.mjs)将 method、允许路径、facesNamespace、脱敏 sourceComponent、排序后的 process/update token、event 和有序 actionTypes 拼成 canonical 字符串，以 FNV-1a 32 位得到 proto: 摘要。process/update 是集合式特征，动作是序列式特征，不能一律排序。

场景指纹按步骤、动作和路径拼接有序序列。它是结构比较索引，不是账号认证、材料内容校验或防篡改签名；32 位哈希存在碰撞，不能据相同哈希证明完全相同。

## 基线比较

输入为历史 baseline 与本次 observed，输出 driftStatus、severity、差异与 unresolvedReasons。没有 baseline 返回 baseline_missing；缺少或互相冲突的 action 观测也不是“没有漂移”。动态 j_idtNNN 组件变化必须结合 namespace、动作及已观察角色判定，不凭字符串相似自动授予同等语义。

风险分级看 detectProtocolDrift 的实际条件：命名空间、动作序列、组件结构等差异组合决定高中低等级；报告是审查线索，不会自动修改业务 source/process/render。组件注册表记录已观察结构，不将命名猜测提升成凭证角色。

| 分级 | 实际触发示例 |
|---|---|
| high | 已知 facesNamespace 改变；缺少预期 update/extension；新增 redirect/error；已知状态行为变为 missing；非纯动态编号的 sourceComponent 改变 |
| medium | 有序动作序列改变且未触发 high；两个 sourceComponent 都匹配完整的 `^j_idt\d+$` 但编号变化 |
| low | 默认等级；已知 ViewState 行为改变但并非变为 missing 可保留 low。baseline_missing / unresolved 也可为 low，但不表示已证明无漂移 |

等级取已触发条件中的最高风险。`form:j_idt123` 不匹配上述完整正则，不可将它擅自归入纯编号变化分支。

## 实际接入与局限

[Worker](../../../scripts/hague-research-worker.mjs) xml 分支生成本次结构摘要并调用 detectProtocolDrift(options.baseline, observedMeta)，输出 driftCompared / driftStatus 等字段。存在调用不代表每次现场都有可用 baseline；baseline_missing 必须在展示和导出中保留。

单次规范化与排序成本依 token 数而定，场景指纹与步骤序列长度相关。输入上限还受到上游 XML 与事件投影预算约束。重复哈希不可以替代原结构核对，更不能据静态 AST 调用认定线上无漂移。

测试：[漂移](../../../tests/unit/hague/jsf-diff.test.ts)、[请求规范化](../../../tests/unit/hague/jsf-request-normalization.test.ts)。相关：[JSF 保序语义](jsf-protocol.md)、[关联证据](correlation-evidence.md)。
