import { expect, it, vi } from 'vitest'
import { createApp, h } from 'vue'
import { repairRepeatedDesignNumbers } from '../../../src/hague/draft-repairs'
import HaguePage from '../../../src/app/pages/HaguePage.vue'
import CheckRainbow from '../../../src/app/components/CheckRainbow.vue'

const mocks = vi.hoisted(() => ({ read: vi.fn(), complete: vi.fn(), repeated: false, approval: undefined as {inputKey:string;note:string}|undefined }))
const dropped = vi.hoisted(() => ({ read: vi.fn() }))
vi.mock('../../../src/shell/components/Bunny.vue', () => ({ default: { render: () => null } }))
vi.mock('../../../src/shell/components/PageHead.vue', () => ({ default: { render: () => null } }))
vi.mock('../../../src/app/services/full-page-bridge', () => ({ createFullPageBridge: () => ({ request: mocks.read }) }))
vi.mock('../../../src/app/dialog', async importOriginal => ({...await importOriginal<typeof import('../../../src/app/dialog')>(),confirmDialog:async()=>true}))
vi.mock('../../../src/hague/dropped-folders', () => ({ readDroppedFolders: dropped.read }))
vi.mock('../../../src/recovery/client',()=>({createRecoveryClient:()=>({get:async()=>null,put:async()=>{}})}))
vi.mock('../../../src/hague/workspace-recovery',async importOriginal=>({...await importOriginal<typeof import('../../../src/hague/workspace-recovery')>(),saveWorkspaceMaterials:async()=>{},pruneWorkspaceMaterials:async()=>{},withHagueBatchLock:async(work:()=>Promise<void>)=>work()}))
vi.mock('../../../src/app/assistant-job', () => ({ requestAssistantJob: mocks.complete }))
vi.mock('../../../src/hague/session', () => ({ hagueSessionClient: {
  listTabs: async () => [{ id: 1, title: 'WIPO' }],
  verify: async () => ({ tabId: 1, title: 'WIPO', documentId: 'doc-1', verifiedAt: Date.now(), expiresAt: Date.now() + 300000 }),
  open: async () => {}
} }))
vi.mock('../../../src/hague/materials', async importOriginal => ({
  ...await importOriginal<typeof import('../../../src/hague/materials')>(),
  readFiling: async () => ({ locarno: '28', products: mocks.repeated ? [['1','1','Bottle','03'],['1','1','Bottle','03']] : [['1', '1', 'Bottle', '03']], description: 'Description', views: mocks.repeated ? [{ number: '1.1', code: '1', label: 'Perspective' },{ number: '2.1', code: '1', label: 'Perspective' }] : [{ number: '1.1', code: '1', label: 'Perspective' }], issues: [] })
}))

