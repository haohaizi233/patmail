import { inject, onMounted, ref } from 'vue'
import { QUERY_SURFACES } from '../../customer/mail-flow'
import { fetchQuerySurfaces, type QuerySurfaceOption } from '../../customer/query-surfaces'
import type { MessageBridge } from '../../shared/message'

/** 所有用到「查询入口」下拉框的页面共用这一份：选项从原网站菜单热加载，读不到才退回内置两项。 */
export function useQuerySurfaces(fallback?: QuerySurfaceOption[]) {
  const bridge = inject<MessageBridge>('bridge')
  const seed = fallback && fallback.length
    ? fallback.map(item => ({ ...item }))
    : QUERY_SURFACES.map(item => ({ value: item.id, label: item.label }))
  const surfaces = ref<QuerySurfaceOption[]>(seed)
  const surfaceMessage = ref('')

  async function loadSurfaces(force = false): Promise<void> {
    const loaded = await fetchQuerySurfaces(bridge, force)
    surfaces.value = loaded.ok ? loaded.options : seed
    surfaceMessage.value = loaded.ok ? '' : loaded.message
  }

  onMounted(() => { void loadSurfaces() })
  return { surfaces, surfaceMessage, loadSurfaces }
}
