import assert from 'node:assert/strict'

export async function runLargeFormScan(ctx) {
  const { report, context, worker, extensionId, page, panel, host, url, easyUrl, apiCalls, visible, tabFor, showPanel } = ctx
  const check = (name, action) => report.check(name, action)
  const note = (line) => report.note(line)
  await check('large form scan reports profiling without observing the page', async () => {
    await page.reload()
    await tabFor(page)
    await showPanel(page)
    await panel.waitFor()
    await page.evaluate(() => {
      const batch = document.createDocumentFragment()
      for (let index = 0; index < 1000; index++) {
        const input = document.createElement('input')
        input.name = `field_${index}`
        batch.append(input)
      }
      document.body.append(batch)
    })
    await panel.getByRole('button', { name: '扫描页面' }).click()
    await panel.getByRole('button', { name: '查看 DOM' }).click()
    const snapshot = JSON.parse(await panel.locator('.dom pre').textContent())
    assert.equal(snapshot.stats.totalControls, 1009)
    assert(Number.isFinite(snapshot.stats.durationMs))
    note(`large ${snapshot.stats.totalControls} controls: ${snapshot.stats.durationMs} ms`)
  })
}
