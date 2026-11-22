# Phase 3 架构门禁

A–K 保留原扫描规则和违规口径。Rule G 扩展至文件管理和期限发文入口。运行时直接导入、经相对路径别名或 barrel 转出的发文执行器均由依赖图检查。类型导入与登记的组合根按原有规则识别。

新增工作台组合根 `useMailSubmission.ts`，在入口装配文件和期限适配器。受保护的页面通过用例调用端口，Home 通过只读查询获取账本状态。Rules 保留纯规则配置，Floating File Search 保留纯案件绑定渠道。

负向用例覆盖 FileManage 直接导入提交执行器、期限页经 barrel 引入提交执行器，以及未登记装配位置。类型导入用例确认可引用旧数据形状。通过 `pnpm architecture:check` 同时运行生产依赖图和规则测试。

## 测试资源与 CI

Vitest 的 `PATMAIL_TEST_PROFILE` 支持 `low`、`default`、`parallel`。上限分别是 1、Windows 2 / Linux 4、8 个 worker，实际还受 CPU 和每 2 GiB 主机内存一个槽位限制。全部模式保留文件隔离、全部用例、JUnit 和覆盖率。Windows 的系统提交额度还取决于同时运行的程序，需要时使用低内存模式。

`ci-check` 记录真实退出码、退出信号和失败类别。普通命令失败标记为 `command`，检测到子进程内存不足诊断时标记为 `resource`。Windows CI 构建默认将 Rayon 限制为两个线程，可通过环境变量覆盖。`build:ci` 含相同的两段扩展构建和快照检查，不启动 CDP Observer。日常 `build` 保留原 Observer 启动行为。
