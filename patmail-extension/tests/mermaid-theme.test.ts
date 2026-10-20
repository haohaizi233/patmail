import { describe, expect, it } from 'vitest'
import { themedDiagram } from '../src/app/docs/mermaid-theme'

describe('Mermaid semantic theme preparation', () => {
  it('makes the shared semantic palette available without rewriting graph edges', () => {
    const source = 'flowchart TD\n A[读取] --> B{检查}\n B --> C[提交]\n class B pmDecision\n class C pmSuccess'
    const themed = themedDiagram(source)
    expect(themed.startsWith(source)).toBe(true)
    expect(themed).toMatch(/classDef pmDecision fill:#f1edff/)
    expect(themed).toMatch(/classDef pmSuccess fill:#e8f8f0/)
  })

  it('does not replace an explicitly customized semantic class', () => {
    const source = 'flowchart LR\n A:::pmSuccess\n classDef pmSuccess fill:#aabbcc,stroke:#112233'
    const themed = themedDiagram(source)
    expect(themed.match(/classDef pmSuccess /g)).toHaveLength(1)
    expect(themed).toContain('fill:#aabbcc')
  })

  it('leaves sequence diagrams untouched because their style syntax differs', () => {
    const source = 'sequenceDiagram\n A->>B: 读取\n Note over B: 确认'
    expect(themedDiagram(source)).toBe(source)
  })
})
