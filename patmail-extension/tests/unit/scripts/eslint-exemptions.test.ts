import { describe, expect, it } from 'vitest'
import { collectExemptions, compareExemptions } from '../../../scripts/eslint-exemptions.mjs'

describe('lint exemption ratchet', () => {
  it('reads Vue template comments and ignores directive-shaped script strings', () => {
    const source =
      '<script setup lang="ts">\nconst text = "// eslint-disable-line no-undef"\n</script>\n<template><div><!-- eslint-disable-next-line vue/no-dupe-v-else-if -->\n<span /></div></template>'
    expect(
      collectExemptions([{ filePath: '/repo/Example.vue', suppressedMessages: [] }], '/repo', () => source),
    ).toHaveLength(1)
  })
  it('registers trailing directives while ignoring directive-shaped string literals', () => {
    const collect = (source: string) =>
      collectExemptions([{ filePath: '/repo/scripts/example.mjs', suppressedMessages: [] }], '/repo', () => source)
    expect(collect('const used = 1; // eslint-disable-line no-undef\nconsole.log(used)\n')).toHaveLength(1)
    expect(collect('const text = "// eslint-disable-line no-undef"\nconsole.log(text)\n')).toEqual([])
  })
  const fixture = (source: string, messages = ["'old' is assigned a value but never used."]) =>
    collectExemptions(
      [
        {
          filePath: '/repo/scripts/example.mjs',
          suppressedMessages: messages.map(message => ({
            ruleId: 'no-unused-vars',
            message,
            severity: 2,
            line: source.split('\n').findIndex(line => line.includes('const old')) + 1,
          })),
        },
      ],
      '/repo',
      () => source,
    )
  const original = '// eslint-disable-next-line no-unused-vars -- legacy\nconst old = 1\n'
  it('allows moving unchanged exemptions without freezing line numbers', () => {
    expect(compareExemptions(fixture('\n\n' + original), fixture(original))).toEqual([])
  })
  it('rejects new diagnostics appended to an exempted line', () => {
    expect(
      compareExemptions(
        fixture(original.replace('old = 1', 'old = 1, added = 2'), [
          "'old' is assigned a value but never used.",
          "'added' is assigned a value but never used.",
        ]),
        fixture(original),
      ),
    ).not.toEqual([])
  })
  it('rejects widened directives even before they hide a new diagnostic', () => {
    expect(
      compareExemptions(
        fixture(original.replace('no-unused-vars --', 'no-unused-vars, no-undef --')),
        fixture(original),
      ),
    ).not.toEqual([])
  })
  it('rejects additional duplicate occurrences and permits removing exemptions', () => {
    const before = fixture(original)
    expect(compareExemptions([...before, ...before], before)).not.toEqual([])
    expect(compareExemptions([], before)).toEqual([])
  })
  it('requires an explicit exemption baseline, including for an empty result', () => {
    expect(compareExemptions([], undefined)).not.toEqual([])
  })
})
