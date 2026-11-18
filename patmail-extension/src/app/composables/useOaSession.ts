import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

export interface OaSession { tabId: number; title: string; documentId: string; verifiedAt: number; expiresAt: number }
export interface OaSessionClient { listTabs(): Promise<{ id: number; title: string }[]>; verify(tabId: number): Promise<OaSession>;recover?(tabId:number):Promise<OaSession>; open(): Promise<void>; isTransientError?(error:unknown):boolean }
export function useOaSession(client: OaSessionClient,options:{deferPolling?:()=>boolean;recoveringNavigation?:()=>boolean;autoVerify?:boolean;requestTimeoutMs?:number}={}) {
  const tabs = ref<{ id: number; title: string }[]>([]), selected = ref(-1), session = ref<OaSession | null>(null)
  const checking = ref(false), listing = ref(false), error = ref(''), now = ref(Date.now())
  // A protected-tab navigation temporarily makes the old document unusable. Keep
  // its approved tab identity while checking the new document, but never treat
  // the old documentId as verified; only a fresh background probe can restore it.
  const verified = computed(() => !!session.value && session.value.tabId === selected.value && session.value.expiresAt > now.value && session.value.documentId !== '')
  const state = computed(() => checking.value ? 'checking' : verified.value ? 'verified' : session.value ? 'expired' : error.value ? 'error' : 'idle')
  const message = computed(() => checking.value ? '正在只读验证原站登录态…' : error.value || (verified.value ? `已验证「${session.value!.title}」 · ${new Date(session.value!.verifiedAt).toLocaleTimeString()}` : session.value ? options.autoVerify?'验证已过期，空闲时会自动复核。':'验证已过期，请重新连接并检测。' : options.autoVerify?'正在自动查找并验证原站；多个标签页时请选择一个。':'请先在原站完成登录，再连接并检测。'))
  let inFlight:Promise<boolean>|undefined
  let alive=true,pollingApproved=options.autoVerify===true,lastAttemptAt=options.autoVerify?Number.NEGATIVE_INFINITY:0,lastDiscovery=Number.NEGATIVE_INFINITY
  async function bounded<T>(work:Promise<T>,ms=options.requestTimeoutMs??20000):Promise<T>{
    let deadline:ReturnType<typeof setTimeout>|undefined
    try{return await Promise.race([work,new Promise<T>((_resolve,reject)=>{deadline=setTimeout(()=>{const error=new Error('原站检测超时，稍后自动重试，也可点击重新检测。');error.name='SessionRequestTimeout';reject(error)},ms)})])}finally{clearTimeout(deadline)}
  }
  function autoProbe():void{if(alive&&options.autoVerify&&selected.value>=0&&!inFlight&&!listing.value&&!options.deferPolling?.())void verify(true)}
  let generation = 0, timer: ReturnType<typeof setInterval> | undefined
  function invalidate(keepPolling=false): void { generation++; inFlight=undefined; session.value = null; checking.value = false; error.value = '';if(!keepPolling)pollingApproved=options.autoVerify===true }
  watch(selected, () => {invalidate();if(options.autoVerify)void Promise.resolve().then(autoProbe)}, { flush: 'sync' })
  async function refresh(): Promise<void> {
    if (listing.value||!alive) return
    listing.value = true
    try {
      const found=await bounded(client.listTabs());if(!alive)return
      tabs.value=found;lastDiscovery=Date.now()
      if (!tabs.value.some(t => t.id === selected.value)) selected.value = tabs.value.length === 1 ? tabs.value[0].id : -1
      error.value = ''
    } catch (e) { invalidate(); error.value = e instanceof Error ? e.message : '无法读取平台标签页。' }
    finally { listing.value = false;if(options.autoVerify)autoProbe() }
  }
  async function verify(quiet=false,recover=false): Promise<boolean> {
    if(inFlight)return inFlight
    if(selected.value<0)return false
    const version=++generation,tabId=selected.value,previous=session.value
    lastAttemptAt=Date.now()
    checking.value=recover||!quiet||(!verified.value&&pollingApproved)
    if(!quiet)session.value=null
    error.value=''
    const work=(async()=>{
      try{
        const result=await bounded(recover&&client.recover?client.recover(tabId):client.verify(tabId),recover?150000:options.requestTimeoutMs??20000)
        if(version!==generation||tabId!==selected.value)return false
        session.value=result;now.value=Date.now();pollingApproved=true
        return verified.value
      }catch(e){
        if(version===generation){
          const transient=client.isTransientError?.(e)===true||e instanceof Error&&e.name==='SessionRequestTimeout'
          session.value=transient&&previous&&previous.expiresAt>Date.now()?previous:null
          error.value=(e instanceof Error?e.message:'平台登录态无法确认。')+(session.value?' 保留最近一次仍有效的验证，稍后复核。':'')
          return transient&&verified.value
        }
        return false
      }finally{if(version===generation)checking.value=false}
    })()
    inFlight=work
    try{return await work}finally{if(inFlight===work)inFlight=undefined}
  }
  async function open(): Promise<void> { try { await client.open(); await refresh() } catch (e) { error.value = e instanceof Error ? e.message : '无法打开平台。' } }
  async function ensureFresh(): Promise<boolean> {
    if(inFlight)return inFlight
    if (!verified.value) return options.autoVerify&&selected.value>=0?verify(true):false
    if (session.value && Date.now() - session.value.verifiedAt < 15000) return true
    return verify()
  }
  /** Only the caller's confirmed authenticated business receipt may renew the
   * approved tab. This avoids a second GET that can reset a stateful JSF view. */
  function noteAuthenticatedActivity(tabId:number):void {
    const current=session.value,tick=Date.now()
    if(!current||tabId!==selected.value||current.tabId!==tabId||!current.documentId||current.expiresAt<=tick)return
    const ttl=Math.min(300000,Math.max(1,current.expiresAt-current.verifiedAt))
    session.value={...current,verifiedAt:tick,expiresAt:tick+ttl};now.value=tick;error.value=''
  }
  const changed = (tabId: number, info: { url?: string; status?: string }) => {
    if(tabId!==selected.value)return
    if(info.url!==undefined||info.status==='loading'){
      if(options.recoveringNavigation?.()&&inFlight){session.value=null;checking.value=true;error.value='正在恢复原站会话并核验新文档…';return}
      if(options.deferPolling?.()&&!options.recoveringNavigation?.()){
        generation++;inFlight=undefined;checking.value=true;error.value='原站文档已变化，等待工作流核验新文档及原草稿回执。'
        session.value={tabId,title:session.value?.title||'WIPO',documentId:'',verifiedAt:0,expiresAt:0}
        return
      }
      if(pollingApproved){
        generation++; inFlight=undefined; checking.value=true; error.value='';
        // Blank documentId is an explicit pending state, never accepted as a
        // verified session. Keep the polling approval solely for this tab.
        session.value={tabId,title:session.value?.title||'WIPO',documentId:'',verifiedAt:0,expiresAt:0}
      } else invalidate()
    }
    if(info.status==='complete'&&pollingApproved&&!inFlight&&!options.deferPolling?.())void verify(true)
  }
  const removed = (tabId: number) => { if (tabId === selected.value) { invalidate(); selected.value = -1; void refresh() } }
  onMounted(() => {
    void refresh(); timer = setInterval(() => {
      now.value = Date.now()
      if(options.autoVerify&&!listing.value&&!options.deferPolling?.()&&selected.value<0&&now.value-lastDiscovery>=15000){lastDiscovery=now.value;void refresh()}
      if(pollingApproved&&selected.value>=0&&!inFlight&&!listing.value&&!options.deferPolling?.()&&now.value-lastAttemptAt>=(options.autoVerify&&!verified.value?15000:60000))void verify(true)
    }, 1000)
    if (typeof chrome !== 'undefined') { chrome.tabs?.onUpdated?.addListener(changed); chrome.tabs?.onRemoved?.addListener(removed) }
  })
  onBeforeUnmount(() => {
    alive=false;invalidate(); clearInterval(timer)
    if (typeof chrome !== 'undefined') { chrome.tabs?.onUpdated?.removeListener(changed); chrome.tabs?.onRemoved?.removeListener(removed) }
  })
  return { tabs, selected, checking, listing, verified, state, message, refresh, verify,recover:()=>verify(true,true), ensureFresh, noteAuthenticatedActivity,open }
}
