# 海牙协议诊断专项交付与验收

本次交付基于 `haohaizi233/main` 的 `ceabd813a67d6f91a74410e1561ba313e4bba0c3`，工作分支 `codex/hague-protocol-diagnostics`。同步时远端与HEAD一致；原有未提交工作已保留，补丁和未跟踪文件备份位于本机忽略目录 `test-results/hague-upgrade-baseline`。没有提交或推送代码。

## 文档索引

|文档|内容|
|---|---|
|[代码审计](hague-code-audit.md)|21种DraftCommand、业务回执、检查点及恢复；HTTP/RPC状态传递表；应用盲区|
|[CDP逆向观察](hague-cdp-reverse-engineering.md)|现有采集能力审计、独立深度命令策略、关联证据、生命周期和隐私|
|[AST分析](hague-ast-analysis.md)|真实Babel AST、静态求值与解码、执行提取限制、Widget配置及证据层级|
|[Trace与状态](hague-tracing-and-status.md)|调用链、四类状态、Schema、面板、导出、离线Fixture与局限|
|[面板验收](hague-diagnostics-ui-acceptance.md)|隔离Chrome桌面/窄屏、请求详情、真实导出下载与离线回放|
|[Observer维护](cdp-observer.md)|现有服务启动/状态/停止、授权与深度采集命令|
|[工作流](workflows/海牙新申请.md)|用户操作、业务校验与诊断入口|

## 已落地行为

- HTTP/JSF仍为主要引擎，每案独立DOM/ViewState/队列；保留1～6路调度、关键创建串行池、发送前uncertain、精确Draft(s)验证和原有有限恢复。
- 每次运行有不含案号的caseRunId，每步骤有traceId，每请求有requestId。Trace作为RPC元数据贯穿Runner、链、Driver的Context、后台和注入fetch；不加入原站认证头或改变表单正文。
- 结构化错误保留已观测HTTP状态；没有响应使用null。HTTP200、JSF合法、业务完成分别判定；业务回执缺失仍为unconfirmed。客户端收到真实HTTP200后业务失败时继续保留200，不将它抹成空值。
- XML解析记录error/validation/redirect及变化节点计数；DOM仅记录结构及计数，ViewState仅SHA-256摘要与长度。缺失更新目标及未实现insert/delete停止该链，保留检查点。
- jsfAction及上传/分页控件配置使用AST。动态、不确定、未调用、提前返回及不支持控制流不能制造写请求。诊断分析和执行提取分离，静态解码代码只用于分析。
- 应用诊断默认关闭，深度CDP独立显式开启。CDP沿用原有原生WebSocket Observer，不新增守护进程；仅允许固定观察指令，不允许暂停、断点修改、任意evaluate、拦截、Cookie或下载行为修改。
- 面板提供时间线、请求详情、案件/步骤/请求树、AST位置及参数名称、结构指纹差异、故障证据和JSONL/JSON/Markdown导出。所有存储和导出先允许列表脱敏。
- 同URL并发不强行归属案件。exact须直接标识证据，间接唯一候选为probable，多候选ambiguous，无证据unmatched。已有固定事件实时桥：仅向已识别的PatMail扩展app.html发送经过二次脱敏的有界批次，严格重建表达式校验；失败丢弃，不发往WIPO。没有CDP连接时保持缺失标记，也支持显式离线转换导入。
- 离线HTML/XML只解析脱离页面的文档，JS只建立AST，回执只读取安全类别；不导入执行器。Fixture明确标记来源，不把人工ok=true当成生产成功。

## 安全与评审

敏感样本覆盖原始ViewState、Cookie/Bearer、姓名/地址/邮箱、案号/reference、优先权、文件名/Base64、任意组件及异常文本。测试检查事件、错误对象、Observer实际快照持久化路径、三类报告及浏览器下载内容。

独立评审发现并修复了未调用函数、return后不可达语句、调用早于函数赋值、重复函数声明的执行提取风险；生成器和async包装也拒绝。静态AST元数据不能证明实际运行。移除了会造成浏览器`process is not defined`的Babel类型运行时依赖。深度命令不包含断点激活修改。

