import { describe, it, expect } from 'vitest'
import { discoverCases, parseFilingXml, validateImages, reference, validCaseVolume } from '../../../src/hague/materials'

const file = (path: string) => Object.assign(new File([''], path.split('/').pop()!), { webkitRelativePath: path })
const xml = (rows: string[][]) => `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Locarno Class: 28</w:t></w:r></w:p><w:tbl>${rows.map(r => `<w:tr>${r.map(c => `<w:tc><w:p><w:r><w:t>${c}</w:t></w:r></w:p></w:tc>`).join('')}</w:tr>`).join('')}</w:tbl></w:body></w:document>`
describe('Hague materials', () => {
  it('extracts case reference starting with P and ending with HAGUE', () => {
    expect(reference('JL254961P1HS-PA2532083CN-HAGUE-汽车尾灯-补正')).toBe('PA2532083CN-HAGUE')
    expect(reference('JL254972P1HS-PA2532089CN-HAGUE-Instrument panel for vehicle-New application')).toBe('PA2532089CN-HAGUE')
    expect(reference('JL254956P1HS-PA2532115CN-HAGUE-Bumper for vehicle-New application')).toBe('PA2532115CN-HAGUE')
    expect(reference('JL251455HS-PO2530287HAGUE-Motor vehicle-New application-V2')).toBe('PO2530287HAGUE')
    expect(reference('Package-PA2532083CN-HAGUE')).toBe('PA2532083CN-HAGUE')
    expect(reference('Project-PO2530287HAGUE')).toBe('PO2530287HAGUE')
    expect(reference('PA2532083-1-HAGUE')).toBe('PA2532083-1-HAGUE')
    expect(reference('form.docx')).toBe('')
    expect(reference('大客户')).toBe('')

    expect(validCaseVolume('PA2532083CN-HAGUE')).toBe(true)
    expect(validCaseVolume('PA2532089CN-HAGUE')).toBe(true)
    expect(validCaseVolume('PO2530287HAGUE')).toBe(true)
    expect(validCaseVolume('PO1HAGUE')).toBe(true)
    expect(validCaseVolume('PA2532083CN')).toBe(false)
    expect(validCaseVolume('JL254961P1HS')).toBe(false)
  })

  it('discovers cases matching client folders with P-prefix and HAGUE-suffix', () => {
    const files = [
      file('大客户/JL254961P1HS-PA2532083CN-HAGUE-汽车尾灯-补正/form.docx'),
      file('大客户/JL254961P1HS-PA2532083CN-HAGUE-汽车尾灯-补正/1.1.jpg'),
      file('大客户/JL254972P1HS-PA2532089CN-HAGUE-Instrument panel for vehicle-New application/form.docx'),
      file('大客户/JL254972P1HS-PA2532089CN-HAGUE-Instrument panel for vehicle-New application/1.1.jpg')
    ]
    const cases = discoverCases(files)
    expect(cases).toHaveLength(2)
    expect(cases[0].caseVolume).toBe('PA2532083CN-HAGUE')
    expect(cases[1].caseVolume).toBe('PA2532089CN-HAGUE')
    expect(cases[0].documents).toHaveLength(1)
    expect(cases[1].documents).toHaveLength(1)
    expect(cases[0].issues).toEqual([])
    expect(cases[1].issues).toEqual([])
  })
  it('isolates nested cases and detects mismatched document references', () => {
    const cases = discoverCases([file('总/A/PO2631874HAGUE/PO2631909HAGUE.docx'), file('总/A/PO2631874HAGUE/images/1.1.jpg'), file('总/B/PO999HAGUE/form.docx'), file('总/B/PO999HAGUE/1.1.jpg')])
    expect(cases).toHaveLength(2)
    expect(cases[0].images).toHaveLength(1)
    expect(cases[0].notices?.join()).toContain('默认使用')
    expect(cases[0].issues).toEqual([])
    expect(cases[1].images).toHaveLength(1)
  })
  it('keeps same-case FIGS descendants in their parent case instead of creating missing-Word rows',()=>{
    const cases=discoverCases([file('root/PO2431572HAGUE-New-V2/Filing form.doc'),file('root/PO2431572HAGUE-New-V2/PO2431572HAGUE-FIGS-V2/1.1.jpg'),file('root/PO2431572HAGUE-New-V2/PO2431572HAGUE-FIGS-V2/1.2.jpg')])
    expect(cases).toHaveLength(1);expect(cases[0].documents).toHaveLength(1);expect(cases[0].images).toHaveLength(2);expect(cases[0].issues).toEqual([])
  })
  it('preserves genuinely nested different cases and independent same-reference document sets',()=>{
    const cases=discoverCases([file('root/PO1HAGUE/form.docx'),file('root/PO1HAGUE/1.1.jpg'),file('root/PO1HAGUE/PO2HAGUE/form.docx'),file('root/PO1HAGUE/PO2HAGUE/1.1.jpg'),file('root/PO1HAGUE/PO1HAGUE-other-version/form.docx'),file('root/PO1HAGUE/PO1HAGUE-other-version/1.1.jpg')])
    expect(cases).toHaveLength(3);for(const c of cases){expect(c.documents).toHaveLength(1);expect(c.images).toHaveLength(1)}
  })
  it('reads each No/Code/Legend group without swapping left and top', () => {
    const result = parseFilingXml(xml([['No.', 'Code', 'Legend', 'No.', 'Code', 'Legend'], ['1.3', '3', 'Back', '1.4', '6', 'Left'], ['1.5', '7', '', '1.6', '4', '']]))
    expect(result.views.map(v => [v.number, v.code, v.label])).toEqual([['1.3', '3', 'Back'], ['1.4', '6', 'Left'], ['1.5', '7', 'Right'], ['1.6', '4', 'Top']])
  })
  it('locates DOCX sections by heading text rather than fixed section numbers',()=>{
    const p=(s:string)=>`<w:p><w:r><w:t>${s}</w:t></w:r></w:p>`
    const result=parseFilingXml(xml([['1.1','2','']]).replace('<w:tbl>',`${p('9. Description (if applicable)')}${p('Exact source description.')}${p('Legends (optional)')}<w:tbl>`))
    expect(result.description).toBe('Exact source description.')
    expect(result.description).not.toContain('Legends')
  })
  it('requires custom legend for 00 and flags conflicting labels', () => {
    expect(parseFilingXml(xml([['1.1', '00', '', '1.2', '6', 'Top']])).issues.join()).toMatch(/00/)
    expect(parseFilingXml(xml([['1.1', '6', 'Top']])).issues.join()).toContain('不一致')
  })
  it('sorts numerically and detects missing and duplicate images', () => {
    const parsed = parseFilingXml(xml([['1.2', '2', '', '1.10', '1', '']]))
    expect(validateImages(parsed, [file('1.10.jpg'), file('1.10.png')]).join()).toMatch(/缺少.*1.2/)
    expect(validateImages(parsed, [file('1.10.jpg'), file('1.10.png')]).join()).toContain('重复')
  })
})

it('reports repeated design numbers and per-design count mismatch before drafting',()=>{
 const f={locarno:'13',products:[['1','1','Charger','02'],['2','2','Charger','02']],description:'',views:[{number:'1.1',code:'1',label:'Perspective'},{number:'1.2',code:'2',label:'Front'},{number:'2.1',code:'1',label:'Perspective'}],issues:[]}
 const images=f.views.map(v=>new File(['x'],v.number+'.jpg'))
 expect(validateImages(f,images).join()).toContain('设计 1 的图纸数量不符：Word 1 / 文件 2')
 f.products[1][0]='1'
 expect(validateImages(f,images).join()).toContain('产品表设计编号重复：1')
})
