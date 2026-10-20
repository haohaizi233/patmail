import type { MermaidConfig } from 'mermaid'

/** PatMail's offline, shared candy palette; no dependency on mermaid.ai. */
export const MERMAID_THEME: MermaidConfig = {
  startOnLoad: false,
  securityLevel: 'strict',
  suppressErrorRendering: true,
  theme: 'base',
  fontFamily: 'Microsoft YaHei, Arial, sans-serif',
  themeVariables: {
    fontSize: '15px',
    background: '#fffafd',
    primaryColor: '#fff0f6', primaryTextColor: '#604264', primaryBorderColor: '#e8a1c2',
    secondaryColor: '#f1edff', secondaryTextColor: '#604264', secondaryBorderColor: '#bcade5',
    tertiaryColor: '#effaf5', tertiaryTextColor: '#49685e', tertiaryBorderColor: '#a8d5c2',
    lineColor: '#b687ba', textColor: '#604264',
    mainBkg: '#fff0f6', nodeBorder: '#e8a1c2', clusterBkg: '#fff6fa', clusterBorder: '#e9c6dd',
    edgeLabelBackground: '#fff6fb',
    actorBkg: '#fff0f6', actorBorder: '#e8a1c2', actorTextColor: '#604264', actorLineColor: '#d7bedb',
    signalColor: '#9570a4', signalTextColor: '#604264',
    labelBoxBkgColor: '#f1edff', labelBoxBorderColor: '#bcade5', labelTextColor: '#604264',
    loopTextColor: '#604264', noteBkgColor: '#fff6df', noteBorderColor: '#ebcea0', noteTextColor: '#795c70',
    activationBkgColor: '#f1edff', activationBorderColor: '#bcade5', sequenceNumberColor: '#fffafd'
  },
  themeCSS: '.node rect, .actor, .labelBox { rx: 12px; ry: 12px; } .cluster rect { rx: 16px; ry: 16px; } .edgeLabel { color: #604264; }',
  htmlLabels: false,
  flowchart: { useMaxWidth: false, curve: 'basis' },
  maxTextSize: 100000,
  maxEdges: 2000
}

/** Explicit semantic classes, assigned by document authors, never guessed at runtime. */
const NODE_STYLES = {
  pmStep: 'fill:#fff0f6,stroke:#e8a1c2,color:#604264,stroke-width:1.4px',
  pmDecision: 'fill:#f1edff,stroke:#bcade5,color:#604264,stroke-width:1.6px',
  pmSuccess: 'fill:#e8f8f0,stroke:#96cdb3,color:#436d5a,stroke-width:1.6px',
  pmWarning: 'fill:#fff3df,stroke:#e7c28f,color:#7a6047,stroke-width:1.6px',
  pmStop: 'fill:#ffedf0,stroke:#e9a0b2,color:#96546b,stroke-width:1.8px'
}

export function themedDiagram(source: string): string {
  // Sequence syntax has actors/notes instead of flowchart classDef statements.
  if (!/^\s*(?:flowchart|graph|stateDiagram(?:-v2)?)\b/m.test(source)) return source
  const defaults = Object.entries(NODE_STYLES)
    .filter(([name]) => !new RegExp('^\\s*classDef\\s+[^\\n;]*\\b' + name + '\\b', 'm').test(source))
    .map(([name, style]) => 'classDef ' + name + ' ' + style)
  return source + '\n' + defaults.join('\n')
}
