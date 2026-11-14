import { marked, Marked } from 'marked'
import DOMPurify from 'dompurify'

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const parser = new Marked({
  gfm: true,
  breaks: true,
  renderer: {
    html: ({ text }) => escape(text),
    image: ({ text }) => escape(text),
    link(token) {
      const label = this.parser.parseInline(token.tokens)
      if (!/^(?:[a-z]+:|\/|#)/i.test(token.href) && /\.md(?:#.*)?$/i.test(token.href)) {
        return `<a href="#" data-doc-file="${escape(token.href.replace(/^\.\//, ''))}">${label}</a>`
      }
      if (/^https?:|^mailto:/i.test(token.href)) {
        return `<a href="${escape(token.href)}" target="_blank" rel="noopener noreferrer">${label}</a>`
      }
      return label
    }
  }
})

function renderText(source: string): string {
  return DOMPurify.sanitize(parser.parse(source, { async: false }), {
    ALLOWED_TAGS: ['a', 'blockquote', 'br', 'code', 'del', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'input', 'li', 'ol', 'p', 'pre', 'strong', 'table', 'tbody', 'td', 'th', 'thead', 'tr', 'ul'],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'data-doc-file', 'colspan', 'rowspan', 'align', 'type', 'checked', 'disabled']
  })
}

export type DocBlock =
  | { kind: 'html'; html: string }
  | { kind: 'mermaid'; source: string; title: string }

/** Let the Markdown lexer identify real fences; examples inside other fences stay code. */
export function documentBlocks(source: string): DocBlock[] {
  const blocks: DocBlock[] = []
  let pending = ''
  let heading = '流程图'
  const flush = () => {
    if (pending.trim()) blocks.push({ kind: 'html', html: renderText(pending) })
    pending = ''
  }
  for (const token of marked.lexer(source)) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- 存量豁免：外部 XML/JSON any 数据流，类型收口待后续
    if (token.type === 'heading') heading = token.text
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- 存量豁免：多项历史存量，理由见 docs/ci/quality-gates.md
    if (token.type === 'code' && token.lang?.trim().toLowerCase() === 'mermaid') {
      flush()
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- 存量豁免：外部 XML/JSON any 数据流，类型收口待后续
      blocks.push({ kind: 'mermaid', source: token.text, title: heading })
    } else pending += token.raw
  }
  flush()
  return blocks
}
