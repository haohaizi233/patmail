import { expect,it } from 'vitest'
import { showDraftCompletion } from '../../../src/hague/draft-completion'
it('opens one completion dialog and renders review notes as text',()=>{
 // Happy DOM does not implement native dialog methods.
 const proto=Object.getPrototypeOf(document.createElement('dialog')) as {showModal?:(this:HTMLDialogElement)=>void;close?:(this:HTMLDialogElement)=>void}
 proto.showModal=function(this:HTMLDialogElement){this.setAttribute('open','')}
 proto.close=function(this:HTMLDialogElement){this.removeAttribute('open');this.dispatchEvent(new Event('close'))}
 const first=showDraftCompletion('成功 1',[])
 const second=showDraftCompletion('成功 2',['邮编留空','<img src=x onerror=alert(1)>'])
 expect(first.isConnected).toBe(false)
 expect(second.open).toBe(true)
 expect(second.querySelectorAll('li')).toHaveLength(2)
 expect(second.querySelector('img')).toBeNull()
 second.querySelector('button')!.click()
 expect(second.open).toBe(false)
 second.remove();delete proto.showModal;delete proto.close
})

