import { expect,it } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { showDraftCompletion } from '../../../src/hague/draft-completion'
import { closeDialog, dialogState } from '../../../src/app/dialog'
import AppDialog from '../../../src/app/components/AppDialog.vue'

it('uses the shared dialog, replaces the previous popup and renders review notes as text',async()=>{
 const root=document.createElement('div'),app=createApp({render:()=>h(AppDialog)})
 document.body.append(root);app.mount(root)
 try {
  const first=showDraftCompletion('成功 1',[])
  expect(dialogState().open).toBe(true)
  const second=showDraftCompletion('成功 2',['邮编留空','邮编留空','<img src=x onerror=alert(1)>'])
  await expect(first).resolves.toBe(false)
  await nextTick()
  const dialog=root.querySelector('[role="dialog"]')!
  expect(dialog.textContent).toContain('草稿处理完成')
  expect(dialog.textContent).toContain('成功 2')
  expect(dialog.querySelectorAll('tbody tr')).toHaveLength(2)
  expect(dialog.textContent).toContain('<img src=x onerror=alert(1)>')
  expect(dialog.querySelector('img')).toBeNull()
  ;[...dialog.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='我知道了')!.click()
  await expect(second).resolves.toBe(true)
  expect(dialogState().open).toBe(false)
 } finally {closeDialog(false);app.unmount();root.remove();document.querySelectorAll('#hague-draft-completion').forEach(node=>node.remove())}
})
