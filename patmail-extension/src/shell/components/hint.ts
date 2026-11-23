/** 悬停提示。气泡用工作台的粉色卡片，不走浏览器原生 title。 */

const STYLE = `
.patmail-hint {
  position: fixed;
  z-index: 2147483646;
  max-width: 300px;
  padding: 8px 13px;
  border: 1px solid #f5bcd4;
  border-radius: 12px;
  background: linear-gradient(180deg, #fffafd 0%, #fff2f8 100%);
  color: #3a2540;
  font: 12px/1.6 "Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif;
  box-shadow: 0 10px 26px rgba(235, 75, 142, 0.18), 0 2px 6px rgba(235, 75, 142, 0.08);
  pointer-events: none;
  white-space: pre-wrap;
  word-break: break-word;
}
.patmail-hint::before,
.patmail-hint::after {
  content: "";
  position: absolute;
  left: var(--patmail-hint-arrow, 50%);
  transform: translateX(-50%);
  border: 6px solid transparent;
}
.patmail-hint[data-place="below"]::before { top: -12px; border-bottom-color: #f5bcd4; }
.patmail-hint[data-place="below"]::after { top: -11px; border-bottom-color: #fffafd; }
.patmail-hint[data-place="above"]::before { bottom: -12px; border-top-color: #f5bcd4; }
.patmail-hint[data-place="above"]::after { bottom: -11px; border-top-color: #fff2f8; }
`

type HintHost = Document | ShadowRoot
type HintEl = HTMLElement & { __hintCleanup?: () => void; __hintText?: string }

const CLIP_SELECTOR = '.clip, .col-name-clip, .picked-name, .theme-select-value, .theme-select-label, [class*="clip"]'
const installedHosts = new WeakSet<HintHost>()
const activeDelegated = new WeakMap<HintHost, HTMLElement>()

function isIgnoredTitleElement(el: Element): boolean {
  return (
    el instanceof SVGElement ||
    el instanceof HTMLStyleElement ||
    el instanceof HTMLScriptElement ||
    el instanceof HTMLIFrameElement
  )
}

/**
 * 封装层兜底：剥离任何误写或动态写入的原生 `title` 属性，转为内部 `data-patmail-hint`，
 * 从根源阻止浏览器弹出黑灰原生提示框，并自动转由卡哇伊悬浮气泡接管显示。
 */
export function absorbNativeTitle(node: Element): void {
  if (!(node instanceof HTMLElement) || isIgnoredTitleElement(node)) return
  if (!node.hasAttribute('title')) return
  const el = node as HintEl
  const raw = (el.getAttribute('title') ?? '').trim()
  el.removeAttribute('title')
  if (!raw) return
  el.dataset.patmailHint = raw
  if (!el.__hintText) el.__hintText = raw
  const visibleText = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
  if (!el.getAttribute('aria-label') && !visibleText) {
    el.setAttribute('aria-label', raw)
  }
}

function scanTitles(node: Node): void {
  if (!(node instanceof Element)) return
  absorbNativeTitle(node)
  node.querySelectorAll('[title]').forEach(child => { absorbNativeTitle(child) })
}

function absorbAncestors(target: Element, stopAt: ParentNode): void {
  let cur: Element | null = target
  while (cur) {
    absorbNativeTitle(cur)
    if (cur === stopAt) break
    cur = cur.parentElement
  }
}

function hasMountedDirective(el: Element | null): boolean {
  let cur: Element | null = el
  while (cur) {
    if ((cur as HintEl).__hintCleanup) return true
    cur = cur.parentElement
  }
  return false
}

/** 有写明的句子就用它；截断模式没写时用元素自己的文字。没被截断就不弹。 */
export function visibleHint(explicit: string, content: string, clipOnly: boolean, clipped: boolean): string {
  const tip = (explicit || (clipOnly ? content : '')).trim()
  if (!tip || (clipOnly && !clipped)) return ''
  return tip
}

export function isTextClipped(el: HTMLElement): boolean {
  if (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) return true
  const clipChild = el.querySelector<HTMLElement>(CLIP_SELECTOR)
  if (clipChild && (clipChild.scrollWidth > clipChild.clientWidth + 1 || clipChild.scrollHeight > clipChild.clientHeight + 1)) {
    return true
  }
  return false
}

function anchorRectOf(el: HTMLElement): DOMRect {
  const clipChild = el.querySelector<HTMLElement>(CLIP_SELECTOR)
  if (clipChild && (clipChild.scrollWidth > clipChild.clientWidth + 1 || clipChild.scrollHeight > clipChild.clientHeight + 1)) {
    return clipChild.getBoundingClientRect()
  }
  return el.getBoundingClientRect()
}

function remember(el: HintEl, value: unknown): void {
  el.__hintText = typeof value === 'string' ? value.trim() : ''
}

function hostOf(el: Element): HintHost {
  const root = el.getRootNode()
  return root instanceof ShadowRoot ? root : document
}

function parentOf(root: HintHost): ParentNode | null {
  return root instanceof ShadowRoot ? root : document.body
}

function ensureStyle(root: HintHost): void {
  const parent = root instanceof ShadowRoot ? root : document.head
  if (!parent || parent.querySelector('style[data-patmail-hint]')) return
  const style = document.createElement('style')
  style.dataset.patmailHint = ''
  style.textContent = STYLE
  parent.appendChild(style)
}