## 本次源码与覆盖清单

|范围|主要文件及变化|
|---|---|
|Trace与状态|新增`src/hague/diagnostics/{trace,store,errors,protocol,reports}.ts`、`schema.mjs`及声明；允许列表、层级状态、容量/时间限制和结构证据|
|AST|新增`src/hague/diagnostics/ast/analyzer.mjs`及声明；修改`http-driver.ts`的jsfAction、RemoteCommand、上传及表格配置读取；每链WeakMap缓存避免反复解析未变化的脚本|
|应用调用链|修改`draft-runner.ts`、`draft-contract.ts`、`http-context.ts`、`http-client.ts`及`background/hague-http.ts`、`background/hague-draft.ts`；可选Trace元数据及结构化异常保持旧调用兼容|
|Observer|修改既有`scripts/cdp-observer{,-core}.mjs`；新增`hague-diagnostics.mjs`、`hague-diagnostics-bridge.mjs`及声明、`hague-diagnostics-export.mjs`；没有第二个守护进程|
|指纹与离线|新增`diagnostics/{fingerprint,replay,fixtures}.ts`和`observer-adapter.mjs`及声明；HTML使用inert template内容，防止资源请求；不运行输入JS|
|前端|新增`src/app/components/HagueDiagnostics.vue`；修改`HaguePage.vue`传递Trace和展示面板，保留原业务入口|
|依赖|`package.json`、`pnpm-lock.yaml`加入Babel parser 7；没有Babel types运行时依赖|
|测试|新增8个`tests/unit/hague/diagnostics-*.test.ts`、2个Observer/桥测试；扩展HTTP、Runner及既有Observer回归；新增诊断UI/真实隔离CDP E2E，旧导入E2E适配封装确认框|

已有会话保活、历史草稿恢复等未提交改动保留；并未将其算作本次新增诊断实现。

应用审计D表共7类盲区，其中6类增加了可测试的结构化证据渠道（RPC、JSF、DOM、实例/请求关联、动态协议拒绝、故障汇总）；第7类“真实生产页面版本”仍待经授权的现场采样。这是证据渠道覆盖数，**不是生产异常修复率或所有样本适配率**。

HTTP实际值按100～599保留，无响应为null；测试矩阵覆盖302、400/401/403/404、429、500/502/503/504/524，另测200成功/校验失败、登录HTML200、Abort、超时及RPC失败。额外发现并修复RPC不响应时外层60秒Abort无法终止等待的问题：等待响应现在遵从所属Context的signal；超时保持uncertain，不代表撤销已送到服务器的请求，迟到回执不触发重发。

JSF覆盖完整HTML、partial XML、redirect、多个update、ViewState、ViewRoot和DataTable行更新，分别识别parsererror/error/validationFailed/空响应/MIME错误/缺失目标。insert/delete明确unsupported停链。AST支持PrimeFaces.ab、mojarra.ab、jsf.ajax.request、mojarra.jsfcljs、可证明的RemoteCommand/包装与别名、Widget/FileUpload/DataTable；这是人工Fixture支持清单，不能写成实站均已观测。

应用内case/step/request Trace精确关联；CDP网络按自身requestId和session/target/frame归并。跨系统唯一间接候选仅probable，六路同URL冲突ambiguous，先后顺序不满足或缺证据unmatched；这些请求仍不能可靠归属具体案件。旧调用方error字符串继续兼容；前置材料/检查点校验没有发出请求时，不补造网络事件。

CDP能够记录安全路径、方法、真实状态、资源/MIME类别、耗时、字节数、重定向及失败类别，深度模式另加脚本摘要/AST位置。隔离Chrome已实际验证Debugger非暂停保护、scriptParsed/getScriptSource、静态提取、隐私和disable清理；所读为人工脚本，未读取真实WIPO源码。对应命令：`HAGUE_TEST_CHROME=... node tests/e2e/hague-diagnostics-cdp.e2e.mjs`。

## 性能实测

