# JavaScript AST

核验：2026-11-16，代码基线 `de2ee0d`；证据等级 code_verified，关联离线测试入口如下。正式状态见治理清单。

## 问题与接口

HTML 中的内联事件和动态脚本包含 PrimeFaces、mojarra 调用，正则难以处理对象、别名、作用域与嵌套回调。[analyzer.mjs](../../../src/hague/diagnostics/ast/analyzer.mjs)使用 Babel parser 生成 AST，再按受限语法投影调用中间表示；输入是源码字符串与预算，输出是 calls/actions、位置和 unresolved 原因。

## 核心过程

词法环境为 Map，块与函数进入前保存环境；退出后恢复。参数、arguments 等遮蔽项以 UNKNOWN 表示，局部重名不能被当成全局 API。常量包括标量、对象、数组、模板字符串和受限加法；动态属性、任意函数执行、未知条件均不猜测。有限 atob / fromCharCode 解码仍受长度、深度约束。

PrimeFaces.ab / mojarra.ab 等调用被标准化为 JSF 调用 IR（JsfCallIR）：source/form/process/update、事件、参数结构、源码位置及置信度，而非携带 Cookie 或执行任意脚本。PrimeFaces.bcn 回调安全路径需要明确的可支持控制流，不能通过捕捉一个调用忽略回调中的未知副作用。

## 预算与正确性

默认上限：源码 262144、AST 节点 30000、递归深度 100、时间 100ms、解码深度 2；选项只允许收紧。atob 参数最长 32768，fromCharCode 参数不超过 4096。源码长度检查使用 JS string.length，因此非 ASCII 输入不能简单把这个实现上限解释为精确 UTF-8 字节数。

遍历通常与访问节点数线性相关，但环境保存/恢复和缓存会增加成本；不是无条件 O(n) 保证。硬预算是资源安全边界。超时、解析错误、动态控制流输出 unresolved，不扩大到执行 eval 或 Function。

## 研究与执行隔离

Worker ast 分支调用 analyzeJavaScript 后把有限调用元数据放入 source index；lookup 再按脚本来源位置关联。[CDP 研究](cdp-research.md)负责动态事件。**识别到调用不代表调用已经执行，更不代表业务成功。**

测试：[作用域](../../../tests/unit/hague/ast-scope-analysis.test.ts)、[bcn 对抗安全](../../../tests/unit/hague/ast-bcn-security.test.ts)、[调用提取](../../../tests/unit/hague/diagnostics-ast.test.ts)。这些测试不证明真实 WIPO 每一个脚本都可静态确定。
