import type { ToolContext } from './tools/contracts'

export type { DeadlineRow, ToolContext, ToolOutcome } from './tools/contracts'
export { formatDraft } from './tools/contracts'
export { agentToolSchemas, executeAgentTool } from './tools/registry'

/** 测试和未接线时的空实现。成功句式与正式工具一致，失败句不以成功前缀开头。 */
export function emptyPageTools(): Pick<ToolContext, 'rememberFiles' | 'recentFiles' | 'rememberDeadlines' | 'recentDeadlines' | 'readCustomer' | 'previewWorkflow' | 'draftMail' | 'listTasks' | 'listHistory' | 'listReviewers' | 'listProcesses' | 'listAcceptance' | 'readonlyAcceptance' | 'diagnoseMail' | 'exportContacts' | 'submitEasy'> {
  return {
    rememberFiles() {},
    recentFiles: () => [],
    // eslint-disable-next-line @typescript-eslint/require-await -- 存量豁免：保留 async 接口契约（Promise 返回）
    readCustomer: async () => '没有对上的客户。',
    // eslint-disable-next-line @typescript-eslint/require-await -- 存量豁免：保留 async 接口契约（Promise 返回）
    previewWorkflow: async () => '没有对上的工作流。',
    // eslint-disable-next-line @typescript-eslint/require-await -- 存量豁免：保留 async 接口契约（Promise 返回）
    draftMail: async () => '先查案件，这一轮还没有文件可以起草。',
    // eslint-disable-next-line @typescript-eslint/require-await -- 存量豁免：保留 async 接口契约（Promise 返回）
    listTasks: async () => '发文任务共 0 条。',
    // eslint-disable-next-line @typescript-eslint/require-await -- 存量豁免：保留 async 接口契约（Promise 返回）
    listHistory: async () => '查询记录共 0 条。',
    // eslint-disable-next-line @typescript-eslint/require-await -- 存量豁免：保留 async 接口契约（Promise 返回）
    listReviewers: async () => '审核人共 0 人。这一步没有提交审核。',
    // eslint-disable-next-line @typescript-eslint/require-await -- 存量豁免：保留 async 接口契约（Promise 返回）
    listProcesses: async () => '流程共 0 条。没有打开页面。',
    // eslint-disable-next-line @typescript-eslint/require-await -- 存量豁免：保留 async 接口契约（Promise 返回）
    listAcceptance: async () => '验收共 0 条。',
    // eslint-disable-next-line @typescript-eslint/require-await -- 存量豁免：保留 async 接口契约（Promise 返回）
    readonlyAcceptance: async () => '只读验收没有完成。',
    // eslint-disable-next-line @typescript-eslint/require-await -- 存量豁免：保留 async 接口契约（Promise 返回）
    diagnoseMail: async () => '还没有邮件编号。',
    // eslint-disable-next-line @typescript-eslint/require-await -- 存量豁免：保留 async 接口契约（Promise 返回）
    exportContacts: async () => '还没有文号可以导出联系人。',
    rememberDeadlines() {},
    recentDeadlines: () => [],
    // eslint-disable-next-line @typescript-eslint/require-await -- 存量豁免：保留 async 接口契约（Promise 返回）
    submitEasy: async () => '写开关已关闭，没有提交到 EASY。'
  }
}