本机Node v26.13.0 / win32，2026-11-13T13:50:11.052Z，合成10000事件：关闭采集0.648ms，开启采集252.358ms，增加约25.17µs/事件；AST单段首次7.50ms，缓存1000次9.67ms。原始结果为 `test-results/hague-diagnostics-perf.json`；复现命令 `pnpm exec vitest run tests/unit/hague/diagnostics-performance.test.ts`，每次机器负载不同，数值会变化。

Observer独立合成测量记录在 `test-results/hague-observer-perf.json`。以上是采集器与AST的局部测量，**不是实际WIPO业务总耗时或Vue完整渲染开销**。初始预算为应用事件5000条/4MB/24小时，AST源码大小/节点/深度/时间及解码层数有界、按需解析与缓存；源码解析器同步调用无法在中途抢占，仍有最大输入限制。生产六路长批次的端到端开销尚未测量。

## 验证命令与范围

在`patmail-extension`执行：

```powershell
pnpm test
pnpm typecheck
pnpm lint
pnpm build
$env:HAGUE_TEST_CHROME='C:/Users/Administrator/AppData/Local/Google/Chrome/Application/chrome.exe'
node tests/e2e/hague-diagnostics-ui.e2e.mjs
node tests/e2e/hague-draft-ui.e2e.mjs
```

全量测试、类型检查、生产构建及ESLint基线门禁均以最终执行结果为准；`pnpm lint`是存量基线门禁，不代表仓库零Lint问题。本次新增核心文件另做定向ESLint检查。合成状态矩阵覆盖302、400/401/403/404、429、500/502/503/504/524、超时、Abort、RPC断连、登录HTML200、空响应、MIME/XML错误；HTTP503有注入fetch→后台RPC→客户端→Context的贯穿测试。

隔离Chrome仅访问localhost，外网请求全部拒绝，诊断验收实际外网请求数0。截图在 `test-results/hague-diagnostics-ui/panel-desktop.png` 和 `panel-narrow.png`，测试结果及真实导出位于同目录。未连接日常Chrome做业务回归，未改变用户下载配置。

## 尚未验证与有意边界

1. 未开启真实WIPO深度源码采集，未批量创建草稿、上传材料或正式递交。Fixture支持形式不能写成“生产已观测”。实站写入仍需单独明确授权。
2. 实时CDP桥已做隔离Fixture及命令策略验证，尚未做用户日常Chrome现场连接验收；没有历史协议数据库或万能反混淆。提供离线转换和显式指纹比较。缺失证据在UI保留标记。
3. HTTP fetch自动跟随重定向只能报告最终状态；中间302须CDP证据，不能虚构。JSF insert/delete当前unsupported停链。
4. 未知协议会安全停止写入，可能要求新增脱敏Fixture后适配。不能承诺所有历史及未来WIPO样本均适配，也不能以诊断成功代替业务成功。


## 最终检查结果（2026-11-13）

- 全量 `pnpm test`：257文件、1704测试通过，退出码0。
- 新增诊断核心、HTTP/RPC、Runner、AST、桥接脚本及相关测试的定向ESLint：退出码0。全仓库`pnpm lint`存量基线门禁通过，仍有既有Lint债务。
- 隔离Chrome诊断面板（包含固定CDP事件接收）、导出/回放/隐私、1440/860视口通过；外网请求0。草稿UI既有Page路径回归也通过；材料导入/预览/独立滚动Fixture通过。旧导入E2E补充点击已封装的材料确认弹窗，避免停在确认处误判超时。
- 独立代码审查通过；曾发现的AST控制流/绑定问题已有反例测试，固定CDP→UI桥完成独立安全审查。
- 生产构建包含完整类型检查；服务按项目要求停止后重新启动，深度采集保持off。服务曾被动连接5个目标；最后一次重启后状态为waiting、0目标，logWriteFailures=0、深度off（以实时`pnpm cdp:status`为准）。被动连接不证明真实业务写入正确。旧版页面尚未加载新诊断接收器时桥状态不可用，须按常规方式重载扩展/页面后使用新UI。
