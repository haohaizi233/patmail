# 命名批量 40、命名并发 2 路与掉登录误判修复（v1.4.7）

## 现场现象

1605 个文件下载命名期间，DevTools 同屏出现 5–6 条 `CaseInfo.ashx`（`Call=GetFileName`，都在途）与多条 `Login.ashx`（`Call=GetUserModel`）；`Login.ashx` 一条挂 15–16 秒后 (canceled)。同屏还出现 `CaseInfo.ashx` 失败条目。用户结论：6 条并发打满同源 6 条连接时容易「掉线掉登录」。

## 根因

1. 命名并发 6 路把浏览器对同源的 6 条连接全部占满，会话检测 `GetUserModel` 排不上队，15 秒默认时限一到就被掐成 `REQUEST_TIMEOUT`（DevTools 里的 canceled 就是这个主动 abort）。
2. 检测失败被当成「没登录」：`SessionService.check` 把任何失败都写成 `error`/`expired`，后台 `readBoundSession` 再把连接状态降级并清空身份，工作台随即显示「尚未连接 / 请先登录」。于是「检测慢」被报成「掉登录」，还会带出一轮又一轮的检测请求。

## 改动

- **命名一批 40 个**（原 100 个）：100 个一批单批要跑几分钟，中途一断整批重来；40 个一批是单批耗时与往返次数的折中。往返次数随批量从 17 升到 41，但每批都短，失败重来的代价小。
- **命名并发 2 路**（原 6 路）：给会话检测和其他请求留出连接。翻页、递交导出保持 6 路不动。
- **超时不再判掉登录**：`SessionService` 只有明确的「没登录」（`IsLogin=false`、登录页跳转、HTTP 401）才把状态改成失效；超时、网络、网关、畸形响应在已登录时保持登录状态，检测结果如实报错。`confirmAccountRead` 在这种情况下按上次登录继续，业务请求真掉登录会自己报 `SESSION_EXPIRED`。
- **后台连接状态同步收紧**：`readBoundSession` 遇到瞬时失败且当前已连接时不动状态、不清身份，只有 `SESSION_EXPIRED` 才降级。会话检测时限从 15 秒放宽到 30 秒，排队慢也不误判。

## 验证

- `tests/unit/mail/download-name.test.ts`：265 个文件 7 批、并发峰值 2、乱序完成仍逐项对应、进度按完成文件数递增；失败与取消不再派发后续批次。
- `tests/integration/easy/download-files.test.ts`：101 个文件 3 批（40、40、21）乱序返回后仍打成一个包。
- `tests/integration/easy/easy-session.test.ts`：已登录后超时、网关、畸形响应都保持登录态，明确没登录才判失效。
- `tests/integration/background/session-transient.test.ts`：后台会话复查遇瞬时失败保持连接与身份；`SESSION_EXPIRED` 才判掉登录；未登录时检测失败如实报错。
- `tests/e2e/download.e2e.mjs`：141 文件 4 批命名（40×3+21）、在途峰值 2、批次乱序返回、打包字节流式上报、浏览器下载终态与落盘字节一致。

## 边界

- 命名总耗时仍取决于服务端逐名生成；2 路并发比 6 路慢，这是拿速度换稳定。还想再快可以调 `NAME_BATCH`/`NAME_CONCURRENCY`，但 6 路打满同源连接会复发掉登录误判。
- 翻页、递交导出保持 6 路并发：都是短请求，未纳入本次压降。
- 「检测失败保持登录」意味着界面在探测失败期间沿用上次状态；真正的掉登录由业务请求的 `SESSION_EXPIRED` 或下一次成功的检测纠正。