function bubbleOf(root: HintHost): HTMLElement | null {
  ensureStyle(root)
  const parent = parentOf(root)
  if (!parent) return null
  const found = parent.querySelector(':scope > .patmail-hint')
  if (found instanceof HTMLElement) return found
  const bubble = document.createElement('div')
  bubble.className = 'patmail-hint'
  bubble.setAttribute('role', 'tooltip')
  bubble.hidden = true
  parent.appendChild(bubble)
  return bubble
}

function hideBubble(root: HintHost): void {
  const parent = parentOf(root)
  if (!parent) return
  const found = parent.querySelector(':scope > .patmail-hint')
  if (found instanceof HTMLElement) found.hidden = true
}

function showBubble(el: HTMLElement, text: string): void {
  const root = hostOf(el)
  const bubble = bubbleOf(root)
  if (!bubble) return
  bubble.textContent = text
  bubble.hidden = false
  const rect = anchorRectOf(el)
  const box = bubble.getBoundingClientRect()
  const gap = 10
  const center = rect.left + rect.width / 2
  const left = Math.max(8, Math.min(center - box.width / 2, window.innerWidth - box.width - 8))
  const spaceBelow = window.innerHeight - rect.bottom - gap
  const fitsBelow = spaceBelow + 16 >= box.height
  bubble.dataset.place = fitsBelow ? 'below' : 'above'
  const arrowOffset = box.width > 24 ? Math.max(12, Math.min(center - left, box.width - 12)) : center - left
  bubble.style.setProperty('--patmail-hint-arrow', `${Math.round(arrowOffset)}px`)
  bubble.style.left = `${Math.round(left)}px`
  bubble.style.top = `${Math.round(fitsBelow ? rect.bottom + gap : Math.max(8, rect.top - box.height - gap))}px`
  window.addEventListener('scroll', () => hideBubble(root), { capture: true, once: true })
}

/**
 * 在 Document 或 ShadowRoot 宿主页签上安装一次全局提示委托与 MutationObserver：
 * 1) 全量扫描并持续拦截任何误写/动态设置的原生 `title` 属性；
 * 2) 委托展示被接管的 `[data-patmail-hint]` 及未手动加 `v-hint` 的 `.clip` 溢出元素。
 */
export function installHintHost(target: HintHost | Element = document): void {
  const root: HintHost = target instanceof Element ? hostOf(target) : target
  const parent = parentOf(root)
  if (!parent || installedHosts.has(root)) return
  installedHosts.add(root)
  ensureStyle(root)

  parent.querySelectorAll('[title]').forEach(node => { absorbNativeTitle(node) })

  if (typeof MutationObserver !== 'undefined') {
    const observer = new MutationObserver(records => {
      for (const record of records) {
        if (record.type === 'attributes' && record.target instanceof Element) {
          absorbNativeTitle(record.target)
          continue
        }
        if (record.type === 'childList') {
          record.addedNodes.forEach(scanTitles)
        }
      }
    })
    observer.observe(parent, { childList: true, subtree: true, attributes: true, attributeFilter: ['title'] })
  }

  const onEnter = (event: Event): void => {
    const targetNode = event.target
    if (!(targetNode instanceof Element)) return
    absorbAncestors(targetNode, parent)

    const hintAnchor = targetNode.closest('[data-patmail-hint]')
    if (hintAnchor instanceof HTMLElement && !(hintAnchor as HintEl).__hintCleanup) {
      const tip = (hintAnchor.dataset.patmailHint ?? '').trim()
      if (tip) {
        activeDelegated.set(root, hintAnchor)
        showBubble(hintAnchor, tip)
        return
      }
    }

    const clipEl = targetNode.closest(CLIP_SELECTOR)
    if (clipEl instanceof HTMLElement && !hasMountedDirective(clipEl)) {
      const content = (clipEl.textContent ?? '').replace(/\s+/g, ' ').trim()
      if (content && isTextClipped(clipEl)) {
        activeDelegated.set(root, clipEl)
        showBubble(clipEl, content)
      }
    }
  }

  const onLeave = (event: Event): void => {
    const active = activeDelegated.get(root)
    if (!active) return
    const related = (event as MouseEvent | FocusEvent).relatedTarget
    if (related instanceof Node && active.contains(related)) return
    activeDelegated.delete(root)
    hideBubble(root)
  }

  root.addEventListener('mouseover', onEnter, true)
  root.addEventListener('mouseout', onLeave, true)
  root.addEventListener('focusin', onEnter, true)
  root.addEventListener('focusout', onLeave, true)
}

export const hintDirective = {
  mounted(el: HintEl, binding: { value: unknown; modifiers: { clip?: boolean } }) {
    installHintHost(el)
    absorbNativeTitle(el)
    remember(el, binding.value)
    const show = (): void => {
      const content = (el.textContent ?? '').replace(/\s+/g, ' ')
      const tip = visibleHint(el.__hintText ?? '', content, Boolean(binding.modifiers.clip), isTextClipped(el))
      if (tip) showBubble(el, tip)
    }
    const hide = (): void => hideBubble(hostOf(el))
    el.addEventListener('mouseenter', show)
    el.addEventListener('mouseleave', hide)
    el.addEventListener('focusin', show)
    el.addEventListener('focusout', hide)
    el.__hintCleanup = () => {
      el.removeEventListener('mouseenter', show)
      el.removeEventListener('mouseleave', hide)
      el.removeEventListener('focusin', show)
      el.removeEventListener('focusout', hide)
      hide()
    }
  },
  updated(el: HintEl, binding: { value: unknown }) {
    absorbNativeTitle(el)
    remember(el, binding.value)
  },
  unmounted(el: HintEl) {
    el.__hintCleanup?.()
  }
}
