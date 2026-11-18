import { describe, expect, it } from 'vitest'
import { parseJsfProtocol, compareJsfDualParsers } from '../../../src/hague/diagnostics/protocol/jsf-semantics.mjs'

const wrap = (s: string) => `<partial-response><changes>${s}</changes></partial-response>`

describe('JSF Protocol Semantics Engine', () => {
  it('distinguishes well-formed XML from valid JSF protocol', () => {
    // Well formed XML but not a partial-response root
    const nonJsfXml = '<?xml version="1.0"?><service-catalog><item id="1">value</item></service-catalog>'
    const res = parseJsfProtocol(nonJsfXml)
    expect(res.recognized).toBe(false)
    expect(res.kind).toBe('unsupported')
    expect(res.protocolStatus).toBe('unsupported')
    expect(res.unresolvedReasons).toContain('root_not_partial_response')
  })

  it('records raw sequence of protocol actions in exact order', () => {
    const xml = wrap(`
      <update id="headerForm"><![CDATA[<div>Header</div>]]></update>
      <eval><![CDATA[console.log(1)]]></eval>
      <delete id="tempPanel"/>
      <extension ln="primefaces" type="args">{"customArg":123}</extension>
      <update id="javax.faces.ViewState"><![CDATA[vs-12345]]></update>
    `)
    const res = parseJsfProtocol(xml)
    expect(res.recognized).toBe(true)
    expect(res.protocolStatus).toBe('valid')
    expect(res.actions).toHaveLength(5)
    expect(res.actions.map(a => a.action)).toEqual(['update', 'eval', 'delete', 'extension', 'update'])
    expect(res.actions[0]).toMatchObject({ action: 'update', id: 'headerForm' })
    expect(res.actions[2]).toMatchObject({ action: 'delete' })
    expect(res.actions[2]?.id?.startsWith('component-')).toBe(true)
    expect(res.actions[4]).toMatchObject({ action: 'update', isViewState: true })
    expect(res.viewState).toMatchObject({ present: true, length: 8, namespace: 'javax' })
  })

  it('identifies javax vs jakarta vs mixed namespace', () => {
    const javaxXml = wrap('<update id="javax.faces.ViewState">TOKEN</update>')
    expect(parseJsfProtocol(javaxXml).namespace).toBe('javax')

    const jakartaXml = wrap('<update id="jakarta.faces.ViewState">TOKEN</update>')
    expect(parseJsfProtocol(jakartaXml).namespace).toBe('jakarta')

    const mixedXml = wrap('<update id="javax.faces.ViewState">TOKEN1</update><update id="jakarta.faces.ViewState">TOKEN2</update>')
    expect(parseJsfProtocol(mixedXml).namespace).toBe('mixed')

    const unknownXml = wrap('<update id="ApplicantForm"><div>Data</div></update>')
    expect(parseJsfProtocol(unknownXml).namespace).toBe('unknown')
  })

  it('safely classifies JSF errors without storing sensitive payload', () => {
    const errorXml = '<partial-response><error><error-name>javax.faces.application.ViewExpiredException</error-name><error-message>View /app.xhtml could not be restored for user secret-user-account-xyz</error-message></error></partial-response>'
    const res = parseJsfProtocol(errorXml)
    expect(res.protocolStatus).toBe('jsf_error')
    expect(res.protocolErrors).toHaveLength(1)
    expect(res.protocolErrors[0].errorName).toBe('ViewExpiredException')
    // Raw sensitive details must be sanitized / categorized
    expect(JSON.stringify(res)).not.toContain('secret-user-account-xyz')
    expect(res.protocolErrors[0].category).toBe('view_expired')
  })

  it('extracts safe redirect destination without evaluating or executing', () => {
    const redirectXml = '<partial-response><redirect url="https://hague.wipo.int/HagueEFilingWeb/login"/></partial-response>'
    const res = parseJsfProtocol(redirectXml)
    expect(res.protocolStatus).toBe('redirect')
    expect(res.redirect).toMatchObject({
      detected: true,
      urlPath: '/HagueEFilingWeb/login',
    })
  })

  it('detects PrimeFaces validationFailed in extension args', () => {
    const xml = wrap('<extension ln="primefaces" type="args">{"validationFailed":true,"totalRecords":5}</extension>')
    const res = parseJsfProtocol(xml)
    expect(res.protocolStatus).toBe('jsf_validation_failed')
    expect(res.validation).toMatchObject({
      failed: true,
      evidenceSource: 'extension_args',
    })
    // Raw JSON values should not leak into stringified result
    expect(JSON.stringify(res)).not.toContain('"totalRecords":5')
  })

  it('tracks unknown nodes as structured unresolved reasons', () => {
    const xml = wrap('<unknownCustomWidget id="test"><payload/></unknownCustomWidget>')
    const res = parseJsfProtocol(xml)
    expect(res.unresolvedReasons).toContain('unknown_node:unknownCustomWidget')
  })

  it('sanitizes untrusted error names and never leaks raw class names into diagnostic errorName', () => {
    const maliciousXml = '<partial-response><error><error-name>com.wipo.internal.PrivateDatabaseFailureException</error-name><error-message>Confidential server details at line 42</error-message></error></partial-response>'
    const res = parseJsfProtocol(maliciousXml)
    expect(res.protocolStatus).toBe('jsf_error')
    expect(res.protocolErrors).toHaveLength(1)
    // Never leaks the arbitrary raw class name
    expect(res.protocolErrors[0].errorName).not.toContain('PrivateDatabaseFailureException')
    expect(res.protocolErrors[0].errorName).toBe('InternalServerError')
    expect(res.protocolErrors[0].category).toBe('internal_server_error')
    expect(JSON.stringify(res)).not.toContain('PrivateDatabaseFailureException')
    expect(JSON.stringify(res)).not.toContain('Confidential server details')
  })

  it('bounds text and CDATA accumulation to prevent memory exhaustion', () => {
    const hugeNoise = 'A'.repeat(100000)
    const xml = wrap(`<update id="javax.faces.ViewState"><![CDATA[${hugeNoise}]]></update>`)
    const res = parseJsfProtocol(xml)
    expect(res.recognized).toBe(true)
    expect(res.viewState.present).toBe(true)
    // Capped at 65536
    expect(res.viewState.length).toBeLessThanOrEqual(65536)
  })

  it('maintains dual-parser semantic consistency between SAX and DOMParser across all standard fixture types', () => {
    const fixtures = [
      { name: 'normal update', xml: wrap('<update id="ApplicantForm"><p>text</p></update>') },
      { name: 'multiple updates', xml: wrap('<update id="ApplicantForm"><div>1</div></update><update id="CreatorForm"><div>2</div></update>') },
      { name: 'ViewState update', xml: wrap('<update id="javax.faces.ViewState">TOKEN123</update>') },
      { name: 'ViewRoot update', xml: wrap('<update id="javax.faces.ViewRoot"><html><body>new root</body></html></update>') },
      { name: 'insert action', xml: wrap('<insert id="table:row"><p>new row</p></insert>') },
      { name: 'delete action', xml: wrap('<delete id="table:row"/>') },
      { name: 'attributes action', xml: wrap('<attributes id="comp1"><attribute name="disabled" value="true"/></attributes>') },
      { name: 'eval script', xml: wrap('<eval>console.log("hi")</eval>') },
      { name: 'extension metadata', xml: wrap('<extension ln="primefaces" type="args">{"validationFailed":false}</extension>') },
      { name: 'redirect action', xml: '<partial-response><redirect url="https://hague.wipo.int/HagueEFilingWeb/login"/></partial-response>' },
      { name: 'protocol error', xml: '<partial-response><error><error-name>Exception</error-name></error></partial-response>' },
      { name: 'validation failed', xml: wrap('<extension ln="primefaces" type="args">{"validationFailed":true}</extension>') },
      { name: 'html page', xml: '<html><body>Not XML</body></html>' },
      { name: 'invalid xml', xml: '<partial-response><unclosed>' },
      { name: 'unknown xml node', xml: wrap('<customUnknownNode id="u1"/>') }
    ]

    for (const fixture of fixtures) {
      const comparison = compareJsfDualParsers(fixture.xml)
      expect(comparison.consistent, `Fixture failed dual-parser consistency: ${fixture.name}`).toBe(true)
    }
  })
})
