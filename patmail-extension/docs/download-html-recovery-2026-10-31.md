# 单附件返回 Word HTML 导致整批暂停

## HAR 证据

输入：`D:\desktop\183.36.43.66.har`。只将结构化摘要保存到忽略目录，不复制正文、Cookie、人员信息或业务文件名称。

- 共 620 个请求；303 次单附件准备、303 次成功 HTTP 文件响应，另有一次被取消的文件响应。
- 2026-10-31 09:21:11.834（北京时间），HAR 条目索引 611（从 0 计）返回 HTTP 200、`application/octet-stream`、23,144 字节。
- 请求的附件扩展名是 `.pdf`，实际正文以 HTML 开头，包含 Office Word 命名空间、`ProgId=Word.Document` 和 Microsoft Word 12 生成标记。它是 Word 导出的 HTML 文档，不能冒充所请求的 PDF，也不能凭格式擅自认定是对应附件并改后缀入包。
- 原站下载准备结果的“文件不存在或权限不足”通知也出现在有效 PDF 上，不能仅凭此通知跳过附件。

## 根因与修复

旧正文校验将非 HTML 附件的 HTML 响应直接视为全局失败，终止 ZIP 输出。持久缓存又可能已经保存这些异常字节，继续任务时会再次命中同一错误。

新增 `RetryableDownloadFileError`，仅用于在 ZIP 条目创建前确认的附件响应异常：PDF 实际是 Word HTML，以及文件 GET 的 HTTP 408、429、500、502、503、504。每个附件最多尝试三次；失败后先停止旧正文读取、清除该附件的异常缓存，重新获取单附件句柄并读取正文。持续失败时使用现有的不可用附件分支：持久保存失败原因、跳过该附件、继续其余文件，并在 ZIP 中写入 `下载失败清单.txt`。冷恢复复用已记录的跳过结果。

完整缓存仍按 ZIP 顺序才读取正文；来自旧版本的完整 Word HTML 异常缓存也接受检查和重取。网络 EOF 与正文校验/缓存提交仍使用不同完成信号，保留六个共享业务令牌及最多十二个持久任务的背压。合法 Word HTML 的旧式 `.doc` 文件按原字节保留。

普通登录/未知 HTML、401、磁盘写入错误和已经写入 ZIP 条目后的断流仍使任务暂停；不会将账号故障、存储故障或半个条目伪装成成功。后者保留原有断点恢复流程。此次没有修改取名阶段的队首阻塞问题。

## 验证

新增回归在修复前为 7 项中 5 项失败；修复后检查了无缓存/持久缓存的重试成功、持续异常的局部跳过、失败清单内容与 ZIP CRC、跳过结果冷重放、旧异常缓存清理、HTTP 503 恢复、登录 HTML 和写盘失败仍暂停。另覆盖旧 `.doc` 的 Word HTML 格式判断。

```powershell
pnpm exec vitest run tests/unit/api tests/unit/mail tests/unit/background tests/unit/utils/stream-download.test.ts tests/integration
# 49 files / 326 tests passed
pnpm typecheck
pnpm build
pnpm verify:dist
pnpm lint
# Typecheck/build/dist passed; ESLint ratchet passed, historical findings remain.

$env:PATMAIL_PIPELINE_HTML='1'
pnpm test:e2e:pipeline-fault
```

Chromium 使用隔离测试配置及本地原站模拟：先中途断流暂停，再关闭并重启浏览器恢复。六路网络峰值为 6；已完整缓存的第一个文件只请求一次；断流文件从 262,144 字节续传。持续返回 Word HTML 的附件重试后单独跳过，连同一个原有的缺失附件一起列入失败清单；6 个有效源文件完整保留，ZIP 逐条字节比较及 CRC 通过，Chrome 确认最终保存 2,623,640 字节。

证据位于 `test-results/recovery-regression.log`、`recovery-typecheck.log`、`recovery-build.log`、`recovery-dist.log`、`recovery-lint.log`、`recovery-browser.log`、`native-pipeline-html.json`、`native-pipeline-html-recovered.zip` 和经脱敏的 `download-html-har-audit.json`。这不是对所有故障类型的容灾保证，也没有重新运行用户实际暂停的任务。

