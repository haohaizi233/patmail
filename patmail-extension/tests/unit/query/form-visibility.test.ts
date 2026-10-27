import { afterEach, describe, expect, it } from 'vitest'
import { scanFileSearchForm } from '../../../src/query/scan-file-search-form.mjs'
import { hiddenFormFields } from '../../../src/query/form-page'
import { cellKeys, queryBlocks } from '../../../src/query/form-layout'

afterEach(() => { document.body.innerHTML = '' })

function fileForm(marker: string, rowClass: string): void {
  document.body.innerHTML = `<table id="table_element"><tbody>
    <tr><td><input id="case_volume"></td></tr>
    <tr><td><button id="btn_more">更多</button></td></tr>
    <tr id="is_file"><td><a class="${marker}">文件条件</a></td></tr>
    <tr name="file" class="${rowClass}" style="display:none">
      <td class="tdtitle">文件描述</td><td><input id="filetype" readonly></td>
      <td class="tdtitle">文件来源</td><td><input id="selfileclass" readonly></td>
    </tr>
    <tr name="file" class="${rowClass}" style="display:none">
      <td class="tdtitle">附件名称</td><td><input id="file_name"></td>
      <td class="tdtitle">设置下载文件名称</td><td><select id="filetemp"><option value="live">当前模板</option></select></td>
    </tr>
    <tr><td class="tdtitle">文件备注</td><td><input id="file_remark"></td></tr>
  </tbody></table>`
}

function fileKeys(): string[] {
  const scanned = scanFileSearchForm(document).fields
  const block = queryBlocks(hiddenFormFields(scanned)).find(item => item.title === '文件条件')!
  return [...block.cells, ...block.extra].flatMap(cellKeys)
}

describe('文件查询字段与原站折叠状态', () => {
  it('keeps file controls after the original more button folds previously visible rows', () => {
    fileForm('img_show', 'tr_hide js-toggle-hide')
    expect(fileKeys()).toEqual(expect.arrayContaining(['filetype', 'fileclass', 'file_name', 'filetemp', 'file_remark']))
    expect(scanFileSearchForm(document).fields.find(field => field.id === 'filetemp')?.options)
      .toEqual([{ value: 'live', label: '当前模板' }])
    expect(document.querySelector('tr[name="file"]')?.getAttribute('style')).toBe('display:none')
  })

  it('keeps ordinary file controls when the original file section is folded', () => {
    fileForm('img_hide', 'tr_hide')
    expect(fileKeys()).toEqual(expect.arrayContaining(['filetype', 'fileclass', 'file_name', 'filetemp', 'file_remark']))
  })

  it('preserves configured row, cell and control hiding inside a folded file section', () => {
    fileForm('img_hide', 'tr_hide')
    document.querySelector('tbody')!.insertAdjacentHTML('beforeend', `
      <tr name="file" class="tr_hide PTE" style="display:none"><td><input id="payment_review_user_id"></td></tr>
      <tr name="file" class="tr_hide KLFD-202507" style="display:none"><td><input id="file_name_batch"></td></tr>
      <tr name="file" class="tr_hide HKDZ2601" style="display:none"><td><input id="pat_allocator_user_id"></td></tr>
      <tr name="file" class="tr_hide js-toggle-hide" style="display:none">
        <td style="display:none"><input id="receive_name"></td>
        <td><input id="txtfilename1" style="display:none"></td>
      </tr>`)
    const scanned = scanFileSearchForm(document).fields
    for (const id of ['payment_review_user_id', 'file_name_batch', 'pat_allocator_user_id', 'receive_name', 'txtfilename1']) {
      expect(scanned.find(field => field.id === id)?.visible, id).toBe(false)
    }
  })

  it('does not reinterpret an unmarked hidden row as a folded section', () => {
    fileForm('img_show', 'tr_hide')
    expect(scanFileSearchForm(document).fields.find(field => field.id === 'filetype')?.visible).toBe(false)
  })
})
