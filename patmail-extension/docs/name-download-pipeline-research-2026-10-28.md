# GetFileName 五路并发与下载生产者消费者研究

日期：2026-10-28。此次产品改动仅将命名并发从 2 调到 5，每批仍为 40 个。流水下载为隔离实验，尚未接入“下载已选”。

> 后续：v1.4.8已据此接入流水ZIP和本机HTTP原生下载桥接，见 [实现与验收](streaming-download-2026-10-28.md)。下文保留研究阶段结论和样本边界。

## 结论

**GetFileName 与 Call=DownLoad 可以按文件或小批组成生产者消费者，真实站点已验证两阶段重叠。**

但现有“一次 DownLoad 生成整个 ZIP”的协议，需要提交完整的 `file_no` 和对应 `file_name`。原站当前前端和已观察的响应中，没有发现给同一个打包任务追加文件的接口。仅将 fetch 改成读取流，不能让这一次请求提前消费尚未生成的名称。

如果要求最终只有一个 ZIP、内容边取边写，需要在前端流式组包：命名生产者 → 有界就绪队列 → 单文件 DownLoad → FileHandler 响应流 → ZIP 写入器 → 文件写入流。这条路线的接口重叠和流式 ZIP 写入已分别验证，尚未完成整合后的正式功能及千文件验收。

## 当前链路与约束

源码位置：

- `src/mail/download-name.ts/resolveDownloadFileNames`：每批 40，最多 5 路，全部名称完成后返回按原偏移回填的数组。
- `src/api/client.ts/downloadFiles`：等待完整名称数组，构造一次 `DownLoad` 表单，再等待 `file_guid`。
- `src/api/file-download.ts/buildDownloadParams`：完整的 `file_no` 和 `file_name` 分号列表，一一对应。
- 原站存档 `../test-results/Scripts_Page_Patent_FileSearch.js/FileManager.DownFile`：同样在 GetFileName 回调里发起 DownLoad。
- 原站存档 `../test-results/Scripts_JSCOMM_public.js/DownLoad`：BaseInfo 返回句柄后调用 GetFile，后者使用 FileHandler 取文件。

DownLoad 的 JSON 字节数与真正文件传输的字节数是不同的指标。服务器内部如何压缩不对客户端开放，不能单凭固定 Content-Length 就断言内部实现；能确认的是当前协议没有暴露可供客户端增量追加的任务句柄。

## 2026-10-28 真实站点流水实验

脚本：`scripts/research-name-download-pipeline.mjs`。隔离扩展浏览器，重放 HAR 中的已有查询条件，仅取第一页 6 个文件。5 个命名生产者，每次命名 1 个（用于观察时序），有界队列容量 5，1 个消费者逐文件调用 DownLoad 和 FileHandler。产品批量仍为 40。

无人工延迟、没有 mock 业务响应。计时从开始命名算起，不含登录、查询或启动浏览器的时间。

| 事件 | 相对开始时间 |
|---|---:|
| 第一个名称返回 | 1.526 秒 |
| 第一次 DownLoad 发出，此时仅 1/6 名称完成 | 1.543 秒 |
| 第一次 DownLoad 返回句柄 | 1.752 秒 |
| 第一块文件正文被读取 | 2.243 秒 |
| 第一个文件读取完毕 | 2.704 秒 |
| 全部 6 个名称完成 | 3.012 秒 |
| 全部 6 个文件读取完毕 | 5.130 秒 |

命名在途峰值 5，队列峰值 4。6 个单文件响应均为 PDF（`%PDF` 文件头），总计 6,317,825 字节；逐份读取至 EOF，并与各自 Content-Length 核对。未聚合 Blob，未保存业务正文。

这说明：既能在全部命名结束前发起 DownLoad，也能在全部命名结束前读到文件正文。该实验没有写最终 ZIP、没有测试浏览器右上角的下载记录，也不能据此承诺 1605 个文件的总耗时或提速比例。

原始指标在忽略入库的 `test-results/name-download-pipeline-research.json` 与 `name-download-pipeline-live.log`。报告不包含凭据、查询条件、名称、文件编号、GUID 或正文。

复现需通过环境变量显式设置 `PATMAIL_LIVE_PIPELINE_RESEARCH=1`、`PATMAIL_AUDIT_USER`、`PATMAIL_AUDIT_PASSWORD`、`PATMAIL_AUDIT_HAR`，然后运行 `node scripts/research-name-download-pipeline.mjs`。凭据不得写入代码或经验文档。脚本存在 180 秒和总计 64 MiB 的研究护栏，不是产品的超时或大小上限。

## 此前已完成的流式写包实验

`scripts/research-download-streaming.mjs` 的隔离扩展 OPFS 原型，用两个真实文件执行单文件 DownLoad 和 FileHandler，把 Response.body 的块直接写入 ZIP 的 STORE 条目，最后补数据描述符、中央目录与结束记录。

