import { describe, expect, it } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import FeeCustomerPickerModal from '../../../src/app/components/FeeCustomerPickerModal.vue'
import { hintDirective } from '../../../src/shell/components/hint'

describe('FeeCustomerPickerModal 卡哇伊提示浮窗', () => {
  it('已选客户项和按钮使用卡哇伊 v-hint 指令，不残留原生 title 属性', async () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    const selected = [
      { id: '1', name: '中兴通讯' },
      { id: '2', name: '中石油-中石油深圳新能源研究院有限公司' }
    ]
    const app = createApp({
      render: () =>
        h(FeeCustomerPickerModal, {
          open: true,
          title: '请选择客户',
          selected
        })
    })
    app.directive('hint', hintDirective)
    app.mount(root)
    await nextTick()

    const modal = document.querySelector('.ihg-modal')
    expect(modal).not.toBeNull()

    const pickedItems = modal!.querySelectorAll('.ihg-picked-list li')
    expect(pickedItems.length).toBe(2)
    pickedItems.forEach((el, index) => {
      expect(el.getAttribute('title')).toBeNull()
      expect((el as unknown as { __hintText?: string }).__hintText).toBe(selected[index].name)
    })

    const pickedNames = modal!.querySelectorAll('.picked-name')
    expect(pickedNames.length).toBe(2)

    // 验证 .picked-name 没有原生 title 属性，且挂载了 __hintText 用于卡哇伊浮窗
    pickedNames.forEach((el, index) => {
      expect(el.getAttribute('title')).toBeNull()
      expect((el as unknown as { __hintText?: string }).__hintText).toBe(selected[index].name)
    })

    // 验证关闭、清空、排序等操作按钮均不含原生 title 属性
    const closeBtn = modal!.querySelector('.ihg-close')
    expect(closeBtn?.getAttribute('title')).toBeNull()
    expect((closeBtn as unknown as { __hintText?: string })?.__hintText).toBe('关闭')

    const clearBtn = modal!.querySelector('.ihg-clear-btn')
    expect(clearBtn?.getAttribute('title')).toBeNull()
    expect((clearBtn as unknown as { __hintText?: string })?.__hintText).toBe('清空已选客户')

    const removeBtns = modal!.querySelectorAll('.picked-del')
    expect(removeBtns.length).toBe(2)
    expect(removeBtns[0]?.getAttribute('title')).toBeNull()
    expect((removeBtns[0] as unknown as { __hintText?: string })?.__hintText).toBe('移除该客户')

    const sortBtns = modal!.querySelectorAll('.ihg-order-btns button')
    expect(sortBtns[0]?.getAttribute('title')).toBeNull()
    expect((sortBtns[0] as unknown as { __hintText?: string })?.__hintText).toBe('向上移动')
    expect(sortBtns[1]?.getAttribute('title')).toBeNull()
    expect((sortBtns[1] as unknown as { __hintText?: string })?.__hintText).toBe('向下移动')

    app.unmount()
    root.remove()
    document.querySelectorAll('.ihg-backdrop').forEach(el => el.remove())
  })
})