构建位于 `patmail-extension/dist`。实际安装的扩展需要重载，EASY 来源页与工作台需要刷新，再从原暂停任务继续，以使用新代码和现有缓存。

## 后续：新 HAR 末三条取消请求的定向回归

用户随后替换了同一路径的 HAR（文件时间 09:37:48，699 条记录）。末三条失败的 DownLoad 请求是 HAR 索引 675、676、677，均为状态 0、`net::ERR_ABORTED`；计时中发送、等待、接收均为 0，取消发生在排队阶段。它们与索引 674 的 Word HTML 响应在同一暂停窗口内，不能当作三个已确认缺失附件。

用户授权 CDP 调试后，使用隔离 Chromium 配置登录原站并重试这三个附件。三个下载准备及正文请求均返回 HTTP 200，实际字节数均与 Content-Length 一致，正文为 PDF：

| 文件编号 | 实际字节数 | 结果 |
| --- | ---: | --- |
| A0018306793 | 9,369,113 | PDF，完整下载 |
| A0018269068 | 858,813 | PDF，完整下载 |
| A0018268669 | 911,791 | PDF，完整下载 |

将三个实际正文送入生产 `streamDownloadFiles` 回放，分别测试内存和持久缓存模式，两项均通过；逐条验证 ZIP CRC、解包字节与源响应完全相等。输出 ZIP 为 11,140,909 字节，未产生失败清单。这里的真实下载通过已登录的 CDP 页面完成，打包验证为生产函数回放，没有从工作台 UI 重跑原来整批任务。隔离浏览器已清除会话 Cookie 并关闭；凭据没有写入测试代码或报告。

新增两个可重复的合成回归，保留真实并发关系，不将业务正文或名称写入测试仓库：Word HTML 异常不会连带取消末三条排队请求；显式取消三条后恢复，三条重新准备并成功入包，前一份完整缓存得到复用，取消结果不会持久化为缺失。

```powershell
pnpm exec vitest run tests/unit/api/stream-download-recovery.test.ts tests/unit/api/stream-download.test.ts tests/unit/api/stream-download-idle.test.ts tests/unit/api/stream-file.test.ts tests/unit/api/stream-cache.test.ts
# 5 files / 44 tests passed
pnpm exec vitest run --config test-results/har-tail-live.config.ts
# 1 file / 2 real-response replay tests passed
pnpm typecheck
# Passed
```

证据：`test-results/har-tail-regression.log`、`har-tail-typecheck.log`、`har-tail-live-pipeline-final.log`、`har-tail-live/cdp-results.json`、`har-tail-live/pipeline-report.json`、`har-tail-live/last-three-regression.zip`。真实响应与 CDP 回放配置留在忽略目录，不随仓库提交。

## 后续：09:51 HAR 的 EML 正文冒充 PDF

同一路径再次更新，文件时间 09:51:04，20,429,794 字节、24 条记录，覆盖北京时间 09:50:26 至 09:50:55。上次末三条取消请求本次已完整返回 PDF，字节数与此前 CDP 实测相同。

新触发点为 HAR 索引 19：文件 A0018188623（申请号 202211402876X）请求 `.pdf`，HTTP 200、`application/octet-stream`、Content-Length 和实际字节数均为 70,257；正文实际为 EML 邮件。头部含 Received、From、MIME-Version、Message-ID，MIME 为 multipart/related，子部分为文字、HTML 和两张内嵌 PNG，没有 PDF 部分。后续 LED 附件准备请求索引 20 为状态 0、ERR_ABORTED。这次捕获没有该 LED 附件正文，不能断言它不可用。

之前的正文隔离只覆盖 Word HTML，邮件正文仍落入通用 PDF 校验失败并暂停整批。新增严格的邮件头组合识别，仅将 PDF 请求收到的 EML 正文归入单附件可重试异常；合法 `.eml`、有效 PDF 中出现邮件头文本，以及登录网页保持各自原有行为。重试、清除旧异常缓存、最多三次后失败清单与持久恢复沿用已有流程。

新回归修复前四项失败，修复后通过：内存/持久缓存的 EML 重试成功、持续 EML 局部失败与失败清单冷恢复、旧完整 EML 缓存重取；另覆盖合法 EML、有效 PDF 内提到邮件头和邮件主题里含 `%PDF` 的情况。

