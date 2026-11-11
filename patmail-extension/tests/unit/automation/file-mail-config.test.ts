import { BundleCustomerRepository } from '../../../src/customer/repository'
import { MemoryBundleRepository } from '../../../src/storage/query-bundle'
import { describe, expect, it } from 'vitest'
import { isFileMailConfig, cloneFileMailConfig, fileMailAddresses } from '../../../src/customer/file-mail-config'
import { CustomerQueryService } from '../../../src/customer/service'
import type { CustomerQueryProfile } from '../../../src/customer/types'

const sender = { name: '发件人', email: 'sender@example.com' }
describe('客户文件发文配置', () => {
  it('真实配置包保存并重新创建服务后仍可读，修改读出值不会污染仓库', async () => {
    const bundles = new MemoryBundleRepository()
    const repository = new BundleCustomerRepository(bundles)
    const profile = await new CustomerQueryService(repository).save({ name: '甲', baseTemplateId: 'base', overrides: {}, enabled: true, fileMailConfig: { cc: { sender: false, sales: false } } })
    const reloaded = new BundleCustomerRepository(bundles)
    const read = (await reloaded.get(profile.id))!
    expect(read.fileMailConfig).toEqual({ cc: { sender: false, sales: false } })
    read.fileMailConfig!.cc!.sender = true
    expect((await reloaded.get(profile.id))?.fileMailConfig?.cc?.sender).toBe(false)
  })

  it('旧配置沿用案件联系人、发件人和商务；自定义追加并去重', () => {
    const cases = '甲(a@example.com);'
    const sales = '商务(sales@example.com);'
    expect(fileMailAddresses(undefined, cases, sales, sender)).toEqual({ to: cases, cc: '发件人(sender@example.com);' + sales })
    expect(fileMailAddresses({ to: '补充(extra@example.com);甲(a@example.com);', cc: { sender: false, sales: false, extra: '抄送(cc@example.com);' } }, cases, sales, sender))
      .toEqual({ to: cases + '补充(extra@example.com);', cc: '抄送(cc@example.com);' })
    expect(fileMailAddresses({ cc: { sender: true, sales: true, senderAddress: '另一个(other@example.com);' } }, cases, sales, sender).cc)
      .toBe('另一个(other@example.com);' + sales)
  })
  it('校验类型、地址与白名单，克隆不共享嵌套数据', () => {
    expect(isFileMailConfig({ cc: { sender: false, sales: false } })).toBe(true)
    expect(isFileMailConfig({ sender: { id: 'bad', label: 'bad' } })).toBe(false)
    expect(isFileMailConfig({ to: 'not-an-email' })).toBe(false)
    expect(isFileMailConfig({ cc: { sender: 'false', sales: true } })).toBe(false)
    expect(isFileMailConfig({ injected: true })).toBe(false)
    const legacy = { mailType: { id: '11111111-1111-4111-8111-111111111111', name: '旧类型' }, title: '客户标题', cc: { sender: false, sales: false } }
    expect(isFileMailConfig(legacy)).toBe(true)
    expect(cloneFileMailConfig(legacy)).toEqual({ title: '客户标题', cc: { sender: false, sales: false } })

    const source = { cc: { sender: true, sales: false } }
    const copy = cloneFileMailConfig(source)!
    copy.cc!.sender = false
    expect(source.cc.sender).toBe(true)
  })
  it('保存后重新读取保留客户覆盖，另一客户和默认不受影响', async () => {
    const records = new Map<string, CustomerQueryProfile>()
    const service = new CustomerQueryService({ list: async () => [...records.values()], get: async id => records.get(id) ?? null, save: async p => { records.set(p.id, structuredClone(p)) }, delete: async id => { records.delete(id) } })
    const base = { name: '甲', baseTemplateId: 'template', overrides: {}, enabled: true }
    const config = { to: '补充(extra@example.com);', cc: { sender: false, sales: true } }
    const first = await service.save({ ...base, fileMailConfig: config })
    config.cc.sender = true
    const second = await service.save({ ...base, name: '乙' })
    expect((await service.list()).find(p => p.id === first.id)?.fileMailConfig?.cc?.sender).toBe(false)
    expect(second.fileMailConfig).toBeUndefined()
  })
})
