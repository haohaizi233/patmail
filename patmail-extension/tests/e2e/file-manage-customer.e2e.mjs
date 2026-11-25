import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'
import { launchExtensionContext, extensionWorker, waitForContentScript } from './support/browser.mjs'
import { installEasyMock, easyFixtureUrl, easyOrigin } from './support/easy-mock.mjs'
import { distDir, reportsDir, resultPath } from './support/paths.mjs'
const guid = n => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, '0')}`
const user = '11111111-1111-1111-1111-111111111111'
const [customer, sender, reviewer, signature, type, file, mail, flow, first, next, urgency] = Array.from(
  { length: 11 },
  (_, i) => guid(i + 1),
)
let context
if (process.env.PATMAIL_E2E_CHROME) {
  context = await chromium.launchPersistentContext('', {
    headless: true,
    viewport: { width: 1680, height: 1080 },
    ignoreDefaultArgs: ['--disable-extensions'],
    executablePath: process.env.PATMAIL_E2E_CHROME,
    args: ['--enable-unsafe-extension-debugging'],
  })
  const cdp = await context.browser().newBrowserCDPSession()
  await cdp.send('Extensions.loadUnpacked', { path: distDir })
} else context = await launchExtensionContext(distDir, { viewport: { width: 1680, height: 1080 } })
const errors = [],
  calls = [],
  checks = []
context.on('page', page => page.on('pageerror', e => errors.push(e.message)))
const ok = { IsLogin: true, Status: true, Result: true }
const reply = (route, body) =>
  route.fulfill({
    status: 200,
    contentType: 'text/plain; charset=utf-8',
    body: JSON.stringify({ ClientInfo: ok, ...body }),
  })
try {
  await installEasyMock(context, {
    profile: 'extension',
    fixtureHtml: '<!doctype html><title>隔离文件发文验收</title>',
  })
  await context.route(`${easyOrigin}/**`, route => {
    const p = new URLSearchParams(route.request().postData() ?? ''),
      call = p.get('Call')
    if (call) calls.push({ call, params: Object.fromEntries(p) })
    if (call === 'GetCustomerlist')
      return reply(route, {
        TableRows: [
          { customer_id: customer, customer_name: '客户甲' },
          { customer_id: guid(20), customer_name: '客户乙' },
        ],
      })
    if (call === 'MailinfoInit')
      return reply(route, {
        mailsettinglist: [
          { mailset_id: sender, cn_name: '客户发件人', SMTPFromEmail: 'sender@example.com', is_default: 1 },
        ],
      })
    if (call === 'GetTreeUser')
      return reply(route, { TreeUser: [{ id: reviewer, name: '客户审核人', TreeType: 'user' }] })
    if (call === 'GetMailSignatureSettingList')
      return reply(route, { TableRows: [{ signature_id: signature, signature_name: '客户签名', is_enabled: 1 }] })
    if (call === 'GetSignatureset')
      return reply(route, { SignatureInfo: [{ signature_content: '<div>客户签名</div>' }] })
    if (call === 'GetSignature')
      return reply(route, {
        Signature: [{ signature_id: signature, signature_name: '客户签名', signature_content: '<div>客户签名</div>' }],
      })
    if (call === 'GetSearchFiles')
      return reply(route, {
        TableRowsCount: '2',
        TableRows: [
          {
            file_id: file,
            file_name: '通知书.pdf',
            file_desc: '发明专利证书(签章)',
            customer_name: '客户甲',
            case_volume: 'PA-E2E',
          },
          {
            file_id: guid(50),
            file_name: '驳回决定.pdf',
            file_desc: '驳回决定',
            customer_name: '客户甲',
            case_volume: 'PA-E2E-2',
          },
        ],
      })
    if (call === 'MailCustomer') return reply(route, { objid: mail })
    if (call === 'GetMailInfo')
      return reply(route, {
        MailInfo: [
          {
            mail_id: mail,
            customer_id: customer,
            mail_type_id: type,
            mailset_id: sender,
            mail_subject: '原标题',
            mail_body: '正文',
            is_zip: 0,
            mail_bcc: '密送(bcc@example.com);',
          },
        ],
      })
    const groups = {
      GetRecentContact: 'RecentContact',
      GetCustomerContact: 'CustomerContact',
      GetCaseContact: 'CaseContact',
      GetSalesContact: 'SalesContact',
      GetPicsContact: 'PicsContact',
      GetCaseAgentContact: 'CaseAgentContact',
    }
    if (groups[call])
      return reply(route, {
        [groups[call]]:
          call === 'GetCaseContact'
            ? [{ contact_name: '案件', email: 'case@example.com' }]
            : call === 'GetSalesContact'
              ? [{ cn_name: '商务', email: 'sales@example.com' }]
              : null,
      })
    if (call === 'SaveMailInfo' || call === 'MailSubmit') return reply(route, {})
    if (call === 'GetFlowInfo')
      return reply(route, {
        Result: {
          obj_id: mail,
          flow_id: flow,
          flow_type: 'CO',
          flow_sub_type: '',
          dept_id: guid(30),
          dept_full_name: '部门',
          status: -1,
          cur_node_id: '',
          cur_user_id: '',
          node_code: '',
          cn_name: '',
          is_skip: false,
          is_enabled: true,
          urgency_id: '',
          update_time: '',
          update_time_dd: '',
          update_time_mm: '',
          update_time_ss: '2026-11-11 10:00:00',
        },
      })
    if (call === 'GetFlowSubmit')
      return reply(route, {
        flow_type_name: '发文',
        Result: [
          {
            seq: 1,
            next: '2',
            node_code: 'FIRST',
            node_id: first,
            list_id: guid(31),
            node_name_zh_cn: '启动',
            allow_edit: true,
            allow_skip: '',
            is_parallel: 0,
            need_all_audit: 0,
            user_list_id: '',
            user_list_name: '',
            user_list: '',
          },
          {
            seq: 2,
            next: '3',
            node_code: '',
            node_id: next,
            list_id: guid(32),
            node_name_zh_cn: '审核',
            allow_edit: true,
            allow_skip: '',
            is_parallel: 0,
            need_all_audit: 0,
            user_list_id: reviewer,
            user_list_name: '客户审核人',
            user_list: '',
          },
        ],
      })
    if (call === 'GetUrgencyList')
      return reply(route, {
        UrgencyList: [{ urgency_id: urgency, urgency_code: 'normal', urgency_name: '正常', seq: 1 }],
      })
    if (call === 'GetFlowLastStatus') return reply(route, { last_status: null })
    if (call === 'GetMailFile')
      return reply(route, {
        TableRowsCount: '2',
        TableRows: [
          { file_id: file, file_name: '通知书.pdf' },
          { file_id: guid(99), file_name: '旧合并附件.pdf' },
        ],
      })
    return route.fallback()
  })
  await context.route(/^https?:\/\//, route =>
    new URL(route.request().url()).origin === easyOrigin ? route.fallback() : route.fulfill({ status: 404, body: '' }),
  )
  await context.addCookies([
    { name: 'pm_fixture_session', value: 'active', url: easyFixtureUrl, httpOnly: true, sameSite: 'Lax' },
  ])
  const worker = await extensionWorker(context)
  const easy = await context.newPage()
  await easy.goto(easyFixtureUrl)
  await waitForContentScript(worker, easy)
  const queryKey = `patmail.query.v1:${easyOrigin}:${user}`,
    ruleKey = `patmail.mail.v1:${easyOrigin}:${user}`
  const profile = (id, name) => ({
    id,
    name,
    easyCustomerId: id === 'a' ? customer : guid(20),
    baseTemplateId: 'base',
    overrides: {},
    querySurface: 'file',
    workflowId: 'file-manage',
    fileMailStyle: 'single_file',
    boundQuery: { customer_name_vague: name },
    enabled: true,
    revision: 1,
    createdAt: '2026-11-11',
    updatedAt: '2026-11-11',
  })
  await worker.evaluate(
    ({ queryKey, ruleKey, profiles, rules }) =>
      chrome.storage.local.set({ [queryKey]: { version: 1, templates: [], customers: profiles }, [ruleKey]: rules }),
    {
      queryKey,
      ruleKey,
      profiles: [profile('a', '客户甲'), profile('b', '客户乙')],
      rules: {
        version: 1,
        revision: 1,
        ownerId: user,
        policies: [],
        mappings: [
          {
            id: 'map',
            fileDescriptionText: '发明专利证书(签章)(400001CA)',
            mailTypeId: type,
            mailTypeName: '固定证书类型',
            enabled: true,
            version: 1,
            updatedAt: '2026-11-11',
          },
          {
            id: 'rejection-map',
            fileDescriptionText: '驳回决定(200305)',
            mailTypeId: type,
            mailTypeName: '固定证书类型',
            enabled: true,
            version: 1,
            updatedAt: '2026-11-11',
          },
        ],
        recipients: [],
        signatures: [],
        subject: { template: '固定-{文件名称}', countInjection: false, anchor: '', missingAnchor: 'keep', version: 1 },
        body: { template: '', supplement: '', version: 1 },
        defaultReviewer: { userId: guid(40), name: '全局审核人' },
        defaultSender: { mailsetId: guid(41), label: '全局发件人<global@example.com>' },
        defaultSignatureId: `site:${signature}`,
      },
    },
  )
  const app = await context.newPage()
  await app.goto(`chrome-extension://${new URL(worker.url()).host}/app.html#/customers`)
  const choose = async (locator, label) => {
    await locator.click()
    await app.getByRole('option', { name: label, exact: true }).click()
  }
  await app.locator('tr').filter({ hasText: '客户甲' }).getByRole('button', { name: '修改', exact: true }).click()
  assert.equal(await app.locator('[data-field=title], [data-field=mailType]').count(), 0)
  const boxes = await app
    .locator('.is-people [data-field]')
    .evaluateAll(nodes =>
      nodes.map(n => ({ left: n.getBoundingClientRect().left, top: n.getBoundingClientRect().top })),
    )
  assert.equal(boxes.length, 3)
  assert.ok(boxes.every(b => Math.abs(b.top - boxes[0].top) < 2))
  checks.push('three-column layout; no customer title/type overrides')
  for (const [field, label] of [
    ['sender', '客户发件人<sender@example.com>'],
    ['reviewer', '客户审核人'],
    ['signature', '客户签名'],
  ])
    await choose(app.locator(`[data-field=${field}] [role=combobox]`), label)
  await app.locator('[data-field=to] textarea').fill('追加(extra@example.com);')
  await app.getByLabel('抄送发件人', { exact: true }).uncheck()
  await app.getByLabel('抄送商务', { exact: true }).uncheck()
  await app.locator('[data-field=cc] textarea').fill('指定(cc@example.com);')
  await app.getByRole('button', { name: '保存', exact: true }).click()
  await app.getByText('客户已保存。查询条件要到对应的查询页里填写，再绑定回来。', { exact: true }).waitFor()
  await app.reload()
  await app.locator('tr').filter({ hasText: '客户甲' }).getByRole('button', { name: '修改', exact: true }).click()
  assert.equal(await app.locator('[data-field=to] textarea').inputValue(), '追加(extra@example.com);')
  assert.equal(await app.getByLabel('抄送商务', { exact: true }).isChecked(), false)
  await app.locator('tr').filter({ hasText: '客户乙' }).getByRole('button', { name: '修改', exact: true }).click()
  assert.equal(await app.locator('[data-field=to] textarea').inputValue(), '')
  checks.push('save/reload and customer isolation')
  await app.goto(`chrome-extension://${new URL(worker.url()).host}/app.html#/tasks`)
  await app.getByRole('button', { name: '按工作流发文', exact: true }).click()
  await choose(app.getByRole('combobox', { name: '工作流', exact: true }), '文件管理')
  await choose(app.getByRole('combobox', { name: '客户', exact: true }), '客户甲')
  await app.getByRole('button', { name: '按绑定条件查询', exact: true }).click()
  await app.getByText('可以创建', { exact: true }).waitFor()
  await app.getByText('编号兼容匹配：发明专利证书(签章)(400001CA)', { exact: true }).waitFor()
  await app.getByRole('alert').filter({ hasText: '1 封的文件描述映射存在歧义' }).waitFor()
  const ambiguousRow = app.locator('tr').filter({ hasText: '驳回决定.pdf' })
  assert.equal(await ambiguousRow.getByRole('checkbox').isDisabled(), true)
  await ambiguousRow.getByText(/缺少文书编号/).waitFor()
  checks.push('unique fallback is noted and ambiguous fallback has an alert and cannot be selected')
  await app.getByLabel('勾选可以创建的', { exact: true }).check()
  await app.getByRole('button', { name: /^创建并提交/ }).click()
  await app.waitForFunction(
    () => document.body.textContent.includes('已提交 1 封') || document.body.textContent.includes('已提交给默认审核人'),
    undefined,
    { timeout: 15000 },
  )
  const create = calls.find(x => x.call === 'MailCustomer').params,
    save = calls.find(x => x.call === 'SaveMailInfo').params,
    submit = calls.find(x => x.call === 'MailSubmit').params
  assert.equal(create.mailstyle, '2')
  assert.equal(create.mailtype, type)
  assert.equal(create._file_ids, file)
  assert.equal(save.mail_to, '案件(case@example.com);追加(extra@example.com);')
  assert.equal(save.mail_cc, '指定(cc@example.com);')
  assert.equal(save.mailset_id, sender)
  assert.match(save.mail_subject, /^固定-/)
  assert.match(save.mail_body, /<div>客户签名<\/div>/)
  assert.equal(submit.f_next_user_id, reviewer)
  checks.push('real extension UI -> content bridge -> create/save/submit requests use customer configuration')
  // 后台入口也必须拦住与旧合并草稿不一致的附件；不再发送保存或提交。
  const writeCount = calls.filter(x => ['SaveMailInfo', 'MailSubmit', 'MailCustomer'].includes(x.call)).length
  const reused = await app.evaluate(
    payload =>
      chrome.runtime.sendMessage({
        type: 'WORKSPACE',
        payload: { action: 'forward', message: { type: 'SUBMIT_FILE_MANAGE', payload } },
      }),
    {
      userId: user,
      items: [
        {
          fileId: file,
          fileIds: [file],
          fileNames: ['通知书.pdf'],
          mailId: mail,
          mailTypeId: type,
          mailStyle: '2',
          subject: '单文件',
          senderId: sender,
          senderName: '客户发件人',
          senderEmail: 'sender@example.com',
          reviewerId: reviewer,
          reviewerName: '客户审核人',
          signature,
        },
      ],
    },
  )
  assert.match(JSON.stringify(reused), /附件与本次选择不一致/)
  assert.equal(calls.filter(x => ['SaveMailInfo', 'MailSubmit', 'MailCustomer'].includes(x.call)).length, writeCount)
  checks.push('mismatched reused merged draft blocked before any write')
  await app.locator('.progress-mask').getByRole('button', { name: '关闭', exact: true }).click()
  await app.goto(`chrome-extension://${new URL(worker.url()).host}/app.html#/customers`)
  await app.locator('tr').filter({ hasText: '客户甲' }).getByRole('button', { name: '修改', exact: true }).click()
  await choose(app.locator('[data-field=sender] [role=combobox]'), '默认：全局发件人<global@example.com>')
  await app.locator('[data-field=to] textarea').fill('')
  await app.getByLabel('抄送发件人', { exact: true }).check()
  await app.getByLabel('抄送商务', { exact: true }).check()
  await app.locator('[data-field=cc] textarea').fill('')
  await app.getByRole('button', { name: '保存', exact: true }).click()
  await app.getByText('客户已保存。查询条件要到对应的查询页里填写，再绑定回来。', { exact: true }).waitFor()
  const stored = await app.evaluate(async key => (await chrome.storage.local.get(key))[key], queryKey)
  assert.equal(stored.customers.find(p => p.id === 'a').fileMailConfig.sender, undefined)
  assert.equal(stored.customers.find(p => p.id === 'a').fileMailConfig.to, undefined)
  assert.equal(stored.customers.find(p => p.id === 'a').fileMailConfig.cc, undefined)
  assert.equal(stored.customers.find(p => p.id === 'b').fileMailConfig, undefined)
  checks.push('clearing fields persists default inheritance without changing another customer')
  assert.deepEqual(errors, [])
  await mkdir(reportsDir, { recursive: true })
  await app.screenshot({ path: resultPath('file-manage-customer.png'), fullPage: true })
  await writeFile(
    resultPath('file-manage-customer.json'),
    JSON.stringify(
      {
        checks,
        browserErrors: errors,
        writes: calls.filter(x => ['MailCustomer', 'SaveMailInfo', 'MailSubmit'].includes(x.call)).map(x => x.call),
      },
      null,
      2,
    ),
  )
  console.log(JSON.stringify({ checks, browserErrors: errors }, null, 2))
} finally {
  await context.close()
}