验证：

- 相关单元/集成 49 个文件、333 项通过：`pnpm exec vitest run tests/unit/api tests/unit/mail tests/unit/background tests/unit/utils/stream-download.test.ts tests/integration`。
- 本 HAR 已捕获的 7 份实际正文分别在内存和持久缓存模式回放，两项通过。6 份 PDF 完整保留并逐字节比对、CRC 通过；1 份实际邮件尝试三次后列入失败清单。回放 ZIP 为 14,584,017 字节。这是已捕获正文的回放，不是重新下载整批业务附件。
- `$env:PATMAIL_PIPELINE_EML='1'; pnpm test:e2e:pipeline-fault` 通过：隔离 Chromium 中途断流暂停、关闭重启后恢复、完整缓存复用、262,144 字节 Range 续传、EML 局部跳过、最终 Chrome 保存及 ZIP CRC。
- 构建（含类型检查）、产物校验和 ESLint 基线门禁通过。

证据：`test-results/har-095104-audit.json`、`eml-recovery-red.log`、`eml-recovery-green.log`、`eml-recovery-regression.log`、`eml-har-replay.log`、`har-095104-replay/report.json`、`har-095104-replay/replayed.zip`、`eml-recovery-browser.log`、`native-pipeline-eml.json`、`eml-recovery-build.log`、`eml-recovery-dist.log`。真实邮件正文留在忽略目录，不写入仓库。

## 后续：与原站导出包对比后改为保留真实格式

用户随后提供同一批 495 件的原站导出包（服务端 `FileHandler.ashx` 打包，条目一律命名“-递交文件合并档.pdf”）与插件包对比，报“原站下载全是 PDF，插件下载有好多嵌套 ZIP，还有俩没下载出来”。逐字节核对确认两边源字节相同，差异来自原站一律改名为 `.pdf`：

- 481 件真 PDF 两边 SHA256 一致，仅申请号命名不同（原站带小数点，插件按取名配方去掉小数点）。
- 12 件“嵌套 ZIP”在原站包里同样是 ZIP 字节（如 277,063、1,433 字节的条目两边哈希一致），只是被命名为 `.pdf`；插件此前已按 `.zip` 保留完整原包（`list.xml` + PDF + 签名文件）。
- 2 件“没下载出来”的在原站包里分别是 23,144 字节的 Word HTML 和 70,257 字节的 EML 邮件正文冒充 `.pdf`，同样打不开；插件此前重试三次后跳过并写入失败清单。

据此把 PDF 名下的 Word HTML、EML 从“可重试异常→跳过”改为按真实格式入包：探测为 Word HTML 时条目后缀改 `.html`，邮件正文改 `.eml`，字节原样保留；`.zip` 改名逻辑不变。这两类正文不再重试（重取同一附件只会得到同样正文，已由原站包同哈希证实），也不再写入跳过缓存。清单按格式分组输出：ZIP 原包、Word HTML、EML 各一节，逐行“原名 → 保存为”。

行为矩阵：

- PDF 名下 ZIP 原包 → `.zip` 保留（不变）。
- PDF 名下 Word HTML → `.html` 保留（新）。
- PDF 名下 EML 邮件正文 → `.eml` 保留（新）。
- 登录页/未知 HTML、HTTP 408/429/5xx、断流、空 ZIP 冒充 PDF、磁盘错误 → 沿用原有暂停/重试/失败清单流程（不变）。
- 旧缓存中已存的 Word HTML/EML 字节视为真实源文件，继续任务时直接按真实格式入包，不再重取。

回归同步更新：`stream-file`、`stream-download-recovery` 单测改为断言 `.html`/`.eml` 入包、只请求一次、恢复复用缓存且不再重放失败清单；`native-pipeline-fault` 三个变体（默认、`PATMAIL_PIPELINE_HTML=1`、`PATMAIL_PIPELINE_EML=1`）统一断言 7 个源文件入包、跳过 1 个缺失附件、真实格式正文只请求 1 次。另修复一个与本议题无关的既有失败：打包安全测试的 `classify` 把整份文件名单塞进 `node -e` 命令行，933 个名字时超出 Windows 命令行上限（`ENAMETOOLONG`），改为经 stdin 传入名单后通过。