- ZIP 最终 4,883,951 字节，2 个条目。没有把完整文件或最终 ZIP 聚合成 Blob。
- 最后一次实验首块正文写入完成于 418 毫秒；条目写入于约 2.069 和 6.022 秒完成。完整实验耗时含额外的校验复制，不作为下载性能基准。
- 独立 Python `zipfile.ZipFile.testzip()` 通过，两条目的 CRC 与目录可读取。临时文件与 OPFS 条目实验结束后清理。
- 这验证了 ZIP 可以在下载过程中逐块写出；尚不证明用户所选目标文件会在资源管理器中实时增大。OPFS 与用户可见文件、浏览器下载记录是三个不同的验证目标。
- 原型未提供 ZIP64、正式重试/取消、重名与目录处理、大规模内存测量。最大块大小不是峰值内存上限。

先前 20 文件整体打包样本等待约 27 秒才收到 331 字节 JSON；后续 FileHandler 很快开始传输约 61.8 MB。2 文件整体包已完整读取并核对 ZIP 结束目录。新鲜句柄交给 FileHandlerNew 也能成功取到 ZIP，但它仍需要先拿到句柄，不能据此视为提前输出或追加打包的入口。句柄可能仅能消费一次，替代路径必须使用新句柄测试。

## 可选路线

| 路线 | 命名与下载重叠 | 一个最终 ZIP | 浏览器右上角下载记录 | 代价 |
|---|---|---|---|---|
| 保留现有整体 DownLoad | 否 | 是 | 已有 | 仍需等全部命名、服务端准备 |
| 命名一小批就 DownLoad 一小批 | 是 | 否，多个独立包 | 可沿用已有链路 | 改动较小，不能把多个 ZIP 的字节直接拼成单个正常 ZIP |
| 单文件流 + 前端流式 ZIP | 是 | 是 | 需要另行打通 | 要实现 ZIP64、背压、取消和可靠落盘 |

如果核心目标是“一个包、不等全部命名、边取边写”，建议验证第三条路线。名称按批生成，已命名文件进入有界队列；消费者按需逐个取流，写入经过验证的 ZIP64 实现。不要为每个文件同时启动 fetch，也不要先下载所有小包再聚合成 Blob。

File System Access 可将写入流接到用户选择的文件，但应在用户点击时取得文件句柄，再启动长任务；它不会自动创建 chrome.downloads 记录。Chrome 官方也说明，写入在关闭流前不会反映到原目标文件，因此不能将“写入器已收到字节”承诺为资源管理器中目标文件实时增长。见 [Chrome 文件写入说明](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access)。

流式 ZIP 可采用支持 Web Streams 和 ZIP64 的成熟库，例如 [zip.js ZipWriterStream](https://gildas-lormeau.github.io/zip.js/api/classes/ZipWriterStream.html)；本次没有安装依赖或替换产品下载逻辑。

如必须保留浏览器右上角的同一个下载任务，另需响应流到原生下载的桥接。独立 MV3 虚拟 URL 实验没有建立有效通路；连静态对照的原生下载都失败，该阴性结果不能证明所有扩展流式方案都不可行。[StreamSaver 的原始说明](https://github.com/jimmywarting/StreamSaver.js/blob/master/README.md) 给出了辅助页面与 Service Worker 的路线，但本项目尚未验证，涉及辅助源的托管和信任，不能当成现成能力。

## 正式实现前要验证的边界

1. 连接预算：当前 5 路只限定命名请求，不代表预留了专属连接。若同时再开下载，HTTP/1.1 下 5+1 又可能占满常见的同源连接额度。正式流水应共用调度预算，动态让命名、正文下载和会话探测互相让位，而不是各自打满。
2. 背压：队列限制批次数或文件数；响应流只在消费窗口内打开，慢磁盘能反向限制生产。该 6 文件实验只测到了队列峰值，尚未压测队列满时的长时间运行。
3. 完整性：HTTP、会话、HTML 错误页、长度、ZIP 条目 CRC、文件名安全、重名、ZIP64；中途失败要明确“未完成”，不能把残缺包报告成功。
4. 生命周期：选择目标、取消、关闭来源页/工作台、后台休眠；明确何时能继续，何时必须终止。原有后台长任务规则不能直接假设适用于页面持有的写入流。
5. 性能：单文件协议会增加请求次数；STORE 不压缩，可能比服务端包大。必须用同一文件集合对比首字节、总耗时、请求数、磁盘及内存，而不是仅据 6 文件结果推断千文件提速。

## 本次产品修改验收

- 命名、下载与长等待回归 3 个测试文件、24 个用例通过。
- 全量 `npm test`：135 个测试文件、862 个用例通过。
- `npm run build` 通过（包括类型检查、工作台构建与内容脚本构建）。
- 构建后的浏览器 HTTP 回归通过：241 个文件、7 批、实际服务器观测命名在途峰值 5；乱序名称逐项对应，最终一次 DownLoad、一次 FileHandler、一个完成的下载记录，磁盘字节一致。
- 修改前先将并发测试改为 5，旧实现出现预期的“实际只有 2”失败；改常量后通过。

浏览器回归使用本地代理和夹具 ZIP；真实站点 6 文件实验独立记录，不能混为同一次正式流水 ZIP 验收。
