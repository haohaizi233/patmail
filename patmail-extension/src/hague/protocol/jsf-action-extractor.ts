import type { JsfAction } from '../http-context'
import {
  analyzeJavaScript,
  extractStaticActions,
  isStaticUiHandler,
  selectRemoteDefinition,
  type AstAnalysis,
} from './ast-action-parser.mjs'

const REMOTE_HANDLER_RE = /\b(selectOffice|processFile|refreshOptionsUI|refreshDesignUI|refreshDesignationUI)\s*\(/

export interface SafeJsfExtractionOptions {
  onAnalysis?: (report: AstAnalysis) => void
  createUnsupportedError: () => Error
}

/**
 * 生产 JSF 安全静态动作提取内核（只读、保守、fail-closed）：
 * - 动态未知表达式或不支持的控制流绝不降级为写请求
 * - 诊断回调（onAnalysis）异常完全隔离，不影响安全解析结果
 */
export function extractSafeJsfAction(
  script: string,
  element: HTMLElement,
  doc: Document,
  options: SafeJsfExtractionOptions,
): JsfAction | null {
  const parserOptions = { elementId: element.id, formId: element.closest('form')?.id }
  let actions = extractStaticActions(script, parserOptions)
  let report = analyzeJavaScript(script)
  const remote = REMOTE_HANDLER_RE.exec(script)?.[1]
  if (!actions.length && remote) {
    const definitions = selectRemoteDefinition([...doc.scripts].map(s => s.textContent ?? ''), remote)
    if (definitions !== undefined) {
      actions = extractStaticActions(script, { ...parserOptions, definitions })
      report = analyzeJavaScript(script, { definitions })
    }
  }
  try {
    options.onAnalysis?.(report)
  } catch {
    /* Diagnostic observers cannot affect protocol extraction. */
  }
  if (actions.length !== 1) {
    if (script.trim() && !isStaticUiHandler(script)) {
      throw options.createUnsupportedError()
    }
    return null
  }
  const { _kind, _line, _column, ...action } = actions[0]
  Object.defineProperty(action, 'analysis', {
    enumerable: false,
    value: {
      scriptHash: report.scriptHash,
      fingerprint: report.fingerprint,
      callType: _kind,
      line: _line,
      column: _column,
      confidence: 'static',
    },
  })
  return action
}
