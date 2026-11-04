import { computed, ref, watch, type ComputedRef } from 'vue'

/** 先对全部行搜索，再分页；删除最后一页的最后一行时自动回到有效页。 */
export function useMappingRows<T>(source: ComputedRef<T[]>, searchText: (row: T) => string) {
  const query = ref('')
  const page = ref(1)
  const filtered = computed(() => {
    const words = query.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
    return source.value.filter(row => words.every(word => searchText(row).toLocaleLowerCase().includes(word)))
  })
  const pages = computed(() => Math.max(1, Math.ceil(filtered.value.length / 10)))
  const visible = computed(() => filtered.value.slice((page.value - 1) * 10, page.value * 10))
  watch(query, () => { page.value = 1 }, { flush: 'sync' })
  watch(pages, count => { page.value = Math.min(page.value, count) }, { flush: 'sync' })
  return { query, page, pages, visible, total: computed(() => filtered.value.length) }
}
