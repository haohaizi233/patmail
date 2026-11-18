# CDP 全链路逆向

核验：2026-11-16，代码基线 `de2ee0d`；证据等级 code_verified，关联离线测试入口如下。正式状态见治理清单。

## 输入、身份和输出

输入为获授权 Target 的 CDP 事件。Target 是页面等调试对象，Session 是连接到目标的调试会话，Frame 标识文档容器，Loader 区分导航后的文档世代；这些值不可与应用 requestId 混为一谈。输出为脱敏 TraceEvent 和统计，不是浏览器操作脚本。

[Research 控制器](../../../scripts/hague-research.mjs)的请求跟踪要求当前研究目标/session 一致、POST、XHR/Fetch、明确 frameId/loaderId，排除重定向，最多 2048 个请求。请求表用 session/request 标识承接响应；送入 Worker 的状态 scope 另外包含 target/frame/loader/form，requestId 作为请求身份单独传入。

## 动态观测与静态分析

Network.requestWillBeSent 与 response/loading 事件证明传输发生或失败；HTTP 200 不证明原站保存。scriptParsed 仅说明脚本被发现；获授权读取 getScriptSource 后，源码只交给 AST 分析。AST 识别出的调用可能位于未执行函数中，不能当成网络请求发生。

源码位置必须结合脚本身份、起始行列偏移和 Initiator 位置匹配。[来源索引](../../../src/hague/diagnostics/correlation/correlator.mjs)限制脚本和调用数量，不保留可执行原文；无法唯一匹配时返回 ambiguous/unmatched，不能按时间猜测借用其他案的业务回执。

## 生命周期与异常

导航后 Loader 改变，旧文档的状态和请求关联应失效；session 失效和 clear 信号传入[Worker](../../../scripts/hague-research-worker.mjs)。重连必须重新建立研究资源，不能把旧 scriptId 当作新页面脚本。延迟返回还须检查当前目标和 generation。具体状态键见[ViewState 状态机](viewstate-state-machine.md)。

## 预算、安全和证据范围

只读监听使用原生协议，禁止 Playwright connectOverCDP 改动真实下载设置。原始正文只在已授权有限分析阶段临时消费，不写日志；不得导出 Cookie、请求头、下载令牌或客户清单。AST/XML 超预算只丢弃研究分析，不改变业务执行。

现场观测能证明当时目标发生的事件；离线 fixture 仅证明给定输入的算法输出；阅读代码只能证明存在可达调用，不等于真实站点覆盖。维护命令与日志保留见[维护指南](diagnostics-and-maintenance.md)。

测试：[研究证据](../../../tests/unit/hague/research-evidence.test.ts)、[研究 JSF](../../../tests/unit/hague/research-jsf-parser.test.ts)。
