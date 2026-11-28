# 本机 CDP 日志服务

服务使用 Node 原生 WebSocket 连接 Chrome CDP，记录 PatMail / EASY 的下载链路、季华 OA 文件导入诊断及 WIPO 海牙（`https://hague.wipo.int`）页面诊断。根目录和扩展目录的 `pnpm build` 都先启动或复用服务，再执行编译。重复编译不会重复创建监听进程；Chrome 暂时未开启 CDP 时服务保持等待并重连。

日志目录是项目根的 `log/cdp`，即 `D:\desktop\project\patmail\log\cdp`。按 UTC 小时分 JSONL 文件，每 60 秒清理超过 24 小时的记录，包括处于保留边界的文件；例如文件名中的 `03` 时对应北京时间 `11` 时。配置和当前服务状态保存在同目录的 JSON 文件中，整个 `log` 目录由 Git 忽略。

```powershell
pnpm cdp:status
pnpm cdp:start
pnpm cdp:stop
```

端口不需要硬编码。服务按顺序解析 CDP 地址：`--endpoint` 参数 → 从浏览器用户数据目录的 `DevToolsActivePort` 读取当前调试端口并探测 `/json/version` 广播的 WebSocket 地址（只接受本机回环地址，非本机广播会被忽略）→ 若 `/json/version` 未广播地址（部分新版 Chrome 会返回 404），则对 `DevToolsActivePort` 记录的 WebSocket 路径与通用路径 `/devtools/browser` 依次做 WebSocket 握手实测，取第一个连通的地址，全部连不通则视为暂无端点 → 复用 `log/cdp/config.json` 中上次成功的地址 → 暂无地址。扫描的用户数据目录覆盖 Windows/macOS/Linux 上的 Chrome、Edge、Chromium、Brave 默认位置，也可用环境变量 `PATMAIL_CDP_USER_DATA_DIRS`（多个路径用系统路径分隔符 `;` 或 `:`）指定自定义目录。每轮重连都会重新发现端口，浏览器重启换了端口也能自动接上。

电脑上没有任何 CDP 端点时，`pnpm cdp:start` 不会报错退出：服务照常启动并保持 `waiting`，每 5 秒重新探测一次，浏览器开启 CDP 后自动连接。`--endpoint` 仅在需要固定地址时使用，例如 `pnpm cdp:start --endpoint ws://127.0.0.1:49323/devtools/browser`，该地址会写入配置并锁定，之后不再自动发现。只允许本机 CDP 地址。服务并不自动开启 Chrome 远程调试，也不会越过 Chrome 的连接授权。`waiting` 表示服务仍在运行，但尚未建立 CDP 会话，此时不能采集浏览器事件；连接成功后状态变为 `connected`。Chrome 如弹出远程调试连接提示，需要用户允许连接。

普通业务编译复用正在运行的服务。监听脚本自身更新后，应先执行 `pnpm cdp:stop` 再启动；守护进程会读取新代码。Node 20 使用内置 WebSocket 的实验开关，Node 22/24 使用已提供的全局 WebSocket，不依赖 Playwright。

排查问题先看 `log/cdp/status.json`，确认监听状态和心跳，再按日志时间读取相应 JSONL，关联请求编号、任务编号和进度编号。事件包括网络调用名称/状态/耗时、错误、命名和打包进度、流命令元数据、浏览器下载状态/文件名/字节数。不会保存 Cookie、请求头、密码、完整请求表单、响应正文或下载令牌。

## 季华文件导入

监听精确的 `https://oa.jihualab.net` 页面（默认 443 端口）。`source: "jihua"` 的网络记录只包含固定路由类型、HTTP 状态、MIME、耗时和字节数；案件 ID 和申请号查询参数不入日志，也不记录上传文件名、请求头或正文。控制台与异常只记录错误类别，不记录平台的原始报错内容。监听器忽略 `PATMAIL_JIHUA` 消息的原始 payload，避免暂存分块进入日志。

每 15 秒尝试读取扩展已有 IndexedDB 的最新导入任务，以 `kind: "jihua.task"` 记录有变化的汇总：任务状态、行数、选中数、各行状态数量、已发送数、未确认回执数，以及分开的行错误/任务错误类别。读取使用 readonly 事务，1.5 秒超时，最多统计 50,000 行和 500 条任务错误；不创建数据库、不改检查点、不读取文件正文。没有 `indexedDB.databases()` 时跳过该项。汇总不包含申请号、案件名、相对路径、文件名、附件 ID 或完整错误文本。

`failedReasons` 和 `unmatchedReasons` 分别只统计当前失败、没匹配到的行，使用固定原因枚举区分材料未登记、台账不支持、案件不存在、申请号格式、文件真实类型、原回执不可用等。`taskReasons` 是保留的任务错误分类，`lastTaskReason` 是最后一条任务错误类别；它们不能当作本轮 HTTP 失败次数。`pauseReasonCode` 只记录当前暂停原因的固定类别，不输出原始错误。旧 `rowErrorCategories` 继续保留历史兼容语义。

