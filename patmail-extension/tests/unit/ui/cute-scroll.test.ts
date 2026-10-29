import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { projectPath } from '../../helpers/project'

/** 滚动条是浏览器画的，改不了 DOM，只能整套替换伪元素，这里锁住套件样式与两处挂载。 */
it('卡哇伊滚动条套件统一换掉浏览器默认滚动条', () => {
  const css = readFileSync(projectPath('src/shared/cute-scroll.css'), 'utf8')
  expect(css).toContain('::-webkit-scrollbar-thumb')
  expect(css).toContain('::-webkit-scrollbar-track')
  expect(css).toContain('::-webkit-scrollbar-corner')
  // 上下箭头按钮收起来，只留糖果滑块。
  expect(css).toMatch(/::-webkit-scrollbar-button[^{]*\{[^}]*display:\s*none/)
  // 轨道爱心与滑块白心都走内联 SVG，避免额外图片资源。
  expect(css).toContain('data:image/svg+xml')
  expect(css).toContain('--cute-scroll-heart')
  expect(css).toContain('--cute-scroll-candy')
  // 只换皮不动布局。
  expect(css).not.toMatch(/overflow\s*:/)
})

it('应用页与浮窗影子树挂上同一份套件', () => {
  expect(readFileSync(projectPath('src/shell/style.css'), 'utf8')).toContain('cute-scroll.css')
  const injector = readFileSync(projectPath('src/content/injector.ts'), 'utf8')
  expect(injector).toContain('cute-scroll.css?inline')
  expect(injector).toContain('cuteScrollCss')
})
