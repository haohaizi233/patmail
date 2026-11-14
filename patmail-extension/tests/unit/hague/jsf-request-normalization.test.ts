import { describe, expect, it } from 'vitest'
import { parseJsfRequest } from '../../../src/hague/diagnostics/protocol/jsf-partial-response.mjs'
import { createObservedComponentRegistry } from '../../../src/hague/diagnostics/protocol/observed-components.mjs'

describe('JSF Request Normalization & Component Mapping', () => {
  it('normalizes JSF AJAX request into sanitized protocol structure', () => {
    const postData = [
      'javax.faces.partial.ajax=true',
      'javax.faces.source=ApplicantForm%3AsaveBtn',
      'javax.faces.partial.execute=%40this+ApplicantForm',
      'javax.faces.partial.render=ApplicantForm+headerForm',
      'javax.faces.behavior.event=action',
      'javax.faces.partial.event=click',
      'javax.faces.ViewState=TOKEN_VALUE_SECRET',
      'extraCustomParam=CUSTOM_VAL',
      'duplicateKey=val1',
      'duplicateKey=val2',
    ].join('&')

    const normalized = parseJsfRequest({
      method: 'POST',
      url: 'https://hague.wipo.int/HagueEFilingWeb/protected/page/application.xhtml',
      contentType: 'application/x-www-form-urlencoded; charset=UTF-8',
      postData,
    })

    expect(normalized.eligibleAjax).toBe(true)
    expect(normalized.facesNamespace).toBe('javax')
    expect(normalized.sourceComponent).toBe('ApplicantForm:saveBtn')
    expect(normalized.form).toBe('ApplicantForm')
    expect(normalized.executeComponents).toEqual(['@this', 'ApplicantForm'])
    expect(normalized.renderComponents).toEqual(['ApplicantForm', 'headerForm'])
    expect(normalized.behaviorEvent).toBe('action')
    expect(normalized.ajaxMarkerPresent).toBe(true)
    expect(normalized.viewStatePresent).toBe(true)
    expect(normalized.duplicateParameterCount).toBe(1)
    expect(normalized.unknownParameterCount).toBe(2) // extraCustomParam, duplicateKey
    expect(normalized.protocolConfidence).toBe('exact')

    // Sensitive values must not be retained
    expect(JSON.stringify(normalized)).not.toContain('TOKEN_VALUE_SECRET')
    expect(JSON.stringify(normalized)).not.toContain('CUSTOM_VAL')
  })

  it('detects namespace conflicts when both javax and jakarta parameters exist', () => {
    const postData = 'javax.faces.partial.ajax=true&jakarta.faces.source=designForm'
    const res = parseJsfRequest({ postData, contentType: 'application/x-www-form-urlencoded' })
    expect(res.facesNamespace).toBe('mixed')
    expect(res.unresolvedReasons).toContain('namespace_conflict')
    expect(res.protocolConfidence).toBe('partial')
  })

  it('safely handles missing postData with unknown status rather than guessing', () => {
    const res = parseJsfRequest({ method: 'POST', contentType: 'application/x-www-form-urlencoded' })
    expect(res.eligibleAjax).toBe(false)
    expect(res.requestMetadataStatus).toBe('unsupported')
    expect(res.protocolConfidence).toBe('unresolved')
  })

  it('maintains controlled ObservedComponent registry with evidence provenance', () => {
    const reg = createObservedComponentRegistry()

    // Register a component with AST + DOM evidence
    const comp = reg.registerComponent({
      componentId: 'ApplicantForm:saveBtn',
      namingContainer: 'ApplicantForm',
      formId: 'ApplicantForm',
      widgetType: 'CommandButton',
      sourceEvidence: 'ast_and_dom',
      confidence: 'exact',
    })

    expect(comp).toMatchObject({
      componentId: 'ApplicantForm:saveBtn',
      formId: 'ApplicantForm',
      componentRole: 'save_action',
      confidence: 'exact',
    })

    // Query component
    const resolved = reg.getComponent('ApplicantForm:saveBtn')
    expect(resolved).toBeDefined()
    expect(resolved?.componentRole).toBe('save_action')

    // Disallows guessing role for unknown dynamic IDs without evidence
    const unverified = reg.registerComponent({
      componentId: 'j_idt999',
      sourceEvidence: 'unverified_string',
      confidence: 'unresolved',
    })
    expect(unverified.componentRole).toBe('unknown')
  })
})