it.each([false,true])('reads and arbitrates materials with a restored approved correction: %s', async restored => {
  mocks.repeated=restored
  mocks.read.mockClear();mocks.complete.mockClear()
  if(restored)vi.stubGlobal('chrome',{storage:{local:{get:async (key:string)=>({[key]:{status:'saved',next:20,total:20,tabId:1,reference:'123',stage:'历史保存回执',warnings:['原 Word 产品表设计编号全部为 1；经用户确认，草稿按产品表行顺序及图纸分组修正为 1–2，请核对。'],designNumberCorrection:mocks.approval}})}}})
  vi.stubGlobal('URL', class extends URL { static createObjectURL() { return 'blob:test' } static revokeObjectURL() {} })
  const source = JSON.stringify({ GetCaseInfo: [{ CaseInfo: [{ remark: '海牙进入美国、欧盟、英国、日本、加拿大、韩国；公开情况：6个月；尚未公开。' }] }], GetCaseApplicant: [{ TableRows: [{ applicant_name_en: 'Example Ltd.', contact_address_en: 'Room 201, Qianhai Shenzhen-Hong Kong Cooperation Zone, Shenzhen, Guangdong 518000, China', city: '深圳市', province: '广东省', postcode: '518000' }] }], GetCasePriority: [{ TableRows: [{ priority_no: '111', priority_date: '2026-11-11', priority_country_id: 'CN', access_code: '111' }] }] })
  mocks.read.mockResolvedValue({ type: 'READ_HAGUE_CASE_RESULT', payload: { text: source } })
  mocks.complete.mockResolvedValue(JSON.stringify({ results: [{ caseVolume: 'PO1HAGUE', decision: { applicant: { name: 'Example', address: '中文误填', city: '深圳', region: '前海深港合作区', postalCode: '518000', country: 'CN' }, creators: [{ givenName: 'Lisi', familyName: 'CHEN' }], parties: ['EM'], publicationMonths: 6, priorities: [], warnings: [], evidence: ['test'] } }] }))
  const root = document.createElement('div'), app = createApp({ render: () => h('div', [h('header', { class: 'test-top-actions' }, [h(CheckRainbow)]), h(HaguePage, { embedded: true })]) })
  app.directive('hint',{})
  app.mount(root)
  try {
    const concurrency=root.querySelector<HTMLButtonElement>('[aria-label="草稿并发路数"]')!
    expect(concurrency.textContent?.trim()).toBe('6 路')
    await vi.waitFor(()=>expect(concurrency.disabled).toBe(false))
    concurrency.click()
    await vi.waitFor(() => expect([...document.querySelectorAll('[role="option"]')].map(o => o.textContent?.trim())).toEqual(['1 路（串行）', '2 路', '3 路', '4 路', '5 路', '6 路']))
    concurrency.click()
    expect(root.querySelector<HTMLButtonElement>('[aria-label="草稿填写方式"]')?.textContent?.trim()).toBe('接口链')
    expect(root.textContent).not.toContain('试运行')
    // 拖放区：高亮反馈、空文件夹提示，以及 drop 后把状态复位。
    const zone = root.querySelector<HTMLElement>('.hague-page')!
    const dragEvent = (type: string): Event => {
      const event = new Event(type, { bubbles: true, cancelable: true })
      Object.defineProperty(event, 'dataTransfer', { value: { types: ['Files'], items: [], dropEffect: 'none' } })
      return event
    }
    zone.dispatchEvent(dragEvent('dragenter'))
    zone.dispatchEvent(dragEvent('dragover'))
    await vi.waitFor(() => expect(zone.classList.contains('is-dragging')).toBe(true))
    expect(root.textContent).toContain('松手即可导入这个文件夹')
    dropped.read.mockResolvedValue([])
    zone.dispatchEvent(dragEvent('drop'))
    await vi.waitFor(() => expect(root.textContent).toContain('请拖入总文件夹'))
    expect(zone.classList.contains('is-dragging')).toBe(false)
    const files = ['root/PO1HAGUE/form.docx', 'root/PO1HAGUE/1.1.jpg', ...(restored?['root/PO1HAGUE/2.1.jpg']:[])].map(path => Object.assign(new File([''], path.split('/').pop()!), { webkitRelativePath: path }))
    if(restored)mocks.approval=repairRepeatedDesignNumbers({locarno:'28',products:[['1','1','Bottle','03'],['1','1','Bottle','03']],description:'Description',views:[{number:'1.1',code:'1',label:'Perspective'},{number:'2.1',code:'1',label:'Perspective'}],issues:[]},files.filter(f=>f.name.endsWith('.jpg')))?.designNumberCorrection
    const input = root.querySelector<HTMLInputElement>('input[aria-label="选择海牙申请总文件夹"]')!
    Object.defineProperty(input, 'files', { value: files })
    input.dispatchEvent(new Event('change'))
    // The already-open Hague tab is verified automatically; material processing needs no connection click.
    await vi.waitFor(() => expect(root.textContent).toContain('US、EM、GB、JP、CA、KR'))
    expect(mocks.read).toHaveBeenCalledTimes(1); expect(mocks.complete).toHaveBeenCalledTimes(1)
    if(restored){expect(root.textContent).toContain('修正为 1–2');expect(root.textContent).not.toContain('产品表设计编号重复');expect([...root.querySelectorAll('button')].some(button=>button.textContent==='全部另建草稿')).toBe(true)}
    const detail = root.querySelector('.hague-creator-address dd')?.textContent
    expect(detail).toBe('Room 201, Qianhai Shenzhen-Hong Kong Cooperation Zone')
    expect(root.querySelector('.hague-creator-address')?.textContent).toContain('Shenzhen / Guangdong')
    expect(root.textContent).toContain('自动生成的草稿占位申请号')
    expect(root.querySelector('.hague-page [role=progressbar]')).toBeNull()
    expect(root.querySelector('.test-top-actions [role=progressbar]')?.getAttribute('aria-valuenow')).toBe('100')
  } finally { app.unmount(); vi.unstubAllGlobals() }
})

it('offers the kawaii theme reproduction toggle checked by default and allows switching it off',async()=>{
 const el=document.createElement('div');document.body.append(el);const app=createApp(HaguePage);app.mount(el)
 try{
  await vi.waitFor(()=>{const button=[...el.querySelectorAll('button')].find(b=>b.textContent?.includes('导出图纸'));expect(button?.disabled).toBe(false)})
  const button=[...el.querySelectorAll('button')].find(b=>b.textContent?.includes('导出图纸'))!
  expect(button.classList.contains('solid')).toBe(true);expect(button.getAttribute('aria-pressed')).toBe('true')
  button.click();await Promise.resolve();expect(button.getAttribute('aria-pressed')).toBe('false');expect(button.classList.contains('ghost')).toBe(true)
 }finally{app.unmount();el.remove();vi.unstubAllGlobals()}
})
