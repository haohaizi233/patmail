import DOMPurify from 'dompurify'
import { MERMAID_THEME, themedDiagram } from './mermaid-theme'

let engine: Promise<typeof import('mermaid')['default']> | undefined
let sequence = 0

/** Locally bundled, loaded only when a document actually contains a diagram. */
export async function renderDiagram(source: string): Promise<string> {
  engine ??= import('mermaid').then(({ default: mermaid }) => {
    mermaid.initialize(MERMAID_THEME)
    return mermaid
  }).catch(error => {
    engine = undefined
    throw error
  })
  const mermaid = await engine
  const { svg } = await mermaid.render(`doc-diagram-${++sequence}`, themedDiagram(source))
  return DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ['foreignObject', 'a']
  })
}
