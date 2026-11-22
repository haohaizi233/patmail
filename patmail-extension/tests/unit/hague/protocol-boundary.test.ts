import { describe, expect, it } from 'vitest'
import * as astParser from '../../../src/hague/protocol/ast-action-parser.mjs'
import * as diagAnalyzer from '../../../src/hague/diagnostics/ast/analyzer.mjs'
import { extractSafeJsfAction } from '../../../src/hague/protocol/jsf-action-extractor'
import { HagueHttpDriver, jsfAction } from '../../../src/hague/http-driver'

describe('Hague safe AST protocol parser & diagnostics boundary', () => {
  it('shares one canonical safe AST parser kernel without duplicate implementations', () => {
    expect(diagAnalyzer.analyzeJavaScript).toBe(astParser.analyzeJavaScript)
    expect(diagAnalyzer.extractStaticActions).toBe(astParser.extractStaticActions)
    expect(diagAnalyzer.extractJsfCallIR).toBe(astParser.extractJsfCallIR)
    expect(diagAnalyzer.isStaticUiHandler).toBe(astParser.isStaticUiHandler)
    expect(diagAnalyzer.selectRemoteDefinition).toBe(astParser.selectRemoteDefinition)
    expect(diagAnalyzer.clearAstCache).toBe(astParser.clearAstCache)
  })

  it('extracts supported static JSF actions consistently and isolates diagnostic callback errors', () => {
    const doc = document.implementation.createHTMLDocument('jsf')
    const form = doc.createElement('form')
    form.id = 'designForm'
    const btn = doc.createElement('button')
    btn.id = 'designForm:saveBtn'
    form.appendChild(btn)
    doc.body.appendChild(form)

    const script =
      "PrimeFaces.ab({s:'designForm:saveBtn',f:'designForm',p:'designForm',u:'designForm:msg'});return false;"
    const actionDirect = jsfAction(script, btn, doc)
    const actionWithFailingObserver = extractSafeJsfAction(script, btn, doc, {
      onAnalysis: () => {
        throw new Error('diagnostic logger down')
      },
      createUnsupportedError: () => new Error('PROTOCOL_UNSUPPORTED'),
    })

    expect(actionDirect).toEqual({
      source: 'designForm:saveBtn',
      form: 'designForm',
      process: 'designForm',
      update: 'designForm:msg',
    })
    expect(actionWithFailingObserver).toEqual(actionDirect)
    expect((actionWithFailingObserver as { analysis?: { confidence?: string } })?.analysis?.confidence).toBe('static')
  })

  it('rejects ambiguous callbacks and dynamic UNKNOWN expressions without dispatching HTTP writes', async () => {
    const doc = document.implementation.createHTMLDocument('jsf')
    const btn = doc.createElement('button')
    btn.id = 'btn:dyn'
    doc.body.appendChild(btn)

    let err1: unknown
    try {
      jsfAction('PrimeFaces.ab({s: window.dynamicTarget});return false;', btn, doc)
    } catch (err) {
      err1 = err
    }
    expect((err1 as { diagnostic?: { errorCode?: string } })?.diagnostic?.errorCode).toBe('PROTOCOL_UNSUPPORTED')

    let err2: unknown
    try {
      jsfAction('if (cond()) { PrimeFaces.ab({s:"a",p:"a",u:"a"}); } return false;', btn, doc)
    } catch (err) {
      err2 = err
    }
    expect((err2 as { diagnostic?: { errorCode?: string } })?.diagnostic?.errorCode).toBe('PROTOCOL_UNSUPPORTED')

    let fetches = 0
    const driver = new HagueHttpDriver('boundary-test', (url, init) => {
      fetches += 1
      if ((init?.method ?? 'GET') === 'GET') {
        return Promise.resolve(
          new Response(
            '<form id="f"><input type="hidden" name="javax.faces.ViewState" value="vs1" /><button id="b" onclick="PrimeFaces.ab({s: unknownExpr()})">Go</button></form>',
            { status: 200, headers: { 'Content-Type': 'text/html' } },
          ),
        )
      }
      return Promise.reject(new Error(`Unexpected write to ${url}`))
    })
    await driver.initialize()
    driver.state.document.getElementById('b')?.click()
    await driver.state.settle()
    expect(fetches).toBe(1)
    await expect(driver.call({ op: 'inspect' })).rejects.toThrow('结果待核对')
    expect(fetches).toBe(1)
  })
})
