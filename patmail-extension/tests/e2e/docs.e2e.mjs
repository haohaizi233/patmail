import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { distDir, docsWorkflowsDir } from './support/paths.mjs'
import { extensionWorker, launchExtensionContext } from './support/browser.mjs'
import { createReporter } from './support/report.mjs'

const dist = distDir
const sources = docsWorkflowsDir
const report = createReporter()
assert.deepEqual(
  (await readdir(sources)).sort(),
  [
    'PCT提醒.md',
    'PCT鹏城专案.md',
    'README.md',
    '文件管理.md',
    '递交管理-已完成导出.md',
    '季华实验室-文件导入.md',
    '海牙新申请.md',
    '请款.md',
  ].sort(),
)
const context = await launchExtensionContext(dist, { viewport: { width: 1440, height: 1000 } })
const errors = []
const runtimeLimitations = []
const requests = []
const blockAll = async route => {
  requests.push(route.request().url())
  await route.abort()
}
await context.route(/^https?:/, blockAll)
try {
  const worker = await extensionWorker(context)
  const id = new URL(worker.url()).host
  const app = await context.newPage()
  await report.ensureResultsDir()
  app.on('pageerror', error => {
    // App startup also initializes its existing SQLite recovery database. The
    // current manifest blocks wasm evaluation; that pre-existing limitation is
    // recorded separately, never hidden as a successful database check.
    if (
      error.message.startsWith('Aborted(CompileError: WebAssembly.instantiate():') &&
      error.message.includes('Content Security policy')
    ) {
      runtimeLimitations.push(error.message)
    } else errors.push(error.message)
  })
  await app.goto(`chrome-extension://${id}/app.html`)
  await app.getByRole('button', { name: '文档', exact: true }).click()
  const docs = app.getByRole('dialog', { name: 'PatMail 文档', exact: true })
  const knowledge = [
    ['海牙技术总览', '海牙技术总览'],
    ['技术架构总览', '技术架构总览'],
    ['JavaScript AST', 'JavaScript AST'],
    ['JSF / PrimeFaces', 'JSF / PrimeFaces'],
    ['ViewState 状态机', 'ViewState 状态机'],
    ['并发调度与容灾', '海牙草稿并发与恢复算法'],
  ]
  const search = docs.getByRole('searchbox', { name: '搜索文档标题' })
  for (const [title, heading] of knowledge) {
    await search.fill(title)
    const button = docs.getByRole('button', { name: title, exact: true })
    await button.click()
    await docs.getByRole('heading', { name: heading, exact: true }).waitFor()
    assert.ok((await button.getAttribute('class')).includes('on'))
    assert.ok((await docs.locator('.docs-provenance').innerText()).includes('code_verified'))
    if (title === '技术架构总览' || title === 'ViewState 状态机') {
      await docs.locator('.mermaid-content > svg').first().waitFor({ timeout: 60000 })
      assert.equal(await docs.locator('.mermaid-error').count(), 0)
    }
  }
  await search.fill('技术知识总览')
  await docs.getByRole('button', { name: '技术知识总览', exact: true }).click()
  await docs.getByRole('link', { name: '历史索引', exact: true }).click()
  await docs.getByRole('alert').waitFor()
  await search.fill('海牙技术总览')
  await docs.getByRole('button', { name: '海牙技术总览', exact: true }).click()
  await docs.getByRole('link', { name: '跳至生产调用核验', exact: true }).click()
  assert.equal(await docs.locator('#doc-生产调用核验').count(), 1)
  await docs.getByRole('link', { name: '知识总览', exact: true }).click()
  await docs.getByRole('heading', { name: '技术知识总览', exact: true }).waitFor()
  await report.screenshot(app, 'docs-knowledge-center.png')
  for (const [title, heading] of [
    ['海牙接口契约', 'WIPO eHague 接口与草稿调用契约'],
    ['提示词', '提示词'],
  ]) {
    await search.fill(title)
    await docs.getByRole('button', { name: title, exact: true }).click()
    await docs.getByRole('heading', { name: heading, exact: true }).waitFor()
  }
  await search.fill('海牙技术总览')
  await docs.getByRole('button', { name: '海牙技术总览', exact: true }).click()
  await app.setViewportSize({ width: 900, height: 800 })
  await report.screenshot(app, 'docs-knowledge-narrow.png')
  await app.setViewportSize({ width: 1440, height: 1000 })
  await search.fill('')
  await docs.getByRole('button', { name: '下载去重算法', exact: true }).click()
  await docs.getByRole('heading', { name: '下载去重算法', exact: true }).waitFor()
  await docs.getByRole('link', { name: '查询模板', exact: true }).click()
  await docs.getByRole('heading', { name: '查询模板', exact: true }).waitFor()
  await docs.getByRole('button', { name: '工作流总览', exact: true }).click()
  await docs.getByRole('heading', { name: '工作流索引', exact: true }).waitFor()
  const indexSource = await readFile(path.join(sources, 'README.md'), 'utf8')
  const indexDiagrams = (indexSource.match(/^```mermaid$/gm) ?? []).length
  await app.waitForFunction(
    n => document.querySelectorAll('.docs-md .mermaid-content > svg').length === n,
    indexDiagrams,
    { timeout: 60000 },
  )
  assert.equal(
    await docs
      .locator('.mermaid-content svg g.node')
      .evaluateAll(nodes => nodes.filter(node => !node.textContent.trim()).length),
    0,
  )
  const indexCaption = (await docs.locator('.mermaid-figure figcaption').first().innerText()).trim()
  const counts = [{ file: 'README.md', diagrams: indexDiagrams }]
  for (const [file, heading] of [
    ['PCT提醒.md', 'PCT提醒工作流'],
    ['PCT鹏城专案.md', 'PCT鹏城专案工作流'],
    ['文件管理.md', '文件管理工作流'],
    ['季华实验室-文件导入.md', '季华实验室-文件导入'],
    ['海牙新申请.md', '海牙新申请工作流'],
  ]) {
    await docs.getByRole('link', { name: file, exact: true }).click()
    await docs.getByRole('heading', { name: heading, exact: true }).waitFor()
    const source = await readFile(path.join(sources, file), 'utf8')
    const expected = (source.match(/^```mermaid$/gm) ?? []).length
    await app.waitForFunction(
      n => document.querySelectorAll('.docs-md .mermaid-content > svg').length === n,
      expected,
      { timeout: 60000 },
    )
    await app.waitForFunction(() =>
      [...document.querySelectorAll('.docs-md .mermaid-viewport')].every(
        host => Math.abs(host.querySelector('svg').getBoundingClientRect().width - (host.clientWidth - 32)) < 2,
      ),
    )
    assert.equal(await docs.locator('.mermaid-error').count(), 0)
    assert.equal(await docs.locator('.mermaid-figure').count(), expected)
    const dimensions = await docs.locator('.mermaid-content > svg').evaluateAll(nodes =>
      nodes.map(svg => ({
        w: svg.viewBox.baseVal.width,
        h: svg.viewBox.baseVal.height,
        text: svg.textContent.length,
      })),
    )
    assert.ok(dimensions.every(item => item.w > 0 && item.h > 0 && item.text > 0))
    const layouts = await docs.locator('.mermaid-viewport:not(.interactive)').evaluateAll(nodes =>
      nodes.map(host => {
        const svg = host.querySelector('svg')
        return {
          width: host.clientWidth,
          height: host.clientHeight,
          drawing: svg.getBoundingClientRect().width,
          ratio: svg.viewBox.baseVal.height / svg.viewBox.baseVal.width,
        }
      }),
    )
    assert.ok(
      layouts.every(item => Math.abs(item.drawing - (item.width - 32)) < 2),
      `${file}: inline diagrams must fill the available width`,
    )
    assert.ok(
      layouts.every(item => Math.abs(item.height - ((item.width - 32) * item.ratio + 32)) < 2),
      `${file}: inline height must follow the diagram aspect ratio`,
    )
    const blankNodes = await docs.locator('.mermaid-content svg g.node').evaluateAll(nodes =>
      nodes
        // State diagrams intentionally use unlabelled start/end circles.
        .filter(node => !/-state-root_(?:start|end)-/.test(node.id) && !node.textContent.trim())
        .map(node => node.id),
    )
    assert.deepEqual(blankNodes, [], `${file}: diagram node labels must survive SVG sanitization`)
    for (const [role, color] of [
      ['pmDecision', 'rgb(241, 237, 255)'],
      ['pmSuccess', 'rgb(232, 248, 240)'],
      ['pmWarning', 'rgb(255, 243, 223)'],
      ['pmStop', 'rgb(255, 237, 240)'],
    ]) {
      const node = docs.locator(`.mermaid-content svg g.node.${role}`).first()
      assert.equal(
        await node.evaluate(
          el => getComputedStyle(el.querySelector('.label-container') ?? el.querySelector('rect,polygon,path')).fill,
        ),
        color,
        `${file}: ${role} must use the shared candy palette`,
      )
    }
    if (file === 'PCT提醒.md') {
      await app.setViewportSize({ width: 1100, height: 1000 })
      await app.waitForFunction(() =>
        [...document.querySelectorAll('.docs-md .mermaid-viewport')].every(host => {
          const svg = host.querySelector('svg')
          const viewWidth = svg?.viewBox.baseVal.width || 800
          const viewHeight = svg?.viewBox.baseVal.height || 600
          const scale = Math.min(1, (host.clientWidth - 32) / viewWidth)
          const expectedWidth = viewWidth * scale
          const expectedHeight = viewHeight * scale + 32
          return (
            Math.abs(svg.getBoundingClientRect().width - expectedWidth) < 2 &&
            Math.abs(host.clientHeight - expectedHeight) < 2
          )
        }),
      )
      await app.setViewportSize({ width: 1440, height: 1000 })
    }
    if (file === '文件管理.md') {
      await docs.getByRole('heading', { name: '9. 创建、保存和提交流程时序', exact: true }).scrollIntoViewIfNeeded()
      await report.screenshot(app, 'docs-mermaid-sequence.png')
      const actor = docs.locator('.mermaid-content svg rect.actor').first()
      assert.equal(await actor.evaluate(el => getComputedStyle(el).fill), 'rgb(255, 240, 246)')
      assert.equal(await actor.evaluate(el => getComputedStyle(el).rx), '12px')
    }
    counts.push({ file, diagrams: expected })
    if (file === '季华实验室-文件导入.md') {
      // This guide is also embedded in its workflow, where the view tabs own navigation.
      await docs.getByRole('button', { name: '工作流总览', exact: true }).click()
    } else await docs.getByRole('link', { name: '工作流索引', exact: true }).click()
    await docs.getByRole('heading', { name: '工作流索引', exact: true }).waitFor()
  }
  await docs.getByRole('link', { name: 'PCT提醒.md', exact: true }).click()
  const first = docs.locator('.mermaid-figure').first()
  await first.getByRole('button', { name: '放大查看', exact: true }).click()
  const modal = app.getByRole('dialog', { name: /全链路总览 · 放大查看/ })
  await modal.waitFor()
  const preset = name => modal.getByRole('button', { name, exact: true })
  await modal.locator('button[aria-pressed="true"]').waitFor()
  assert.equal(await preset('适应窗口').getAttribute('aria-pressed'), 'true')
  assert.equal(indexCaption, '放大查看', 'the card must not repeat the Markdown section title')
  assert.equal(
    await app.evaluate(() => {
      const ids = [...document.querySelectorAll('.mermaid-content [id]')].map(el => el.id)
      return ids.length - new Set(ids).size
    }),
    0,
    'SVG IDs must remain unique between inline and expanded diagrams',
  )
  const zoom = modal.getByRole('spinbutton', { name: '图表缩放百分比' })
  await zoom.fill('100')
  await zoom.press('Tab')
  assert.equal(Number(await zoom.inputValue()), 100)
  assert.equal(
    await modal.locator('button[aria-pressed="true"]').count(),
    0,
    'manual zoom must clear preset highlighting',
  )
  const canvas = modal.locator('.mermaid-viewport')
  const box = await canvas.boundingBox()
  assert.ok(box && box.width > 1000 && box.height > 500)
  const px = box.x + box.width / 2
  const py = box.y + box.height / 2
  await app.mouse.move(px, py)
  await app.mouse.wheel(0, -150)
  await app.waitForFunction(() => Number(document.querySelector('dialog.mermaid-dialog input').value) > 100)
  const transform = () => modal.locator('.mermaid-content').evaluate(el => el.style.transform)
  const before = await transform()
  await app.mouse.down()
  await app.mouse.move(px + 140, py + 90, { steps: 8 })
  await app.mouse.up()
  assert.notEqual(await transform(), before)
  await modal.getByRole('button', { name: '适应窗口', exact: true }).click()
  assert.ok(Number(await zoom.inputValue()) < 100)
  await modal.getByRole('button', { name: '适应宽度', exact: true }).click()
  assert.equal(await preset('适应宽度').getAttribute('aria-pressed'), 'true')
  assert.equal(await modal.locator('button[aria-pressed="true"]').count(), 1)
  assert.ok(
    await modal.locator('.mermaid-content').evaluate((el, hostWidth) => {
      const svg = el.querySelector('svg')
      const viewWidth = svg?.viewBox.baseVal.width || 800
      const expectedWidth = Math.min(hostWidth - 32, viewWidth * 1.25)
      return Math.abs(el.getBoundingClientRect().width - expectedWidth) < 2
    }, box.width),
  )
  await modal.getByRole('button', { name: '原始大小', exact: true }).click()
  assert.equal(Number(await zoom.inputValue()), 100)
  assert.equal(await preset('原始大小').getAttribute('aria-pressed'), 'true')
  await report.screenshot(app, 'docs-mermaid-presets.png')
  await canvas.focus()
  await app.keyboard.press('-')
  assert.equal(Number(await zoom.inputValue()), 80)
  await report.ensureResultsDir()
  await report.screenshot(app, 'docs-mermaid-detail.png')
  await app.keyboard.press('0')
  await report.screenshot(app, 'docs-mermaid-expanded.png')
  await app.keyboard.press('Escape')
  await modal.waitFor({ state: 'detached' })
  assert.equal(await docs.isVisible(), true)
  await first.getByRole('button', { name: '放大查看', exact: true }).click()
  await preset('适应宽度').click()
  await app.mouse.move(px, py)
  await app.mouse.down()
  await app.mouse.move(px + 50, py + 30, { steps: 3 })
  await app.mouse.up()
  assert.equal(
    await preset('适应宽度').getAttribute('aria-pressed'),
    'true',
    'panning must preserve the selected scale mode',
  )
  const selectedColor = await preset('适应宽度').evaluate(el => getComputedStyle(el).backgroundImage)
  assert.ok(selectedColor.includes('gradient'), 'selected preset must have a distinct kawaii gradient')
  await app.waitForFunction(
    async () =>
      (await chrome.storage.local.get('patmail.mermaidViewMode.v1'))['patmail.mermaidViewMode.v1'] === 'width',
  )
  await app.getByRole('button', { name: '关闭放大图' }).click()
  await first.getByRole('button', { name: '放大查看', exact: true }).click()
  await modal.locator('button[aria-pressed="true"]').waitFor()
  assert.equal(
    await preset('适应宽度').getAttribute('aria-pressed'),
    'true',
    'reopening a diagram must restore the preference',
  )
  await app.getByRole('button', { name: '关闭放大图' }).click()
  await app.reload()
  await app.getByRole('button', { name: '文档', exact: true }).click()
  await docs.getByRole('button', { name: '海牙技术总览', exact: true }).click()
  await docs.getByRole('heading', { name: '海牙技术总览', exact: true }).waitFor()
  await docs.getByRole('button', { name: 'PCT提醒', exact: true }).click()
  await docs.locator('.mermaid-figure').first().getByRole('button', { name: '放大查看', exact: true }).click()
  await modal.locator('button[aria-pressed="true"]').waitFor()
  assert.equal(
    await preset('适应宽度').getAttribute('aria-pressed'),
    'true',
    'a new page must restore the persisted user preference',
  )
  await app.getByRole('button', { name: '关闭放大图' }).click()
  assert.equal(await docs.isVisible(), true)
  await report.screenshot(app, 'docs-mermaid-inline.png')
  assert.deepEqual(errors, [])
  assert.deepEqual(requests, [], 'Documents must render without network access')
  const result = {
    knowledgePages: knowledge.map(([title]) => title),
    counts,
    inlineLayout: 'full width, natural height, responsive resize, five semantic pastel classes, no repeated card title',
    interactions:
      'exclusive selected presets, persistent mode after reopen/reload, manual zoom clears highlight, drag preserves selection, wheel, numeric zoom, fit width/window, original size, keyboard, Escape',
    documentPageErrors: errors.length,
    networkRequests: requests.length,
    existingRuntimeLimitations: runtimeLimitations,
  }
  await report.writeJson('docs-mermaid.json', result)
  console.log(JSON.stringify(result))
} finally {
  await context.unroute(/^https?:/, blockAll)
  await context.close()
}
