import { describe, expect, it } from 'vitest'
import { ESLint } from 'eslint'
import { collectExemptions, compareExemptions } from '../../../scripts/eslint-exemptions.mjs'
import { resolve } from 'node:path'

describe('Node research script lint scope', () => {
  it('rejects removing the enable boundary of an existing block exemption', async () => {
    const eslint = new ESLint()
    const filePath = resolve('scripts/block-exemption-fixture.mjs')
    const before =
      '/* eslint-disable no-unused-vars -- legacy */\nconst old = 1\n/* eslint-enable no-unused-vars */\nconsole.log("ok")\n'
    const after = before.replace('/* eslint-enable no-unused-vars */\n', '')
    const original = await eslint.lintText(before, { filePath })
    const changed = await eslint.lintText(after, { filePath })
    expect(changed[0].errorCount).toBe(0)
    expect(
      compareExemptions(
        collectExemptions(changed, process.cwd(), () => after),
        collectExemptions(original, process.cwd(), () => before),
      ),
    ).not.toEqual([])
  })
  it.each(['scripts/research-scope-fixture.mjs', 'scripts/live-scope-fixture.mjs'])(
    'rejects browser globals at Node top level in %s',
    async filePath => {
      const [result] = await new ESLint().lintText('window.alert(document.title)\n', { filePath })
      expect(result.messages.filter(message => message.ruleId === 'no-undef')).toHaveLength(2)
    },
  )
  it('rejects an actual ESLint suppression that conceals a new issue on an exempted line', async () => {
    const eslint = new ESLint()
    const filePath = resolve('scripts/exemption-scope-fixture.mjs')
    const before = '// eslint-disable-next-line no-unused-vars -- legacy\nconst old = 1\n'
    const after = before.replace('old = 1', 'old = 1, added = 2')
    const original = await eslint.lintText(before, { filePath })
    const changed = await eslint.lintText(after, { filePath })
    expect(changed[0].errorCount).toBe(0)
    expect(changed[0].suppressedMessages).toHaveLength(2)
    expect(
      compareExemptions(
        collectExemptions(changed, process.cwd(), () => after),
        collectExemptions(original, process.cwd(), () => before),
      ),
    ).not.toEqual([])
  })
})
