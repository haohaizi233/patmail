import { describe, expect, it, vi } from 'vitest'
import { jsfAction, HagueHttpDriver } from '../../../src/hague/http-driver'
import { extractStaticActions } from '../../../src/hague/diagnostics/ast/analyzer.mjs'

describe('AST PrimeFaces.bcn Execution Security Audit & Negative Tests', () => {
  const verifiedValidBcn = `PrimeFaces.bcn(this, event, [
    function(event) { showBlockUIOnSend(''); },
    function(event) {
      PrimeFaces.ab({s: "ApplicantForm:saveBtn", f: "ApplicantForm", p: "ApplicantForm", u: "ApplicantForm"});
      return false;
    }
  ]);`

  it('permits strictly verified bcn pattern and dispatches exactly one request', async () => {
    const actions = extractStaticActions(verifiedValidBcn, { elementId: 'ApplicantForm:saveBtn' })
    expect(actions).toHaveLength(1)

    const fetchMock = vi.fn().mockResolvedValue(new Response('<partial-response><changes/></partial-response>'))
    const driver = new HagueHttpDriver('bcn-test', fetchMock)
    driver.state.load(`<html><body>
      <form id="ApplicantForm">
        <input type="hidden" name="javax.faces.ViewState" value="vs_token">
        <button id="ApplicantForm:saveBtn">Save</button>
      </form>
    </body></html>`, '/HagueEFilingWeb/protected/page/application.xhtml')

    const btn = driver.state.document.getElementById('ApplicantForm:saveBtn') as HTMLButtonElement
    btn.setAttribute('onclick', verifiedValidBcn)
    btn.click()
    await driver.state.settle()

    // Positive case: exactly one write request dispatched
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('rejects empty callback array without dispatching any request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('<partial-response/>'))
    const driver = new HagueHttpDriver('bcn-empty', fetchMock)
    const script = `PrimeFaces.bcn(this, event, []);`
    driver.state.load(`<html><body>
      <form id="ApplicantForm">
        <input type="hidden" name="javax.faces.ViewState" value="vs">
        <button id="btn" onclick='${script}'>Save</button>
      </form>
    </body></html>`, '/HagueEFilingWeb/protected/page/application.xhtml')

    const btn = driver.state.document.getElementById('btn') as HTMLButtonElement
    btn.click()
    await driver.state.settle().catch(() => {})

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects callback array with more than 2 elements', async () => {
    const fetchMock = vi.fn()
    const script = `PrimeFaces.bcn(this, event, [
      function(event) { showBlockUIOnSend(''); },
      function(event) { PrimeFaces.ab({s: "btn"}); return false; },
      function(event) { maliciousSideEffect(); }
    ]);`
    expect(extractStaticActions(script, { elementId: 'btn' })).toHaveLength(0)
    expect(() => jsfAction(script, document.createElement('button'), document)).toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects inverted callback order (ab first, then ui)', async () => {
    const fetchMock = vi.fn()
    const script = `PrimeFaces.bcn(this, event, [
      function(event) { PrimeFaces.ab({s: "btn"}); return false; },
      function(event) { showBlockUIOnSend(''); }
    ]);`
    expect(extractStaticActions(script, { elementId: 'btn' })).toHaveLength(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects async or generator callbacks', async () => {
    const fetchMock = vi.fn()
    const asyncScript = `PrimeFaces.bcn(this, event, [
      function(event) { showBlockUIOnSend(''); },
      async function(event) { PrimeFaces.ab({s: "btn"}); return false; }
    ]);`
    const genScript = `PrimeFaces.bcn(this, event, [
      function(event) { showBlockUIOnSend(''); },
      function*(event) { PrimeFaces.ab({s: "btn"}); return false; }
    ]);`

    expect(extractStaticActions(asyncScript, { elementId: 'btn' })).toHaveLength(0)
    expect(extractStaticActions(genScript, { elementId: 'btn' })).toHaveLength(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects cancellation guards or conditional branches inside callback', async () => {
    const fetchMock = vi.fn()
    const scriptWithIf = `PrimeFaces.bcn(this, event, [
      function(event) { showBlockUIOnSend(''); },
      function(event) {
        if (confirm("Proceed?")) {
          PrimeFaces.ab({s: "btn"});
        }
        return false;
      }
    ]);`

    expect(extractStaticActions(scriptWithIf, { elementId: 'btn' })).toHaveLength(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects callbacks throwing exceptions', async () => {
    const fetchMock = vi.fn()
    const script = `PrimeFaces.bcn(this, event, [
      function(event) { throw new Error("denied"); },
      function(event) { PrimeFaces.ab({s: "btn"}); return false; }
    ]);`

    expect(extractStaticActions(script, { elementId: 'btn' })).toHaveLength(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects duplicate PrimeFaces.ab invocations inside callback', async () => {
    const fetchMock = vi.fn()
    const script = `PrimeFaces.bcn(this, event, [
      function(event) { showBlockUIOnSend(''); },
      function(event) {
        PrimeFaces.ab({s: "btn:1"});
        PrimeFaces.ab({s: "btn:2"});
        return false;
      }
    ]);`

    expect(extractStaticActions(script, { elementId: 'btn' })).toHaveLength(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects dynamic component IDs and dynamic parameters', async () => {
    const fetchMock = vi.fn()
    const script = `PrimeFaces.bcn(this, event, [
      function(event) { showBlockUIOnSend(''); },
      function(event) {
        PrimeFaces.ab({s: window.dynamicSourceId});
        return false;
      }
    ]);`

    expect(extractStaticActions(script, { elementId: 'btn' })).toHaveLength(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects alias shadowing of PrimeFaces.bcn or showBlockUIOnSend', async () => {
    const fetchMock = vi.fn()
    const script = `
      var bcn = PrimeFaces.bcn;
      bcn(this, event, [
        function(event) { showBlockUIOnSend(''); },
        function(event) { PrimeFaces.ab({s: "btn"}); return false; }
      ]);
    `

    expect(extractStaticActions(script, { elementId: 'btn' })).toHaveLength(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects missing return false (or return true)', async () => {
    const fetchMock = vi.fn()
    const scriptMissingReturn = `PrimeFaces.bcn(this, event, [
      function(event) { showBlockUIOnSend(''); },
      function(event) { PrimeFaces.ab({s: "btn"}); }
    ]);`
    const scriptReturnTrue = `PrimeFaces.bcn(this, event, [
      function(event) { showBlockUIOnSend(''); },
      function(event) { PrimeFaces.ab({s: "btn"}); return true; }
    ]);`

    expect(extractStaticActions(scriptMissingReturn, { elementId: 'btn' })).toHaveLength(0)
    expect(extractStaticActions(scriptReturnTrue, { elementId: 'btn' })).toHaveLength(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects extra side-effect statements in prefix loading callback', async () => {
    const fetchMock = vi.fn()
    const script = `PrimeFaces.bcn(this, event, [
      function(event) { showBlockUIOnSend(''); doEvilSideEffect(); },
      function(event) { PrimeFaces.ab({s: "btn"}); return false; }
    ]);`

    expect(extractStaticActions(script, { elementId: 'btn' })).toHaveLength(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects unknown UI helper in place of showBlockUIOnSend', async () => {
    const fetchMock = vi.fn()
    const script = `PrimeFaces.bcn(this, event, [
      function(event) { unknownUiHelper(''); },
      function(event) { PrimeFaces.ab({s: "btn"}); return false; }
    ]);`

    expect(extractStaticActions(script, { elementId: 'btn' })).toHaveLength(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