`recovery` 仅包含退避探测次数、最大次数、下次探测时间和固定原因代码，便于区分自动恢复与等待人工继续；不会记录原始异常或业务清单。

网络响应在 CDP 提供有效时间分段时，还记录 `connectMs`、`sendMs`、`responseWaitMs` 三个数值，分别用于区分建连、发送数据、发送结束后等待响应头的耗时。不会保存响应头或正文；旧事件无法补采这些分段。

例如，`rowErrorCategories.http_524` 增加时，应关联 `source: "jihua"` 的上传路由状态和耗时；`pendingReceiptCount` 表示已发送而尚未保存成功附件回执的行数，不表示可安全重新上传。历史事件无法补采；2026-11-02 更新前的守护进程没有选择 OA 页面。

## WIPO 海牙（Hague）

监听精确的 `https://hague.wipo.int` 页面（默认 443 端口，包括 `https://hague.wipo.int/#/landing/home` 等前端路由）。`source: "hague"` 的网络记录只保留 HTTPS `wipo.int` 域名的 `origin`、`path`、HTTP 状态、MIME、耗时和字节数，不记录查询参数、URL 片段、请求头、Cookie 或请求/响应正文。扩展 `manifest.json` 的 `host_permissions` 同步包含 `https://hague.wipo.int/*`。

## 下载 UUID 保存名的原因与恢复

2026-10-31 的临时监听器曾使用 Playwright `connectOverCDP()` 连接用户 Chrome。连接时默认接管下载行为，导致文件保存至 `C:\WINDOWS\TEMP\playwright-artifacts-...\<UUID>`，文件没有 `.zip` 后缀，浏览器下载列表和资源管理器因此显示 UUID 名称及不明文件图标。

这轮下载实际已完成：原下载项 #284 的 MIME 是 `application/zip`，文件长度 659404073 字节，正文签名为 ZIP。已将该完整文件复制回 `D:\MemoryLeak\下载\季华递交合并档.zip`，复制前后 SHA-256 相同，494 个 ZIP 条目的 CRC 全部通过。旧下载记录仍可能显示旧 UUID 名称，它不会因另存文件而自动改名。

已通过原生 CDP 恢复 Chrome 默认下载行为。长期监听器完全不使用 Playwright，也不允许发送 `Browser.*` 控制命令；它只通过 CDP 读取状态、接收事件并安装记录消息的监听函数。不要将测试浏览器的自动接收设置应用到用户日常浏览器。

恢复证据保存在本机 `patmail-extension/test-results/cdp-watch/restored-archive.json`、`restored-archive-crc.json`，不提交 Git。

## 本机验证记录（2026-10-31）

- 日志服务定向测试 23/23 通过；两个脚本的 Node 语法检查通过；三个新增代码文件直接 ESLint 为 0 errors / 0 warnings，项目 lint 基线门禁通过。
- 根项目和扩展项目构建通过，均能启动或复用同一监听进程。
- 并发启动检查复用同一个 PID，没有创建第二个服务。
- 实际文件清理验证：删除过期小时文件，删除边界小时中的过期记录，保留边界小时中的新记录。
- CDP 断线后服务保持运行并重连，恢复后重新发现 3 个相关目标。
- 独立 TCP 握手回归通过：连接尚未建立时停止服务，会关闭待连接套接字并退出，不留下无锁后台进程。
- 下载恢复后的小 ZIP 验证：Chrome 使用原始 `.zip` 文件名保存至 `D:\MemoryLeak\下载`，下载状态为 `complete`，文件存在且 ZIP 签名正确。

原来一轮 495 个候选附件的日志显示：取名 495/495、入包 493、跳过 2，浏览器下载完成；这轮没有再次触发“后台回执尚未确认”。恢复后的压缩包包含 493 个附件和 1 份下载失败清单。

## 海牙深度诊断（随CDP自动开启研究模式）

复用现有原生 WebSocket 守护进程。先查看 `log/cdp/status.json` 和最近 JSONL；不要为了检查状态重新连接浏览器。修改脚本后下次使用前按原流程停止再启动。服务启动并附着海牙页面后自动开启research；尚未连接或没有海牙页面时等待，不制造业务请求。

在 `patmail-extension` 目录运行：

```powershell
node scripts/cdp/cdp-observer.mjs deep-status
node scripts/cdp/cdp-observer.mjs deep-enable --target <已授权海牙标签页的CDP-targetId>
node scripts/cdp/cdp-observer.mjs deep-disable
```

