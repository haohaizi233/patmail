# 本机 CDP 日志服务

服务使用 Node 原生 WebSocket 连接 Chrome CDP，记录 PatMail / EASY 的下载链路及季华 OA 文件导入诊断。根目录和扩展目录的 `pnpm build` 都先启动或复用服务，再执行编译。重复编译不会重复创建监听进程；Chrome 暂时未开启 CDP 时服务保持等待并重连。

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

例如，`rowErrorCategories.http_524` 增加时，应关联 `source: "jihua"` 的上传路由状态和耗时；`pendingReceiptCount` 表示已发送而尚未保存成功附件回执的行数，不表示可安全重新上传。历史事件无法补采；2026-11-02 更新前的守护进程没有选择 OA 页面。

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
