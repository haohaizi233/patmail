## CDP 诊断日志

- 排查 PatMail 的查询、命名、打包、下载、后台回执或浏览器连接问题时，先读取本项目 `log/cdp/status.json` 和最近的 JSONL 日志，沿 requestId / progressId / taskId 关联事件，再决定是否需要现场连接。日志仅在本机保存最近 24 小时。
- 根目录和 `patmail-extension` 的 `pnpm build` 都会启动或复用 CDP 日志服务。状态命令是 `pnpm cdp:status`，手动启动是 `pnpm cdp:start`，停止是 `pnpm cdp:stop`。端口变化时用 `pnpm cdp:start --endpoint ws://127.0.0.1:<port>/devtools/browser` 更新配置。
- 修改监听脚本后，执行 `pnpm cdp:stop` 再启动，使新代码生效；普通业务代码编译可复用原服务。重连如出现 Chrome 授权提示，需要用户在浏览器允许连接。
- 用户日常 Chrome 的只读监听必须使用原生 CDP 协议。不要用 Playwright `connectOverCDP()` 建立监听：其默认下载行为可能把真实下载重定向到 `playwright-artifacts` 并改为 UUID 保存名。
- 监听器不允许设置下载行为、触发业务操作，或记录 Cookie、请求头、密码、正文、下载令牌和完整业务清单。真实浏览器回归应保留用户下载位置与文件名；隔离测试浏览器可使用 Playwright。
- 使用与维护说明见 `patmail-extension/docs/cdp-observer.md`。日志目录是本机生成物，不提交到 Git。
