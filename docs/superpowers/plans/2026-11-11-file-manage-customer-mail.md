# 客户独立发文配置 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline.

**Goal:** 保存并执行客户的文件管理七项发文覆盖，空项继承默认。
**Architecture:** CustomerQueryProfile 增加可选 fileMailConfig；独立编辑组件复用原站字典；规划及执行解析覆盖。
**Tech Stack:** Vue、TypeScript、Vitest。
**Spec:** docs/superpowers/specs/2026-11-11-file-manage-customer-mail-design.md（用户已确认，并补充勾选、下拉、追加）。

## Global Constraints
- 不改 PCT；不提交真实发文；不覆盖已有其他工作。
- 配置按客户工作流记录保存，空字段继承。

## Review Focus
- 旧客户无覆盖、两客户切换隔离、空抄送与默认抄送不同。
- 原站选项失效不静默回退；签名保留原站 HTML 获取路径。

### Task 1: 配置模型和持久化
- [x] 先写 file-mail-config.test.ts 验证配置校验、克隆、地址合成与回退，运行观察失败。
- [x] 新建 src/customer/file-mail-config.ts，定义配置和校验及收件人/抄送解析；types、guards、service、repository 接入。
- [x] 测试保存后重新读取、跨客户嵌套数据隔离。

### Task 2: 规划与执行
- [x] 规划测试固定类型覆盖缺映射、客户标题覆盖；执行测试追加收件人及抄送覆盖。
- [x] FileManageMail 解析选择并传递联系人配置；file-manage-plan 接收类型覆盖，file-manage-submit 使用联系人解析；消息边界校验同步。
- [x] 原有默认回归与新测试通过。

### Task 3: 配置界面和验证
- [x] 新建 FileMailConfigEditor.vue，勾选覆盖、按需热加载、清除继承、地址追加。
- [x] CustomersPage 创建/编辑/取消/保存回填新配置，更新执行页说明与使用文档。
- [x] 运行相关单元回归、类型检查、构建，检查 diff。

## Rulings
- 原工作区有大量未提交修改；保持当前工作区，限于本功能文件，不提交他人工作。
- 地址下拉复用客户资料联系人目录；案件及商务动态来源仍按新建邮件读取。发件人抄送可另外从邮箱下拉选人，其他地址可追加。

## 验证记录
配置与保存测试先失败后通过；编辑器测试发现 Vue Proxy 无法 structuredClone，改为逐层复制后通过。实际保存请求测试发现追加地址未传入 SaveMailInfo，修正为使用解析后的 to 字段后通过。

审查发现跨客户异步查询竞态；已增加客户/版本/账号上下文校验，查询提交时锁定选择，并通过迟到响应 UI 回归测试。新增真实配置包保存和重建服务读取测试。
