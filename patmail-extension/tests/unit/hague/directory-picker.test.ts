import { expect,it,vi } from 'vitest'
import { pickDirectoryFiles,readDirectoryHandle,type DirectoryHandle } from '../../../src/hague/directory-picker'
const file=(name:string)=>({kind:'file' as const,name,getFile:async()=>new File(['x'],name)})
function dir(name:string,children:unknown[]):DirectoryHandle{return {kind:'directory',name,async *values(){for(const x of children)yield x}} as DirectoryHandle}
it('reads directory handles recursively and preserves case-relative paths',async()=>{
 const root=dir('总目录',[dir('PO1HAGUE',[file('form.docx'),file('1.1.jpg')])])
 const files=await readDirectoryHandle(root)
 expect(files.map(f=>f.webkitRelativePath)).toEqual(['总目录/PO1HAGUE/form.docx','总目录/PO1HAGUE/1.1.jpg'])
 await expect(readDirectoryHandle(root,1)).rejects.toThrow('超过 1')
})
it('uses the read-only directory picker; cancel does not fall back to another prompt',async()=>{
 const fallback=vi.fn(),picker=vi.fn(async()=>dir('材料',[file('a.docx')]))
 expect(await pickDirectoryFiles({showDirectoryPicker:picker},fallback)).toHaveLength(1)
 expect(picker).toHaveBeenCalledWith({mode:'read',id:'hague-materials'})
 const cancelled=async()=>{throw new DOMException('cancelled','AbortError')}
 expect(await pickDirectoryFiles({showDirectoryPicker:cancelled},fallback)).toBeNull()
 expect(fallback).not.toHaveBeenCalled()
 expect(await pickDirectoryFiles({},fallback)).toBeNull()
 expect(fallback).toHaveBeenCalledTimes(1)
})
