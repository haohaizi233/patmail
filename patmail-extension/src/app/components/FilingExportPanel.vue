<script setup lang="ts">
import { markRaw, ref, shallowRef } from 'vue'
import FilingSearchQuery from './FilingSearchQuery.vue'
import FilingExportPreview from './FilingExportPreview.vue'
import type { FilingSearchRow } from '../../api/filing-search-types'
import type { MessageBridge } from '../../shared/message'

/**
 * 递交查询 + 导出预览一整套：上表现场查询和勾选，下表逐件出导出行。
 * 递交管理页和「递交管理-已完成导出」工作流都用这一份，表单不另抄。
 * 全选所有只翻页拉行；点「导出 Excel」才开始取数，取完自动下文件。
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- 存量豁免：保留解构占位与接口形态
const props = defineProps<{ bridge?: MessageBridge; userId: string }>()

// 几万行是只读数据，进深度响应式等于每格读写都过代理，起导那一瞬先交这笔税不值当。
const exportRows = shallowRef<FilingSearchRow[]>([])
const exportToken = ref(0)
const downloadToken = ref(0)

function startExport(rows: FilingSearchRow[]): void {
  if (!rows.length) return
  // 同一批行（行对象同一批）不重跑取数，点几次导出都是下同一份文件。
  const current = exportRows.value
  const same = rows.length === current.length && rows.length > 0 &&
    rows[0] === current[0] && rows[rows.length - 1] === current[current.length - 1]
  if (!same) {
    exportRows.value = markRaw(rows)
    exportToken.value += 1
  }
  downloadToken.value += 1
}
</script>

<template>
  <div class="filing-export-panel">
    <FilingSearchQuery :bridge="bridge" :user-id="userId" :can-search="true" @export="startExport" />
    <FilingExportPreview
      v-if="exportRows.length"
      :bridge="bridge"
      :rows="exportRows"
      :token="exportToken"
      :download-token="downloadToken"
    />
  </div>
</template>
