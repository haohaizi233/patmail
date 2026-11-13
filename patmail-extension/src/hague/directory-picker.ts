interface FileHandle { kind:'file'; name:string; getFile():Promise<File> }
export interface DirectoryHandle { kind:'directory'; name:string; values():AsyncIterable<FileHandle|DirectoryHandle> }
export interface DirectoryPickerHost { showDirectoryPicker?:(options:{mode:'read';id:string})=>Promise<DirectoryHandle> }

/** Read only; preserve the same paths as dropped folders and the compatible file input. */
export async function readDirectoryHandle(root:DirectoryHandle,maxFiles=5000):Promise<File[]> {
 const out:File[]=[]
 const walk=async(handle:DirectoryHandle,prefix:string):Promise<void>=>{
  for await(const child of handle.values()){
   const path=`${prefix}/${child.name}`
   if(child.kind==='directory')await walk(child,path)
   else{
    const file=await child.getFile()
    Object.defineProperty(file,'webkitRelativePath',{value:path,configurable:true})
    out.push(file)
    if(out.length>maxFiles)throw new Error(`文件夹超过 ${maxFiles} 个文件，请分批导入。`)
   }
  }
 }
 await walk(root,root.name);return out
}
export async function pickDirectoryFiles(host:DirectoryPickerHost,fallback:()=>void):Promise<File[]|null> {
 if(typeof host.showDirectoryPicker!=='function'){fallback();return null}
 try{
  const root=await host.showDirectoryPicker({mode:'read',id:'hague-materials'})
  return await readDirectoryHandle(root)
 }catch(error){
  if(error instanceof DOMException&&error.name==='AbortError')return null
  throw error
 }
}