自动研究仅针对已附着的 `https://hague.wipo.int` 页面；按初始化就绪顺序启用一个目标，已有目标时保持稳定，多个就绪候选按targetId排序。手动deep/research-enable可用targetId指定目标并接管自动选择。控制接口沿用本机随机端口与认证令牌；令牌禁止粘贴到日志或报告。采集资源和请求租约只驻留内存，断线/导航会销毁；自动模式随后为新Session/页面重新建立采集。手动basic、deep-disable或research-disable关闭自动研究，在本次守护进程运行期间保持关闭；重新启动CDP服务恢复默认自动开启。浏览器提示连接授权时需用户允许，不能绕过。

Debugger 先设置 `skipAllPauses=true` 再 enable；禁止设置、删除或修改断点及断点激活状态；方法不支持时降级关闭。禁用调用 Debugger.disable 并清空脚本状态，原基础观察会话继续使用。仅读取当前目标同源脚本，每会话最多32个，每个128,000字符，总计2,000,000字符，分析后仅输出哈希/静态调用计数/未解析数。deep模式不读取响应正文；research会按准入预算临时读取JSF响应并解析，原文不入日志。请求头及Cookie不落盘，不设置下载行为，不影响独立的离线PDF调试会话。

应用 Trace 通过固定 CustomEvent/binding 入口传给日志并再次按共享Schema过滤。CDP到面板使用固定安全事件实时桥接，发送成功时状态为 `hagueCdpUiBridge=available`，未连接或失败时为 `unavailable`；面板仍可显示应用Trace，离线导入报告可分析CDP证据。无直接证明的请求不能声称精确归因。

### 离线导入观察日志

实时CDP回流缺失时，先在本机将Observer JSONL转换为面板可接受的version1 Trace JSONL，再通过诊断面板离线回放导入：

```powershell
node scripts/hague/diagnostics/hague-diagnostics-export.mjs ../log/cdp/<日志文件>.jsonl ./test-results/hague-safe-trace.jsonl
```

导出限32MB输入、20,000条记录；仅转换已知海牙network事件、安全应用Trace和版本化AST元数据，其余丢弃。导出不产生业务网络请求，不给CDP事件补造案件ID，关联默认为unmatched。原始源码、正文、输入值不会进入转换结果。AST只公开经过共享Schema过滤的call类型、组件/表单/process/update、参数名称、安全位置和哈希，明确为静态证据。

原有draftTexts页面探测仍存在，但落盘仅保留条数和类别。海牙页面的topProgress/exportNotice也只保留运行/完成/错误/待核对/提示类别，避免姓名、地址、reference或文件名通过提示文字泄露；其他应用页面仍保留原有脱敏展示逻辑。

应用到CDP的归因补充：当应用诊断模式开启，原有已授权注入请求在发送前调用固定的 `__patmailCdpObserver` binding，仅传脱敏Trace请求元数据，不执行任意脚本。Observer只接受已由应用目标观察到的相同traceId/requestId/caseRunId/method/path，frame来自当前Hague执行上下文的CDP auxData而非页面payload。唯一一致候选为probable；六路同URL候选为ambiguous；没有直接CDP requestId证据不提升为exact。基础Runtime binding不启用深度Debugger，不读取源码。

若应用事件尚未到达守护进程、执行上下文创建事件缺失、目标刷新/断线或请求绕过该固定入口，归因保持unmatched；不会为消除缺失而重发请求。上下文销毁、清除、detach及断线会清除对应归因状态。此桥为应用→Observer证据桥，CDP→UI实时桥仅向已选定PatMail应用页面发送经过过滤的固定事件；离线导出仍可进入面板。

实时回流新增固定 `patmail-hague-cdp-trace` 事件。仅向现有选定、已知扩展ID的 `/app.html` 页面发送；绝不向WIPO目标运行表达式。命令独立校验为固定Runtime.evaluate事件分发器，数据先经共享Schema过滤，最多128条排队、每批16条/64KB、最多6个应用目标，每250ms发送；失败丢弃且不重发业务请求。深度策略仍拒绝任意Runtime.evaluate。连接断开或服务停止清空队列；UI诊断关闭时忽略事件；事件不回流应用Trace，避免回声循环。实时浏览器验证未进行。


## 2026-11-14 Research Mode

新增显式 `research-enable --target TARGET_ID`、`research-status`、`research-disable` 和 `basic` 命令（入口仍为 `node scripts/cdp/cdp-observer.mjs`）。按用户2026-11-14的新要求，普通start/build随CDP默认启用自动研究，附着到海牙页面后开始采集。正文仅在受控研究准入下短暂读取解析，原始正文不入日志；全局普通方法允许表仍不提供任意getResponseBody转发。详情、预算、生命周期和验收见 [全链路研究诊断](hague-full-chain-diagnostics.md)。旧deep命令继续兼容。

自动研究每个Session/URL只尝试启用一次，不因轮询不断重置预算；导航/重连后以新生命周期重新尝试。失败只影响诊断，不触发业务操作。保留单目标架构，未同时读取所有海牙标签页；页面离开白名单时停止采集。
