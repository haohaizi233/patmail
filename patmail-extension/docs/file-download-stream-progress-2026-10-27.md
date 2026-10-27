# 下载去点证据、双下载根因、命名批量与下载进度（v1.4.6）

## 222.har 实测证据（1605 个文件）

用户提供的 `222.har` 共 180 条请求。同一批 1605 个 `file_no` 出现两条 `BaseInfo.ashx Call=DownLoad`：

| 开始时间 | 类型 | 发起方（initiator 栈） | 耗时 | `file_name` 去点 |
| --- | --- | --- | --- | --- |
| 08:38:15.299 | fetch | `chrome-extension://…/content.js` 的 `sendForm → postOnce → post → downloadFiles` | 857 秒 | 1605 条全部已去点 |
| 08:38:29.600 | xhr | 原站 `jquery.js → public.js Ajax.Request → DownLoad → FileSearch.js Success:1722` | 530 秒 | 1605 条全部保留校验点 |

两条请求的 `file_no` 完全相同，`file_name` 同序对应：插件那条 `2023101576258-离心雾化器及其控制方法-发明专利证书(签章).pdf`，原站那条 `202310157625.8-离心雾化器及其控制方法-发明专利证书(签章).pdf`。逐条检查插件那条的 1605 个名字，申请号校验点残留为 0。

「去点算法没有用到」的观感来自第二次下载：原站链路的包名原样带点，或看的是 xhr 请求的 `file_name`。去点只作用于插件这条链路，算法与勾选都正常。

## 双下载根因

原站 `FileSearch.js` 第 70 行 `$("#btn_Down").bind("click", FileManager.DownFile)`。`FileManager.DownFile` 读页面勾选与 `#selfilename*` 下载名称，先发一次 `GetFileName`，在其 `Success`（1722 行）里调 `DownLoad`，再由 `GetFile` 挂隐藏 iframe 到 `FileHandler.ashx` 取包。这条链路不带任何去点逻辑。

插件全库只有工作台 `FileSearchQuery` 的「下载已选」下发 `DOWNLOAD_FILES`，没有任何代码点原站 `#btn_Down` 或调 `FileManager.DownFile`。HAR 里那条 xhr 的发起栈直接落在 `FileSearch.js`，说明原站按钮流程被页面自己跑了一遍。HAR 中没有它的 `GetFileName`：1605 个名字的单次命名在服务端要跑十几分钟，这次请求早于录制开始，完成时间（08:38:29）正好接到它的 `Success → DownLoad`。

于是浏览器下载两次：插件的 `下载文件-时间戳.zip`（名字已去点），和原站取包的压缩包（名字带点）。使用口径：同一批文件只点插件「下载已选」，不要再点原站「下载」；两个包都会占服务器的打包时间，互相排队只会更慢。

## GetFileName 每批 100 个

- `NAME_BATCH` 从 20 提到 100：1605 个文件从 81 次往返减到 17 次，仍是原站逐个生成名称，只是减少往返。并发保持 6 批。
- 命名接口不再设总时长：20 个一批时单批实测 23–56 秒；此前 100 个一批的探测超过 90 秒仍未完成。100 个一批单批可能要几分钟，固定的 120 秒会把能成功的命名掐成「下载停了」。现在与原站 jQuery 一样不设总时限，显式取消仍然生效。
- 减少往返不改变服务端按名称数计时的事实；总耗时仍取决于服务器。

## 打包与下载的流式输出

打包阶段保持原有行为：响应分块到达时按真实收到的字节上报「打包响应 KB」，不伪造压缩百分比。

下载阶段新增流式输出和终态追踪：

- `SAVE_DOWNLOAD` 带上 `progressId`，后台 `chrome.downloads.download` 后把 `downloadId` 返回。
- 后台新增 `DOWNLOAD_STATE`：只做一次 `chrome.downloads.search` 状态回读，不占后台定时器，下载再久也不怕 Service Worker 重建丢进度。
- 内容脚本用 [download-outcome](../src/utils/download-outcome.ts) 每秒回读：字节数变化才上报 `phase=downloading`（`receivedBytes`/`totalBytes`），不变的在途状态不重复报；完成或中断是唯一终态。
- 最终结果等浏览器下载终态再定：`complete` 报「浏览器下载完成（字节数）」；`interrupted` 返回失败并提示重新下载；终态读不到（旧后台、任务被清掉）时保持「已交给浏览器下载」的口径。
- 完成瞬间 `bytesReceived` 偶尔还是 0，用 `totalBytes` 补足，最终提示不会写成「0 字节」。

## 验证

- 全量 Vitest 134 个文件、858 个用例通过；`vue-tsc --noEmit` 与两段生产构建通过，产物版本 1.4.6。
- `tests/e2e/download.e2e.mjs`：141 文件触发 2 批命名（100+41），批次乱序返回仍逐项对应，只打包一次、只取包一次；打包响应字节分 4 次递增上报；下载阶段报一次 `inProgress`、一次 `complete` 终态；最终结果带「浏览器下载完成（22 字节）」，浏览器下载记录 `complete` 且磁盘字节与 ZIP 夹具一致。
- `tests/e2e/download-editor.e2e.mjs`、`tests/e2e/file-pages.e2e.mjs` 回归通过。
- 单元与集成覆盖：641 文件 7 批乱序回填与并发峰值 6、GetFileName 无总时长、`watchBrowserDownload` 的字节去重/终态/读不到任务放弃/取消、进度守卫与消息校验（`SaveDownload` 的 `progressId`、`DownloadState` 三态）。

## 边界

- 本次没有在真实服务器重新打包上千个文件实测 100 个一批的真实耗时；222.har 的 1605 个文件仍是 20 个一批跑出来的。单批耗时按服务端逐名生成推算，超时已不设上限。
- iframe 兜底（后台没接住下载时）不追踪下载终态，仍按「另存走了浏览器直接下载」提示，文件名以下载记录为准。
- 去点只改插件链路传给 `DownLoad` 的 `file_name`；原站自己的下载按钮不会去点。
