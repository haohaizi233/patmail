import { isRecord } from '../api/response-guards'
import { isQueryGuid } from '../query/query-validator'
import { appendRecipientField } from '../mail/easy/contracts'

export interface FileMailConfig {
  mailType?: { id: string; name: string }
  sender?: { id: string; label: string }
  reviewer?: { id: string; name: string }
  signature?: { id: string; name: string }
  title?: string
  /** 追加到案件联系人。 */
  to?: string
  /** 缺省继承；显式关闭两个来源允许不抄送。 */
  cc?: { sender: boolean; sales: boolean; senderAddress?: string; salesAddress?: string; extra?: string }
}

export function validAddressList(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 4000) return false
  return value.split(/[;；\n]/).every(piece => {
    const text = piece.trim()
    if (!text) return true
    return /^(?:[^();；<>\r\n]+\([^()<>;；\s]+@[^()<>;；\s]+\)|[^();；<>\s]+@[^();；<>\s]+)$/.test(text)
  })
}

export function isFileMailConfig(value: unknown): value is FileMailConfig {
  if (!isRecord(value) || !Object.keys(value).every(key => ['mailType', 'sender', 'reviewer', 'signature', 'title', 'to', 'cc'].includes(key))) return false
  for (const key of ['mailType', 'sender', 'reviewer', 'signature']) {
    const item = value[key]
    if (item === undefined) continue
    const label = key === 'sender' ? 'label' : 'name'
    if (!isRecord(item) || !Object.keys(item).every(k => k === 'id' || k === label) || !isQueryGuid(String(item.id)) || typeof item[label] !== 'string' || !String(item[label]).trim() || String(item[label]).length > 200) return false
  }
  if (value.title !== undefined && (typeof value.title !== 'string' || !value.title.trim() || value.title.length > 500)) return false
  if (value.to !== undefined && !validAddressList(value.to)) return false
  if (value.cc !== undefined) {
    const cc = value.cc
    if (!isRecord(cc) || !Object.keys(cc).every(k => ['sender', 'sales', 'senderAddress', 'salesAddress', 'extra'].includes(k)) || typeof cc.sender !== 'boolean' || typeof cc.sales !== 'boolean') return false
    for (const k of ['senderAddress', 'salesAddress', 'extra']) if (cc[k] !== undefined && !validAddressList(cc[k])) return false
  }
  return true
}

export function cloneFileMailConfig(value: FileMailConfig | undefined): FileMailConfig | undefined {
  if (value === undefined) return undefined
  return { ...value,
    ...(value.mailType ? { mailType: { ...value.mailType } } : {}),
    ...(value.sender ? { sender: { ...value.sender } } : {}),
    ...(value.reviewer ? { reviewer: { ...value.reviewer } } : {}),
    ...(value.signature ? { signature: { ...value.signature } } : {}),
    ...(value.cc ? { cc: { ...value.cc } } : {})
  }
}

export function fileMailAddresses(config: Pick<FileMailConfig, 'to' | 'cc'> | undefined, cases: string, sales: string, sender: { name: string; email: string }): { to: string; cc: string } {
  const cc = config?.cc
  const own = `${sender.name}(${sender.email});`
  const senderText = cc?.sender === false ? '' : cc?.senderAddress?.trim() || own
  const salesText = cc?.sales === false ? '' : cc?.salesAddress?.trim() || sales
  return {
    to: appendRecipientField(cases, (config?.to ?? '').replace(/\n/g, ';')),
    cc: appendRecipientField(appendRecipientField(senderText, salesText), (cc?.extra ?? '').replace(/\n/g, ';'))
  }
}
