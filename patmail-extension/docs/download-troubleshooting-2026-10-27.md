# 2026-10-27 下载停住排查

## 结论

本次复现中，原站打包成功后，HTTP 页面里的内容脚本调用 `crypto.randomUUID()` 抛出异常，导致 `SAVE_DOWNLOAD` 消息没有发送到扩展后台。浏览器未创建下载任务，后面的 iframe 兜底也没有执行。

修复位置：`src/utils/runtime.ts` 的后台消息 ID 生成。安全上下文继续使用原生 `randomUUID()`；HTTP 页面改用 `crypto.getRandomValues()` 生成 128 位随机消息 ID。此 ID 只用于请求/响应关联，后台允许最多 80 字符，不要求 UUID 格式。

## HAR 证据

来源：用户提供的 `222.har`，共 6 条请求。时间按 Asia/Singapore（UTC+8）展示。

| 开始时间 | 请求 | 耗时 | 结果 |
| --- | --- | --- | --- |
| 08:25:35.288 | `BaseInfo.ashx` / `DownLoad`，20 个文件 | 5481 ms | HTTP 200，返回 `file_guid` |
| 08:25:46.277 | 同一批文件再次 `DownLoad` | 5523 ms | HTTP 200，返回新的 `file_guid` |

其余 4 条是正常返回的 `GetUserModel` 登录检测。两次打包均返回 `ClientInfo.IsLogin=true`、`Status=true`、`Result=true`；响应同时带 `error=true` 和“文件不存在或权限不足,您共0个文件下载失败！”。原站这里的 `error=true` 不能单独当失败判断，`file_guid` 和失败文件数才是当前协议的判断依据。

HAR 没有 `FileHandler.ashx` 取包请求。页面 HAR 可能看不到扩展后台独立发起的下载，因此这个现象不能单独证明后台没有下载；以下浏览器复现确认了异常位置。

## 浏览器复现

使用 Chromium 加载修复前的本地 `dist`，通过本地 HTTP 代理响应全部浏览器请求。代理只返回夹具，不转发到真实业务服务器。使用原站 HTTP 地址保留非安全上下文条件，不能用 localhost 或 HTTPS 代替。

重放 HAR 的登录和打包响应后：

1. `DownLoad` 正常完成。
2. DevTools 异常暂停捕获 `TypeError: globalThis.crypto.randomUUID is not a function`。
3. 调用栈进入后台消息发送函数，随后内容脚本返回通用的“页面读取失败，请刷新后重试”。
4. 浏览器下载记录为空；本地代理没有接到 `FileHandler.ashx` 请求。

`randomUUID` 限制为安全上下文 API，`getRandomValues` 可在非安全上下文使用：[MDN randomUUID](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/randomUUID)、[MDN getRandomValues](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/getRandomValues)。

## 修复验证

- 新增两个回归用例，删除 `crypto.randomUUID` 后测试后台取包消息发送和并发请求的乱序响应关联。修复前两个用例因同一个 TypeError 失败，修复后通过。
- 下载及通信相关 5 个测试文件、18 个用例通过。
- 全量 Vitest：124 个测试文件、805 个用例通过。
- TypeScript 检查和两段 Vite 构建通过；构建目录为 `patmail-extension/dist`。
- `tests/e2e/download.e2e.mjs` 在真实 Chromium HTTP 页面验证 `isSecureContext=false`、`crypto.randomUUID` 不存在，再跑完整下载链路。修复后只打包一次、只取包一次，后台直接接住下载，下载记录为 `complete`，磁盘字节与本地 ZIP 夹具完全相同。
- 浏览器验证明细：`test-results/download-e2e.json`；全量测试日志：`test-results/download-fix-suite.log`。

浏览器回归使用的是 22 字节空 ZIP 夹具，验证下载链路和保存，不验证真实服务器的压缩内容、实际登录权限或大文件传输。测试另记录到原有文档检索 WASM 的 CSP 警告；下载回归仍完成，未在本次修改该模块。

现有代码仍只在浏览器接受任务后向界面返回成功，没有持续监听下载最终中断状态；iframe 兜底也不能确认是否落盘。这是另一个状态反馈缺口，不是本次已复现异常的触发点，本次保持最小修复。

## 使用更新后的插件

在扩展管理页重新加载使用 `patmail-extension/dist` 的 PatMail，然后刷新 EASY 原站标签页，并重新打开/刷新工作台，再试下载。内容脚本已注入旧标签页时，单独重新加载扩展不能更新那份脚本。

用户提到更早一次“XHR 下载完但没有保存”的具体原因，无法由这份 HAR 还原；XHR 接收完数据与创建浏览器下载任务是两个阶段。本次已定位并修复的错误发生在这两个阶段的交接处。
