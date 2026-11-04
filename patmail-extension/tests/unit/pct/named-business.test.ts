import { expect, it } from 'vitest'
import { applyArbitrationReply } from '../../../src/customer/pct-workbook'
import { planPctRecipients } from '../../../src/customer/pct-recipients'
import type { PctTaskRow } from '../../../src/customer/types'
const base: PctTaskRow = { ourVolume: 'PA1', customerVolume: '', customerName: '客户', contactName: '', iprName: '', procLabel: '提醒申请涉外外观', mailTypeLabel: '类型' }
it('仲裁保留具体业务员人名和指定业务身份，写回时保留限定', () => {
  const result = applyArbitrationReply([base], '空 PA1｜事项 提醒申请涉外外观｜收件人 陈冠宇｜身份 指定业务｜抄送 无｜抄送身份 无｜依据 客户要求所有邮件仅发陈冠宇，由业务转发')
  expect(result.decisions[0]).toMatchObject({ recipient: '陈冠宇', role: '指定业务', unsure: false })
  expect(result.rows[0]).toMatchObject({ iprName: '陈冠宇', namedBusiness: true, iprArbitrated: true })
})
it('只写指定业务员，不把业务分组里的其他人追加进收件人或抄送', () => {
  const row = { ...base, iprName: '陈冠宇', namedBusiness: true as const, iprArbitrated: true as const }
  const contacts = [{ group: 'sales' as const, name: '陈冠宇', email: 'chen@example.com', role: '' }, { group: 'sales' as const, name: '其他业务', email: 'other@example.com', role: '' }]
  const plan = planPctRecipients([row], contacts, { to: '', cc: '' })
  expect(plan.to).toBe('陈冠宇(chen@example.com);')
  expect(plan.cc).toBe('陈冠宇(chen@example.com);')
  expect(plan.notes).toEqual([])
  const missing = planPctRecipients([row], contacts.slice(1), { to: '', cc: '' })
  expect(missing.to).toBe('')
  expect(missing.notes.length).toBeGreaterThan(0)
})

it('指定业务限定贯穿计划和消息校验，旧泛化结果在创建前拦截', async () => {
  const { limitMailItems } = await import('../../../src/customer/limit-mail-submit')
  const { isMessage, MessageType } = await import('../../../src/shared/message')
  const proc = 'aaaaaaaa-1111-4111-8111-111111111111', type = 'bbbbbbbb-1111-4111-8111-111111111111'
  const sheet = { ...base, iprName: '陈冠宇', mailTypeId: type, iprArbitrated: true as const, namedBusiness: true as const }
  const input = { procIds: [proc], rows: [{ procId: proc, caseVolume: base.ourVolume }], sheetRows: [sheet], mode: 'lead' as const, address: 'auto' as const }
  const planned = limitMailItems(input)
  expect(planned.ok).toBe(true)
  if (!planned.ok) return
  expect(planned.items[0]).toMatchObject({ namedBusiness: true, iprName: '陈冠宇', arbitrated: true })
  expect(planned.items[0].contacts).toBeUndefined()
  expect(isMessage({ type: MessageType.SubmitLimitMail, payload: { userId: type, items: planned.items } })).toBe(true)
  expect(limitMailItems({ ...input, sheetRows: [{ ...sheet, iprName: '只发业务' }] }).ok).toBe(false)
})

it('旧版只发业务可以用暂存材料重新仲裁，不要求重传整表', async () => {
  const { iprArbitrationWaves } = await import('../../../src/customer/pct-workbook')
  const waves = iprArbitrationWaves([{ ...base, iprName: '只发业务', iprArbitrated: true }])
  expect(waves.length).toBe(1)
  expect(waves[0]).toContain('指定业务')
  expect(waves[0]).toContain('具体姓名')
})
