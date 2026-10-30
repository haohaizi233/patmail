import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { distDir as dist } from '../support/paths.mjs'

async function choose(page, label, value) {
  await page.getByRole('combobox', { name: label }).click()
  await page.getByRole('option', { name: value, exact: true }).click()
}

async function saveCustomerProfile(page, name) {
  await choose(page, '客户名称', name)
  await choose(page, '查询入口', '文件查询')
  await choose(page, '发文方式', '同客户合并发文')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await page.getByText('客户已保存。查询条件要到对应的查询页里填写，再绑定回来。', { exact: true }).waitFor()
}

export async function runWorkspaceFlow(ctx) {
  const { report, context, worker, extensionId, page, panel, host, url, easyUrl, apiCalls, visible, tabFor, showPanel } = ctx
  let workspace
  const check = (name, action) => report.check(name, action)
  const note = (line) => report.note(line)
  await check('icon action opens one full-page workspace and the next call focuses it', async () => {
    const manifest = JSON.parse(await readFile(path.join(dist, 'manifest.json'), 'utf8'))
    assert.equal(manifest.action.default_popup, undefined)
    assert.equal((await readFile(path.join(dist, 'app.html'), 'utf8')).includes('./app.js'), true)
    const launcher = await context.newPage()
    await launcher.goto(`chrome-extension://${extensionId}/src/popup/index.html`)
    const opened = context.waitForEvent('page')
    const first = await launcher.evaluate(() => chrome.runtime.sendMessage({ type: 'WORKSPACE', payload: { action: 'focus' } }))
    assert.equal(first.payload.appTab.created, true)
    const app = await opened
    const second = await launcher.evaluate(() => chrome.runtime.sendMessage({ type: 'WORKSPACE', payload: { action: 'focus' } }))
    assert.equal(second.payload.appTab.created, false)
    assert.equal(first.payload.appTab.tabId, second.payload.appTab.tabId)
    const tabs = await worker.evaluate(() => chrome.tabs.query({}))
    assert.equal(tabs.filter((item) => item.url?.includes('/app.html')).length, 1)
    await app.getByRole('button', { name: '客户管理' }).click()
    await app.waitForURL(/#\/customers$/)
    await app.reload()
    await app.waitForURL(/#\/customers$/)
    await app.getByText('尚未连接', { exact: true }).waitFor()
    await app.getByText('还没确认当前登录的人，暂时不能保存客户。').waitFor()
    assert.equal(await app.getByText('华为').count(), 0)
    assert.equal(await app.getByText('DEMO').count(), 0)
    assert.equal(await app.getByText('已成功发送').count(), 0)
    await context.addCookies([{ name: 'pm_fixture_session', value: 'active', url: easyUrl, httpOnly: true, sameSite: 'Lax' }])
    const easyPage = await context.newPage()
    await easyPage.goto(easyUrl)
    const easyTab = await tabFor(easyPage)
    try {
      await easyPage.evaluate(() => {
        window._UserMenu = [
          { is_page: true, menu_url: 'Forms/FileSearch.aspx', menu_name: '文件查询' },
          { is_business: true, menu_url: 'Forms/mail/mail.aspx', menu_name: '邮件处理' }
        ]
        window.__patmailOpenCalls = []
        window.AddBusinessTab = (id, title, path) => window.__patmailOpenCalls.push({ id, title, path })
      })

      const surfaces = await worker.evaluate(tabId => chrome.tabs.sendMessage(tabId, { type: 'READ_QUERY_SURFACES' }), easyTab.id)
      assert.equal(surfaces.type, 'QUERY_SURFACES_RESULT')
      assert.deepEqual(surfaces.payload.surfaces, [{ id: 'file', label: '文件查询', url: 'Forms/FileSearch.aspx' }])

      const mailId = '11111111-1111-4111-8111-111111111111'
      const openedForm = await worker.evaluate(({ tabId, id }) => chrome.tabs.sendMessage(tabId, {
        type: 'OPEN_EASY_FORM',
        payload: { target: { kind: 'CO', id, caseTypeId: '', filingType: '', title: '邮件处理页' } }
      }), { tabId: easyTab.id, id: mailId })
      assert.deepEqual(openedForm, {
        type: 'OPEN_EASY_FORM_RESULT',
        payload: { ok: true, message: '已在 EASY 首页打开。' }
      })
      assert.deepEqual(await easyPage.evaluate(() => window.__patmailOpenCalls), [{
        id: `f_${mailId}`, title: '邮件处理页', path: `Forms/mail/mail.aspx?objid=${mailId}`
      }])

      const deniedForm = await worker.evaluate(({ tabId, id }) => chrome.tabs.sendMessage(tabId, {
        type: 'OPEN_EASY_FORM',
        payload: {
          target: {
            kind: 'AP', id, caseTypeId: '31D1A147-2931-43B5-94AE-B72B1525BA8A', filingType: '', title: '未授权提案页'
          }
        }
      }), { tabId: easyTab.id, id: '22222222-2222-4222-8222-222222222222' })
      assert.deepEqual(deniedForm, {
        type: 'OPEN_EASY_FORM_RESULT',
        payload: { ok: false, message: '原网站菜单里没有这个页面，不能打开。' }
      })
      assert.equal((await easyPage.evaluate(() => window.__patmailOpenCalls)).length, 1)
    } finally {
      await easyPage.evaluate(() => {
        delete window._UserMenu
        delete window.AddBusinessTab
        delete window.__patmailOpenCalls
      })
    }
    assert.equal(await easyPage.locator('patmail-root').count(), 0)
    await app.bringToFront()
    await app.reload()
    await app.getByText('测试员').waitFor()
    await app.getByRole('button', { name: '文件管理' }).click()
    await app.getByText('EASY 已连接', { exact: true }).waitFor()
    await app.getByLabel('我方文号').fill('A+123')
    await app.getByRole('button', { name: '查询文件' }).click()
    await app.getByText('通知书-1.pdf').waitFor()
    await app.getByRole('button', { name: '系统设置' }).click()
    const writeSwitch = app.getByRole('checkbox', { name: '写开关' })
    assert.equal(await writeSwitch.isChecked(), true)
    await writeSwitch.uncheck()
    assert.equal(await writeSwitch.isChecked(), false)
    await app.getByText('已关闭。不会写回查询模板，也不会创建邮件、保存草稿或提交流程。', { exact: true }).waitFor()
    await easyPage.close()
    workspace = app
  })
  await check('FullPageBusinessFlow saves a task from the full page and restores it', async () => {
    const app = workspace
    await context.addCookies([{ name: 'pm_fixture_session', value: 'active', url: easyUrl, httpOnly: true, sameSite: 'Lax' }])
    const easyPage = await context.newPage()
    await easyPage.goto(easyUrl)
    await tabFor(easyPage)
    assert.equal(await easyPage.locator('patmail-root').count(), 0)
    await app.bringToFront()
    await app.reload()
    await app.getByText('测试员').waitFor()
    await app.getByRole('button', { name: '客户管理' }).click()
    await saveCustomerProfile(app, '测试客户')
    assert.equal(await app.locator('tbody tr').count(), 1)
    await app.locator('tbody tr').filter({ hasText: '测试客户' }).getByRole('button', { name: '修改' }).click()
    await choose(app, '客户名称', '测试客户甲')
    await app.getByRole('button', { name: '保存', exact: true }).click()
    await app.getByText('客户已保存。查询条件要到对应的查询页里填写，再绑定回来。', { exact: true }).waitFor()
    await app.reload()
    await app.locator('tbody tr').filter({ hasText: '测试客户甲' }).waitFor()
    await app.locator('tbody tr').filter({ hasText: '测试客户甲' }).getByRole('button', { name: '修改' }).click()
    await choose(app, '客户名称', '测试客户')
    await app.getByRole('button', { name: '保存', exact: true }).click()
    await app.getByText('客户已保存。查询条件要到对应的查询页里填写，再绑定回来。', { exact: true }).waitFor()
    const other = await context.newPage()
    await other.goto(`chrome-extension://${extensionId}/app.html#/customers`)
    await other.getByText('测试客户').waitFor()
    await app.bringToFront()
    await app.locator('tbody tr').filter({ hasText: '测试客户' }).getByRole('button', { name: '修改' }).click()
    await choose(app, '客户名称', '测试客户同步')
    await app.getByRole('button', { name: '保存', exact: true }).click()
    await app.getByText('客户已保存。查询条件要到对应的查询页里填写，再绑定回来。', { exact: true }).waitFor()
    await other.bringToFront()
    await other.getByText('测试客户同步').waitFor()
    await app.locator('tbody tr').filter({ hasText: '测试客户同步' }).getByRole('button', { name: '修改' }).click()
    await choose(app, '客户名称', '测试客户')
    await app.getByRole('button', { name: '保存', exact: true }).click()
    await app.getByText('客户已保存。查询条件要到对应的查询页里填写，再绑定回来。', { exact: true }).waitFor()
    await other.close()
    console.log('[workspace] customer save, edit, reload, and cross-tab synchronization passed')
    await app.getByRole('button', { name: '文件管理' }).click()
    await app.getByRole('combobox', { name: '每页数量' }).click()
    await app.getByRole('option', { name: '20', exact: true }).click()
    await app.getByLabel('我方文号').fill('A+123')
    await app.getByRole('button', { name: '查询文件' }).click()
    await app.getByRole('checkbox', { name: '通知书-1.pdf' }).check()
    await app.getByRole('button', { name: '下一页' }).click()
    await app.getByRole('checkbox', { name: '通知书-2.pdf' }).check()
    await app.getByRole('button', { name: '查看已选' }).click()
    await app.getByRole('combobox', { name: '绑定到已有客户配置' }).click()
    await app.getByRole('option', { name: '测试客户', exact: true }).waitFor()
    await app.getByRole('option', { name: '测试客户', exact: true }).click()
    await app.getByRole('button', { name: '绑定已选文件' }).click()
    await app.getByRole('button', { name: '生成发文计划' }).click()
    const templateReady = await app.evaluate(async () => {
      const loaded = await chrome.runtime.sendMessage({ type: 'WORKSPACE', payload: { action: 'load' } })
      const connection = loaded.payload.connection
      return chrome.runtime.sendMessage({
        type: 'WORKSPACE',
        payload: {
          action: 'saveQueryTemplate',
          expectedVersion: null,
          expectedScope: {
            easyOrigin: connection.easyOrigin,
            operatorId: connection.operatorId,
            easyTabId: connection.easyTabId,
            connectionVersion: connection.connectionVersion
          },
          template: {
            id: 'manual', name: '基础模板', source: 'local', queryType: 'FileSearch',
            fields: { filetype: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
            version: 1, createdAt: '2026-09-26T00:00:00.000Z', updatedAt: '2026-09-26T00:00:00.000Z'
          }
        }
      })
    })
    assert.equal(templateReady.payload.ok, true)
    await app.getByRole('button', { name: '生成计划' }).click()
    await app.getByText(/已保存 · 任务 /).first().waitFor()
    const taskId = (await app.getByText(/已保存 · 任务 /).first().innerText()).split('任务').pop().trim()
    assert.match(taskId, /^[0-9a-f-]{36}$/i)
    const provenance = await app.evaluate(async (id) => {
      const loaded = await chrome.runtime.sendMessage({ type: 'WORKSPACE', payload: { action: 'load' } })
      const connection = loaded.payload.connection
      const got = await chrome.runtime.sendMessage({ type: 'GET_TASK', payload: { origin: connection.easyOrigin, operatorId: connection.operatorId, taskId: id } })
      const task = got.payload.task
      const selection = task.verifiedSelection || []
      return {
        fileSource: task.fileSource,
        selections: selection.map((item) => item.verification),
        sessions: [...new Set(selection.map((item) => item.querySessionId))],
        names: selection.map((item) => item.fileName),
        customers: selection.map((item) => item.sourceCustomerName),
        descriptionIds: (task.selectedFiles || []).map((item) => item.fileDescriptionId || ''),
        customerIds: (task.selectedFiles || []).map((item) => item.customerId || ''),
        caseIds: (task.selectedFiles || []).map((item) => item.caseId || '')
      }
    }, taskId)
    assert.equal(provenance.fileSource, 'SEARCH_RESPONSE_OBSERVED')
    assert.deepEqual(provenance.selections, ['SEARCH_RESPONSE_OBSERVED', 'SEARCH_RESPONSE_OBSERVED'])
    assert.equal(provenance.sessions.length, 1)
    assert.ok(provenance.sessions[0])
    assert.deepEqual(provenance.names, ['通知书-1.pdf', '通知书-2.pdf'])
    assert.deepEqual(provenance.customers, ['测试客户', '测试客户'])
    assert.deepEqual(provenance.descriptionIds, ['', ''])
    assert.deepEqual(provenance.customerIds, ['', ''])
    assert.deepEqual(provenance.caseIds, ['', ''])
    console.log('[workspace] full-page selection and persisted task provenance passed')
    const expired = await app.evaluate(async (id) => {
      const loaded = await chrome.runtime.sendMessage({ type: 'WORKSPACE', payload: { action: 'load' } })
      const connection = loaded.payload.connection
      const key = `${connection.easyOrigin}\u0000${connection.operatorId}`
      const database = await new Promise((resolve, reject) => {
        const request = indexedDB.open('patmail-automation-tasks')
        request.onerror = () => reject(request.error)
        request.onsuccess = () => resolve(request.result)
      })
      return await new Promise((resolve, reject) => {
        const tx = database.transaction('bundles', 'readwrite')
        const store = tx.objectStore('bundles')
        const current = store.get(key)
        current.onerror = () => reject(current.error)
        current.onsuccess = () => {
          const bundle = current.result
          const task = (bundle?.tasks || []).find((item) => item.taskId === id)
          const stamps = (task?.verifiedSelection || []).map((item) => item.fetchedAt)
          ;(task?.verifiedSelection || []).forEach((item) => { item.evidenceExpiresAt = '2000-01-01T00:00:00.000Z' })
          if (bundle && task) store.put(bundle, key)
          tx.oncomplete = () => resolve(stamps)
          tx.onerror = () => reject(tx.error)
        }
      })
    }, taskId)
    await app.getByRole('button', { name: new RegExp(taskId) }).click()
    await app.getByText('查询证据已过期，请重新查询。').waitFor()
    const kept = await app.evaluate(async (id) => {
      const loaded = await chrome.runtime.sendMessage({ type: 'WORKSPACE', payload: { action: 'load' } })
      const connection = loaded.payload.connection
      const got = await chrome.runtime.sendMessage({ type: 'GET_TASK', payload: { origin: connection.easyOrigin, operatorId: connection.operatorId, taskId: id } })
      return (got.payload.task.verifiedSelection || []).map((item) => item.fetchedAt)
    }, taskId)
    assert.deepEqual(kept, expired)
    console.log('[workspace] expired evidence preserved its original fetch timestamps')
    const templated = await app.evaluate(async (id) => {
      const loaded = await chrome.runtime.sendMessage({ type: 'WORKSPACE', payload: { action: 'load' } })
      const connection = loaded.payload.connection
      const saved = await chrome.runtime.sendMessage({
        type: 'WORKSPACE',
        payload: {
          action: 'saveQueryTemplate',
          expectedVersion: 1,
          expectedScope: {
            easyOrigin: connection.easyOrigin,
            operatorId: connection.operatorId,
            easyTabId: connection.easyTabId,
            connectionVersion: connection.connectionVersion
          },
          template: {
            id: 'manual', name: '基础模板', source: 'local', queryType: 'FileSearch',
            fields: { filetype: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
            version: 1, createdAt: '2026-09-26T00:00:00.000Z', updatedAt: '2026-09-26T00:00:00.000Z'
          }
        }
      })
      const again = await chrome.runtime.sendMessage({ type: 'WORKSPACE', payload: { action: 'load' } })
      return { ok: saved.payload.ok, status: again.payload.tasks.find((item) => item.taskId === id)?.status }
    }, taskId)
    assert.equal(templated.ok, true)
    assert.equal(templated.status, 'STALE')
    await app.getByRole('button', { name: '发文任务' }).click()
    await app.waitForURL(/#\/tasks/)
    await app.getByRole('button', { name: '详情' }).click()
    await app.getByText(taskId).waitFor()
    await app.getByText('Origin http://183.36.43.66:88').waitFor()
    await app.getByText('文件 2').waitFor()
    const taskUrl = app.url()
    await app.reload()
    await app.waitForURL(/#\/tasks/)
    await app.getByRole('button', { name: '详情' }).click()
    await app.getByText(taskId).waitFor()
    await app.getByText('Origin http://183.36.43.66:88').waitFor()
    await app.getByRole('button', { name: '发文映射' }).click()
    await app.getByLabel('标题模板').fill('阶段三标题{文件名称}')
    await app.getByRole('button', { name: '保存标题和正文' }).click()
    await app.getByText('标题和正文已保存。', { exact: true }).waitFor()
    await app.getByRole('button', { name: '发文任务' }).click()
    const staleTaskRow = app.getByRole('row').filter({
      has: app.getByRole('button', { name: `${taskId} 详情` })
    })
    await staleTaskRow.getByRole('cell', { name: '计划已过期', exact: true }).waitFor()
    const protectedTask = await app.evaluate(async () => {
      const loaded = await chrome.runtime.sendMessage({ type: 'WORKSPACE', payload: { action: 'load' } })
      const connection = loaded.payload.connection
      const taskId = loaded.payload.tasks[0].taskId
      const got = await chrome.runtime.sendMessage({ type: 'GET_TASK', payload: { origin: connection.easyOrigin, operatorId: connection.operatorId, taskId } })
      const task = got.payload.task
      const mailId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      task.status = 'UNKNOWN'
      task.checkpoints = [{ stage: 'MAIL_CREATE', itemId: '', requestSent: true, responseReceived: false, verified: false, easyMailId: mailId, at: '2026-09-26T00:00:00.000Z', note: 'sent' }]
      if (Array.isArray(task.items) && task.items[0]) task.items[0].easyMailId = mailId
      const key = `${connection.easyOrigin}\u0000${connection.operatorId}`
      await new Promise((resolve, reject) => {
        const request = indexedDB.open('patmail-automation-tasks', 1)
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const database = request.result
          const tx = database.transaction('bundles', 'readwrite')
          const store = tx.objectStore('bundles')
          const current = store.get(key)
          current.onsuccess = () => {
            const raw = current.result || { version: 2, tasks: [], migrations: [] }
            const tasks = Array.isArray(raw.tasks) ? raw.tasks.map((item) => item.taskId === task.taskId ? task : item) : [task]
            if (!tasks.some((item) => item.taskId === task.taskId)) tasks.push(task)
            store.put({ ...raw, version: 2, tasks }, key)
          }
          tx.oncomplete = () => resolve(true)
          tx.onerror = () => reject(tx.error)
        }
      })
      const incoming = { ...task, status: 'READY', checkpoints: [], items: (task.items || []).map((item) => ({ ...item, easyMailId: '' })) }
      const saved = await chrome.runtime.sendMessage({ type: 'SAVE_TASK', payload: { task: incoming } })
      const again = await chrome.runtime.sendMessage({ type: 'GET_TASK', payload: { origin: connection.easyOrigin, operatorId: connection.operatorId, taskId } })
      return {
        ok: saved.payload.ok,
        message: saved.payload.message,
        status: again.payload.task.status,
        requestSent: again.payload.task.checkpoints?.[0]?.requestSent,
        easyMailId: again.payload.task.checkpoints?.[0]?.easyMailId
      }
    })
    assert.equal(protectedTask.ok, false)
    assert.match(protectedTask.message, /正式页面不能提交完整任务/)
    assert.equal(protectedTask.status, 'UNKNOWN')
    assert.equal(protectedTask.requestSent, true)
    assert.equal(protectedTask.easyMailId, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
    const forged = await app.evaluate(async () => {
      const loaded = await chrome.runtime.sendMessage({ type: 'WORKSPACE', payload: { action: 'load' } })
      const connection = loaded.payload.connection
      const currentId = loaded.payload.tasks[0].taskId
      const got = await chrome.runtime.sendMessage({ type: 'GET_TASK', payload: { origin: connection.easyOrigin, operatorId: connection.operatorId, taskId: currentId } })
      const task = got.payload.task
      task.status = 'READY'
      task.readonly = false
      if (Array.isArray(task.items)) task.items.forEach((item) => {
        item.status = 'COMPLETED'
        item.easyMailId = ''
        item.mailExecutionId = ''
        item.workflowExecutionId = ''
      })
      task.checkpoints = [{ stage: 'MAIL_CREATE', itemId: '', requestSent: false, responseReceived: false, verified: true, easyMailId: '', at: '', note: '' }]
      const saved = await chrome.runtime.sendMessage({ type: 'SAVE_TASK', payload: { task } })
      return saved.payload.message
    })
    assert.match(forged, /不能由页面声明子任务完成/)
    console.log('[workspace] stale-task and forged-completion protections passed')
    const crossPage = await app.evaluate(async () => {
      const loaded = await chrome.runtime.sendMessage({ type: 'WORKSPACE', payload: { action: 'load' } })
      const connection = loaded.payload.connection
      const scope = {
        easyOrigin: connection.easyOrigin,
        operatorId: connection.operatorId,
        easyTabId: connection.easyTabId,
        connectionVersion: connection.connectionVersion
      }
      const query = { caseVolume: 'E2E-PAGE', pageIndex: 3, pageSize: 20 }
      const first = await chrome.runtime.sendMessage({ type: 'WORKSPACE', payload: { action: 'forward', message: { type: 'SEARCH_FILES', payload: { query } } } })
      const sessionId = first.payload.forwarded && first.payload.forwarded.payload && first.payload.forwarded.payload.data && first.payload.forwarded.payload.data.querySessionId
      const second = await chrome.runtime.sendMessage({ type: 'WORKSPACE', payload: { action: 'forward', message: { type: 'SEARCH_FILES', payload: { query: { ...query, pageIndex: 4 }, continuation: { querySessionId: sessionId } } } } })
      const planned = await chrome.runtime.sendMessage({
        type: 'WORKSPACE',
        payload: {
          action: 'createTaskPlan',
          queryTemplateVersion: 0,
          expectedScope: scope,
          files: [3, 4].map((page) => ({
            fileId: `file-${page}`,
            fileName: `通知书-${page}.pdf`,
            fileDescription: '审查意见通知书',
            customerName: '测试客户',
            caseVolume: 'E2E-PAGE',
            caseId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
            fileDescriptionId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
            customerId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
            querySessionId: sessionId,
            customerProfileId: 'profile-a',
            customerBinding: { profileId: 'profile-a', profileName: '测试客户', sourceCustomerName: '测试客户', confirmed: true, source: 'explicit' }
          }))
        }
      })
      const taskId = planned.payload.createdTask && planned.payload.createdTask.taskId
      const got = taskId ? await chrome.runtime.sendMessage({ type: 'GET_TASK', payload: { origin: connection.easyOrigin, operatorId: connection.operatorId, taskId } }) : null
      const stored = got && got.payload.task ? got.payload.task.selectedFiles || [] : []
      const responseSummary = result => {
        const forwarded = result?.payload?.forwarded
        const payload = forwarded?.payload
        return {
          type: forwarded?.type ?? '',
          ok: payload?.ok,
          error: payload?.error?.message ?? payload?.error ?? ''
        }
      }
      return {
        connectionVersion: scope.connectionVersion,
        firstOk: first.payload.ok,
        secondOk: second.payload.ok,
        planOk: planned.payload.ok,
        firstResponse: responseSummary(first),
        secondResponse: responseSummary(second),
        fileSource: planned.payload.createdTask && planned.payload.createdTask.fileSource,
        selections: got && got.payload.task ? (got.payload.task.verifiedSelection || []).map((item) => item.verification) : [],
        sessions: got && got.payload.task ? [...new Set((got.payload.task.verifiedSelection || []).map((item) => item.querySessionId))] : [],
        caseIds: stored.map((item) => item.caseId || ''),
        descriptionIds: stored.map((item) => item.fileDescriptionId || ''),
        customerIds: stored.map((item) => item.customerId || ''),
        sourcePersistence: first.payload.forwarded?.payload?.data?.sourcePersistence ?? null,
        sourceMessage: first.payload.forwarded?.payload?.data?.sourceMessage ?? '',
        evidenceRestorable: got && got.payload.task && got.payload.task.identityGate && got.payload.task.identityGate.evidenceRestorable,
        descriptionVerified: got && got.payload.task && got.payload.task.identityGate && got.payload.task.identityGate.descriptionIdsVerified,
        customerVerified: got && got.payload.task && got.payload.task.identityGate && got.payload.task.identityGate.customerIdsVerified
      }
    })
    assert.equal(crossPage.firstOk, true, `first cross-page forwarding response: ${JSON.stringify(crossPage.firstResponse)}`)
    assert.equal(crossPage.firstResponse.ok, true, `first cross-page search response: ${JSON.stringify(crossPage.firstResponse)}`)
    assert.equal(crossPage.secondOk, true, `second cross-page forwarding response: ${JSON.stringify(crossPage.secondResponse)}`)
    assert.equal(crossPage.secondResponse.ok, true, `second cross-page search response: ${JSON.stringify(crossPage.secondResponse)}`)
    assert.equal(crossPage.planOk, true)
    assert.equal(crossPage.fileSource, 'SEARCH_RESPONSE_OBSERVED')
    assert.deepEqual(crossPage.selections, ['SEARCH_RESPONSE_OBSERVED', 'SEARCH_RESPONSE_OBSERVED'])
    assert.deepEqual(crossPage.sessions, [crossPage.sessions[0]])
    assert.ok(crossPage.sessions[0])
    assert.deepEqual(crossPage.caseIds, ['', ''])
    assert.deepEqual(crossPage.descriptionIds, ['', ''])
    assert.deepEqual(crossPage.customerIds, ['', ''])
    assert.equal(crossPage.sourcePersistence, 'PERSISTED')
    assert.equal(crossPage.sourceMessage, '已保存查询来源。')
    assert.equal(crossPage.evidenceRestorable, true)
    assert.equal(crossPage.descriptionVerified, false)
    assert.equal(crossPage.customerVerified, false)
    console.log('[workspace] cross-page search evidence and task provenance passed')
    const conflict = await app.evaluate(async () => {
      const loaded = await chrome.runtime.sendMessage({ type: 'WORKSPACE', payload: { action: 'load' } })
      const connection = loaded.payload.connection
      const scope = {
        easyOrigin: connection.easyOrigin,
        operatorId: connection.operatorId,
        easyTabId: connection.easyTabId,
        connectionVersion: connection.connectionVersion
      }
      const query = { caseVolume: 'E2E-CONFLICT', fileName: 'dup-id', pageIndex: 1, pageSize: 20 }
      const found = await chrome.runtime.sendMessage({ type: 'WORKSPACE', payload: { action: 'forward', message: { type: 'SEARCH_FILES', payload: { query } } } })
      const data = found.payload.forwarded && found.payload.forwarded.payload.data
      const sessionId = data && data.querySessionId
      const invalid = await chrome.runtime.sendMessage({
        type: 'WORKSPACE',
        payload: { action: 'forward', message: { type: 'SEARCH_FILES', payload: { query: { ...query, pageIndex: 2 }, continuation: { querySessionId: '00000000-0000-4000-8000-000000000099' } } } }
      })
      const invalidData = invalid.payload.forwarded && invalid.payload.forwarded.payload.data
      const planned = await chrome.runtime.sendMessage({
        type: 'WORKSPACE',
        payload: {
          action: 'createTaskPlan',
          queryTemplateVersion: 0,
          expectedScope: scope,
          files: [{
            fileId: 'file-dup',
            fileName: '重复.pdf',
            fileDescription: '专利证书',
            customerName: '测试客户',
            caseVolume: 'E2E-CONFLICT',
            querySessionId: sessionId
          }]
        }
      })
      return {
        searchOk: found.payload.ok,
        itemCount: data && data.items ? data.items.length : 0,
        sourceCode: data && data.sourceCode,
        sourceMessage: data && data.sourceMessage,
        invalidCode: invalidData && invalidData.sourceCode,
        invalidSession: invalidData && invalidData.querySessionId || '',
        planStatus: planned.payload.createdTask && planned.payload.createdTask.status,
        planSource: planned.payload.createdTask && planned.payload.createdTask.fileSource
      }
    })
    assert.equal(conflict.searchOk, true)
    assert.equal(conflict.itemCount, 2)
    assert.equal(conflict.sourceCode, 'FILE_DATA_CONFLICT')
    assert.equal(conflict.sourceMessage, '查询运行冲突。')
    assert.equal(conflict.invalidCode, 'QUERY_SESSION_INVALID')
    assert.equal(conflict.invalidSession, '')
    assert.equal(conflict.planStatus, 'BLOCKED')
    assert.equal(conflict.planSource, 'FILE_SOURCE_UNVERIFIED')
    console.log('[workspace] duplicate-file conflict and invalid continuation protections passed')
    const storedSessionIds = await app.evaluate(async () => {
      const database = await new Promise((resolve, reject) => {
        const request = indexedDB.open('patmail-file-query-sessions')
        request.onerror = () => reject(request.error)
        request.onsuccess = () => resolve(request.result)
      })
      const rows = await new Promise((resolve, reject) => {
        const tx = database.transaction('sessions', 'readonly')
        const request = tx.objectStore('sessions').getAll()
        request.onsuccess = () => resolve(request.result || [])
        request.onerror = () => reject(request.error)
      })
      return rows.map(row => row.querySessionId)
    })
    const rememberedSession = crossPage.sessions[0]
    assert.ok(storedSessionIds.includes(rememberedSession), `persisted query sessions did not include ${rememberedSession}: ${storedSessionIds.join(', ')}`)
    console.log('[workspace] query session is persisted before service-worker restart')
    const liveWorkerBefore = context.serviceWorkers().find(item => item.url().includes(extensionId))
    assert.ok(liveWorkerBefore)
    const restartBrowser = context.browser()
    assert.ok(restartBrowser)
    const restartCdp = await restartBrowser.newBrowserCDPSession()
    const restartTargets = await restartCdp.send('Target.getTargets')
    const restartTarget = restartTargets.targetInfos.find(item => item.type === 'service_worker' && item.url.includes(extensionId))
    assert.ok(restartTarget)
    await restartCdp.send('Target.closeTarget', { targetId: restartTarget.targetId })
    await app.reload()
    await app.getByText('测试员').waitFor()
    const recovered = await app.evaluate(async (sessionId) => {
      const loaded = await chrome.runtime.sendMessage({ type: 'WORKSPACE', payload: { action: 'load' } })
      const connection = loaded.payload.connection
      const planned = await chrome.runtime.sendMessage({
        type: 'WORKSPACE',
        payload: {
          action: 'createTaskPlan',
          queryTemplateVersion: 0,
          expectedScope: {
            easyOrigin: connection.easyOrigin,
            operatorId: connection.operatorId,
            easyTabId: connection.easyTabId,
            connectionVersion: connection.connectionVersion
          },
          files: [3, 4].map((page) => ({
            fileId: `file-${page}`,
            fileName: `通知书-${page}.pdf`,
            fileDescription: '审查意见通知书',
            customerName: '测试客户',
            caseVolume: 'E2E-PAGE',
            querySessionId: sessionId
          }))
        }
      })
      const taskId = planned.payload.createdTask && planned.payload.createdTask.taskId
      const got = taskId ? await chrome.runtime.sendMessage({ type: 'GET_TASK', payload: { origin: connection.easyOrigin, operatorId: connection.operatorId, taskId } }) : null
      const task = got && got.payload.task
      return {
        connectionVersion: connection.connectionVersion,
        fileSource: planned.payload.createdTask && planned.payload.createdTask.fileSource,
        historical: task && task.verifiedSelection ? task.verifiedSelection.map((item) => item.historicalObservation) : [],
        recovery: task && task.verifiedSelection ? task.verifiedSelection.map((item) => item.recoveryState) : []
      }
    }, rememberedSession)
    assert.equal(recovered.fileSource, 'FILE_SOURCE_UNVERIFIED')
    assert.equal(recovered.connectionVersion, crossPage.connectionVersion, 'service-worker restart changed the connection scope of persisted search evidence')
    assert.deepEqual(recovered.historical, [true, true])
    assert.deepEqual(recovered.recovery, ['RECOVERED_PENDING_REVALIDATION', 'RECOVERED_PENDING_REVALIDATION'])
    console.log('[workspace] persisted search evidence recovered as historical after service-worker restart')
    const mailCalls = () => apiCalls.filter(item => item.path === '/AjaxServers/Mail.ashx').length
    const beforeRevoke = mailCalls()
    const revoked = await app.evaluate(async () => {
      const loaded = await chrome.runtime.sendMessage({ type: 'WORKSPACE', payload: { action: 'load' } })
      const connection = loaded.payload.connection
      const scope = {
        easyOrigin: connection.easyOrigin,
        operatorId: connection.operatorId,
        easyTabId: connection.easyTabId,
        connectionVersion: connection.connectionVersion
      }
      const query = { caseVolume: 'E2E-REVOKE', pageIndex: 1, pageSize: 20 }
      const first = await chrome.runtime.sendMessage({ type: 'WORKSPACE', payload: { action: 'forward', message: { type: 'SEARCH_FILES', payload: { query } } } })
      const data = first.payload.forwarded && first.payload.forwarded.payload && first.payload.forwarded.payload.data
      const sessionId = data && data.querySessionId
      const planned = await chrome.runtime.sendMessage({
        type: 'WORKSPACE',
        payload: {
          action: 'createTaskPlan',
          queryTemplateVersion: 0,
          expectedScope: scope,
          files: [{
            fileId: 'file-revoke-a',
            fileName: '文件A.pdf',
            fileDescription: '专利证书',
            customerName: '测试客户',
            caseVolume: 'E2E-REVOKE',
            querySessionId: sessionId
          }]
        }
      })
      const taskId = planned.payload.createdTask && planned.payload.createdTask.taskId
      const before = taskId ? await chrome.runtime.sendMessage({ type: 'GET_TASK', payload: { origin: connection.easyOrigin, operatorId: connection.operatorId, taskId } }) : null
      const fetchedAt = before && before.payload.task && before.payload.task.verifiedSelection && before.payload.task.verifiedSelection[0] && before.payload.task.verifiedSelection[0].fetchedAt
      const second = await chrome.runtime.sendMessage({ type: 'WORKSPACE', payload: { action: 'forward', message: { type: 'SEARCH_FILES', payload: { query, continuation: { querySessionId: sessionId } } } } })
      const after = taskId ? await chrome.runtime.sendMessage({ type: 'GET_TASK', payload: { origin: connection.easyOrigin, operatorId: connection.operatorId, taskId } }) : null
      const evidence = after && after.payload.currentEvidence
      return {
        planOk: planned.payload.ok,
        secondOk: second.payload.ok,
        taskId,
        fetchedAt,
        kept: after && after.payload.task && after.payload.task.verifiedSelection && after.payload.task.verifiedSelection[0] && after.payload.task.verifiedSelection[0].fetchedAt,
        reason: evidence && evidence.reason,
        trust: evidence && evidence.currentTrust,
        message: evidence && evidence.message
      }
    })
    assert.equal(revoked.planOk, true)
    assert.equal(revoked.secondOk, true)
    assert.equal(revoked.reason, 'FILE_REMOVED')
    assert.equal(revoked.trust, false)
    assert.equal(revoked.kept, revoked.fetchedAt)
    assert.match(revoked.message, /不再包含/)
    assert.equal(mailCalls(), beforeRevoke)
    console.log('[workspace] removed-file evidence was revoked without an external mail request')
    await app.reload()
    await app.waitForURL(/#\/tasks/)
    await app.getByRole('button', { name: new RegExp(revoked.taskId) }).waitFor()
    await app.getByRole('button', { name: new RegExp(revoked.taskId) }).click()
    const revokedStatus = app.getByRole('status').filter({ hasText: /不再包含/ })
    try {
      await revokedStatus.waitFor()
    } catch (error) {
      const dump = await app.evaluate(async (id) => {
        const loaded = await chrome.runtime.sendMessage({ type: 'WORKSPACE', payload: { action: 'load' } })
        const connection = loaded.payload.connection
        const got = await chrome.runtime.sendMessage({ type: 'GET_TASK', payload: { origin: connection.easyOrigin, operatorId: connection.operatorId, taskId: id } })
        return {
          connection: { easyOrigin: connection.easyOrigin, operatorId: connection.operatorId, sessionStatus: connection.sessionStatus, connectionVersion: connection.connectionVersion },
          responseType: got?.type ?? null,
          taskPresent: Boolean(got?.payload?.task),
          currentEvidence: got?.payload?.currentEvidence ?? null,
          body: document.body.innerText.slice(0, 4000)
        }
      }, revoked.taskId)
      console.log('[workspace] revoked detail dump', JSON.stringify(dump))
      throw error
    }
    assert.equal(mailCalls(), beforeRevoke)
    const beforeMail = mailCalls()
    await app.evaluate(() => { location.hash = '#/acceptance' })
    await app.getByRole('combobox', { name: '接口' }).click()
    await app.getByRole('option', { name: 'GetMailInfo', exact: true }).click()
    await app.getByRole('button', { name: '执行只读验收' }).click()
    await app.getByText('GetMailInfo BLOCKED').waitFor()
    assert.equal(mailCalls(), beforeMail)
    await app.getByLabel('邮件 ID').fill('50250250-5025-4025-8025-502502502502')
    await app.getByRole('button', { name: '执行只读验收' }).click()
    await app.getByText(/GetMailInfo FAIL/).first().waitFor()
    await app.getByRole('combobox', { name: '接口' }).click()
    await app.getByRole('option', { name: 'GetFlowInfo', exact: true }).click()
    await app.getByLabel('邮件 ID').fill('11111111-1111-4111-8111-111111111111')
    await app.getByLabel('流程类型').fill('NO')
    await app.getByRole('button', { name: '执行只读验收' }).click()
    await app.getByText(/GetFlowInfo (BLOCKED|FAIL)/).first().waitFor()
    await app.getByRole('combobox', { name: '接口' }).click()
    await app.getByRole('option', { name: 'GetUserModel', exact: true }).click()
    await app.getByLabel('邮件 ID').fill('')
    await app.getByLabel('流程类型').fill('')
    await app.getByRole('button', { name: '执行只读验收' }).click()
    await app.getByText('GetUserModel PASS').first().waitFor()
    await app.getByText('未与原网页对照').first().waitFor()
    await app.getByLabel('对照字段').fill('userId=11111111-1111-1111-1111-111111111111')
    await app.getByRole('button', { name: '执行只读验收' }).click()
    await app.getByText(/GetUserModel PASS · .*手工期望/).waitFor()
    const manual = await app.getByText(/GetUserModel PASS · .*手工期望/).innerText()
    assert.equal(manual.includes('UI_COMPARED'), false)
    assert.match(manual, /未与原网页对照/)
    assert.match(manual, /GetUserModel PASS/)
    console.log('[workspace] read-only acceptance probes passed without mail writes')
    const storedKey = 'patmail.mail.v1:http://183.36.43.66:88:11111111-1111-1111-1111-111111111111'
    const stale = await app.evaluate(async (key) => {
      const stored = await chrome.storage.local.get(key)
      const bundle = stored[key]
      bundle.revision -= 1
      bundle.subject.template = '过期标题'
      const loaded = await chrome.runtime.sendMessage({ type: 'WORKSPACE', payload: { action: 'load' } })
      const connection = loaded.payload.connection
      return chrome.runtime.sendMessage({
        type: 'WORKSPACE',
        payload: {
          action: 'saveRules',
          bundle,
          expectedScope: {
            easyOrigin: connection.easyOrigin,
            operatorId: connection.operatorId,
            easyTabId: connection.easyTabId,
            connectionVersion: connection.connectionVersion
          }
        }
      })
    }, storedKey)
    assert.equal(stale.payload.ok, false)
    assert.match(stale.payload.message, /其他页面/)
    console.log('[workspace] stale concurrent rule save was rejected')
    await showPanel(easyPage)
    assert.equal(await easyPage.locator('patmail-root').count(), 1)
    await context.addCookies([{ name: 'pm_fixture_user', value: 'b', url: easyUrl, httpOnly: true, sameSite: 'Lax' }])
    await easyPage.reload()
    await tabFor(easyPage)
    await app.bringToFront()
    await app.reload()
    const switchDialog = app.getByRole('dialog').filter({ hasText: '登录人变了' })
    await switchDialog.waitFor()
    await switchDialog.getByText('用户乙').waitFor()
    await switchDialog.getByRole('button', { name: '切换账号', exact: true }).click()
    await switchDialog.waitFor({ state: 'detached' })
    await app.getByRole('button', { name: '用户乙 EASY 已连接' }).waitFor()
    await app.getByRole('button', { name: '客户管理' }).click()
    await app.getByText('还没有客户。在下面选好名称后保存。', { exact: true }).waitFor()
    assert.equal(await app.getByText('测试客户').count(), 0)
    const userCalls = apiCalls.filter(item => item.path === '/AjaxServers/Login.ashx').length
    const liveWorker = context.serviceWorkers().find(item => item.url().includes(extensionId))
    assert.ok(liveWorker)
    await liveWorker.evaluate(() => { globalThis.__patmailBoot = 1 })
    const browser = context.browser()
    assert.ok(browser)
    const cdp = await browser.newBrowserCDPSession()
    const { targetInfos } = await cdp.send('Target.getTargets')
    const target = targetInfos.find(item => item.type === 'service_worker' && item.url.includes(extensionId))
    assert.ok(target)
    await cdp.send('Target.closeTarget', { targetId: target.targetId })
    const again = await context.newPage()
    await again.goto(`chrome-extension://${extensionId}/app.html`)
    const nextWorker = context.serviceWorkers().find(item => item.url().includes(extensionId))
    assert.ok(nextWorker)
    assert.notEqual(await nextWorker.evaluate(() => globalThis.__patmailBoot ?? 0), 1)
    await again.getByRole('button', { name: '用户乙 EASY 已连接' }).waitFor()
    assert.equal(await again.getByText('测试客户').count(), 0)
    assert.ok(apiCalls.filter(item => item.path === '/AjaxServers/Login.ashx').length > userCalls)
    assert.equal(taskUrl.includes('#/tasks') || taskUrl.includes('app.html'), true)
    await easyPage.close()
    console.log('[workspace] account-switch isolation and service-worker recovery passed')
  })
}
