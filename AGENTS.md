## CDP 诊断日志

- 排查 PatMail 的查询、命名、打包、下载、后台回执或浏览器连接问题时，先读取本项目 `log/cdp/status.json` 和最近的 JSONL 日志，沿 requestId / progressId / taskId 关联事件，再决定是否需要现场连接。日志仅在本机保存最近 24 小时。
- 根目录和 `patmail-extension` 的 `pnpm build` 都会启动或复用 CDP 日志服务。状态命令是 `pnpm cdp:status`，手动启动是 `pnpm cdp:start`，停止是 `pnpm cdp:stop`。端口变化时用 `pnpm cdp:start --endpoint ws://127.0.0.1:<port>/devtools/browser` 更新配置。
- 修改监听脚本后，执行 `pnpm cdp:stop` 再启动，使新代码生效；普通业务代码编译可复用原服务。重连如出现 Chrome 授权提示，需要用户在浏览器允许连接。
- 用户日常 Chrome 的只读监听必须使用原生 CDP 协议。不要用 Playwright `connectOverCDP()` 建立监听：其默认下载行为可能把真实下载重定向到 `playwright-artifacts` 并改为 UUID 保存名。
- 监听器不允许设置下载行为、触发业务操作，或记录 Cookie、请求头、密码、正文、下载令牌和完整业务清单。真实浏览器回归应保留用户下载位置与文件名；隔离测试浏览器可使用 Playwright。
- 使用与维护说明见 `patmail-extension/docs/cdp-observer.md`。日志目录是本机生成物，不提交到 Git。

## 子代理模型约束

- 所有新建或继续执行的子代理统一使用 `gpt-6-luna`；调用派生工具时显式指定该模型，不继承主代理模型。
- 不续用已按其他模型创建的子代理；需要接续其任务时，新建 `gpt-6-luna` 子代理接管。
- 主代理模型保持原设置。子代理模型不可用时由主代理接管并说明原因，不得擅自升级或切换其他模型。
- Codex 用户级 TOML 使用 `[agents]` 下的 `default_subagent_model = "gpt-6-luna"`；已有其他配置与安全约束必须保留。

## 工作流 WAL

- 新建工作流的 EASY 请求统一使用 `createWorkflowBridge` 并提供稳定的工作流标识。后台默认由 `WorkflowWal` 保护，只有确认无副作用的请求才可在后台声明为只读。写操作无需逐个登记才能获得保护。
- WAL 范围包含站点和登录人。一次性操作还需使用稳定的业务标识，确保刷新和重启后仍可识别同一次写入。只有确认成功的回执才能结束待核验状态。
