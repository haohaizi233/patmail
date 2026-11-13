import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

export interface OaSession { tabId: number; title: string; documentId: string; verifiedAt: number; expiresAt: number }
export interface OaSessionClient { listTabs(): Promise<{ id: number; title: string }[]>; verify(tabId: number): Promise<OaSession>; open(): Promise<void> }
export function useOaSession(client: OaSessionClient) {
  const tabs = ref<{ id: number; title: string }[]>([]), selected = ref(-1), session = ref<OaSession | null>(null)
  const checking = ref(false), listing = ref(false), error = ref(''), now = ref(Date.now())
  const verified = computed(() => !!session.value && session.value.tabId === selected.value && session.value.expiresAt > now.value)
  const state = computed(() => checking.value ? 'checking' : verified.value ? 'verified' : session.value ? 'expired' : error.value ? 'error' : 'idle')
  const message = computed(() => checking.value ? '正在只读验证原站登录态…' : error.value || (verified.value ? `已验证「${session.value!.title}」 · ${new Date(session.value!.verifiedAt).toLocaleTimeString()}` : session.value ? '验证已过期，请重新连接并检测。' : '请先在原站完成登录，再连接并检测。'))
  let inFlight:Promise<boolean>|undefined
  let pollingApproved=false,lastAttemptAt=0
  let generation = 0, timer: ReturnType<typeof setInterval> | undefined
  function invalidate(keepPolling=false): void { generation++; inFlight=undefined; session.value = null; checking.value = false; error.value = '';if(!keepPolling)pollingApproved=false }
  watch(selected, () => invalidate(), { flush: 'sync' })
  async function refresh(): Promise<void> {
    if (listing.value) return
    listing.value = true
    try {
      tabs.value = await client.listTabs()
      if (!tabs.value.some(t => t.id === selected.value)) selected.value = tabs.value.length === 1 ? tabs.value[0].id : -1
      error.value = ''
    } catch (e) { invalidate(); error.value = e instanceof Error ? e.message : '无法读取平台标签页。' }
    finally { listing.value = false }
  }
  async function verify(quiet=false): Promise<boolean> {
    if(inFlight)return inFlight
    if(selected.value<0)return false
    const version=++generation,tabId=selected.value
    lastAttemptAt=Date.now()
    checking.value=!quiet
    if(!quiet)session.value=null
    error.value=''
    const work=(async()=>{
      try{
        const result=await client.verify(tabId)
        if(version!==generation||tabId!==selected.value)return false
        session.value=result;now.value=Date.now();pollingApproved=true
        return verified.value
      }catch(e){
        if(version===generation){session.value=null;error.value=e instanceof Error?e.message:'平台登录态无法确认。'}
        return false
      }finally{if(version===generation)checking.value=false}
    })()
    inFlight=work
    try{return await work}finally{if(inFlight===work)inFlight=undefined}
  }
  async function open(): Promise<void> { try { await client.open(); await refresh() } catch (e) { error.value = e instanceof Error ? e.message : '无法打开平台。' } }
  async function ensureFresh(): Promise<boolean> {
    if (!verified.value) return false
    if (session.value && Date.now() - session.value.verifiedAt < 15000) return true
    return verify()
  }
  const changed = (tabId: number, info: { url?: string; status?: string }) => {
    if(tabId!==selected.value)return
    if(info.url!==undefined||info.status==='loading')invalidate(true)
    if(info.status==='complete'&&pollingApproved&&!inFlight)void verify(true)
  }
  const removed = (tabId: number) => { if (tabId === selected.value) { invalidate(); selected.value = -1; void refresh() } }
  onMounted(() => {
    void refresh(); timer = setInterval(() => {
      now.value = Date.now()
      if(pollingApproved&&!inFlight&&now.value-lastAttemptAt>=60000)void verify(true)
    }, 1000)
    if (typeof chrome !== 'undefined') { chrome.tabs?.onUpdated?.addListener(changed); chrome.tabs?.onRemoved?.addListener(removed) }
  })
  onBeforeUnmount(() => {
    invalidate(); clearInterval(timer)
    if (typeof chrome !== 'undefined') { chrome.tabs?.onUpdated?.removeListener(changed); chrome.tabs?.onRemoved?.removeListener(removed) }
  })
  return { tabs, selected, checking, listing, verified, state, message, refresh, verify, ensureFresh, open }
}
