import { HAGUE_ORIGIN } from './session-contract'
import { hagueSessionClient } from './session'

/** New background tabs retain the browser's login session, but receive separate JSF views. */
export async function openDraftTab():Promise<number> {
  const tab=await chrome.tabs.create({url:`${HAGUE_ORIGIN}/HagueEFilingWeb/protected/portfolioManager.xhtml`,active:false})
  if(tab.id===undefined)throw new Error('无法创建 eHague 工作标签页。')
  const end=Date.now()+30000
  while(Date.now()<end){
    const current=await chrome.tabs.get(tab.id)
    if(current.status==='complete'){
      if(!current.url||new URL(current.url).origin!==HAGUE_ORIGIN||!new URL(current.url).pathname.endsWith('/portfolioManager.xhtml'))throw new Error('eHague 登录失效或工作标签页未到案件列表，请先登录。')
      await hagueSessionClient.verify(tab.id)
      return tab.id
    }
    await new Promise(r=>setTimeout(r,150))
  }
  throw new Error('eHague 工作标签页加载超时，已保留页面供核对。')
}
