<script setup lang="ts">
import { ref } from 'vue'
import FilingSearchQuery from './FilingSearchQuery.vue'
import FilingExportPreview from './FilingExportPreview.vue'
import type { FilingSearchRow } from '../../api/filing-search-types'
import type { MessageBridge } from '../../shared/message'

/**
 * 递交查询 + 导出预览一整套：上表现场查询和勾选，下表逐件出导出行。
 * 递交管理页和「递交管理-已完成导出」工作流都用这一份，表单不另抄。
 * 全选所有一结束就预取（warm）导出数据；点「导出 Excel」只是下文件，取好的立刻下，没取好的等下完自动下。
 */
const props = defineProps<{ bridge?: MessageBridge; userId: string }>()

const exportRows = ref<FilingSearchRow[]>([])
const exportToken = ref(0)
const downloadToken = ref(0)

/** 同一批行（行对象同一批）继续用同一次取数，不重跑。 */
function deliver(rows: FilingSearchRow[], download: boolean): void {
  if (!rows.length) return
  const current = exportRows.value
  const same = rows.length === current.length && rows.length > 0 &&
    rows[0] === current[0] && rows[rows.length - 1] === current[current.length - 1]
  if (!same) {
    exportRows.value = rows
    exportToken.value += 1
  }
  if (download) downloadToken.value += 1
}

function warmRows(rows: FilingSearchRow[]): void {
  deliver(rows, false)
}

function startExport(rows: FilingSearchRow[]): void {
  deliver(rows, true)
}
</script>

<template>
  <div class="filing-export-panel">
    <FilingSearchQuery :bridge="bridge" :user-id="userId" :can-search="true" @export="startExport" @warm="warmRows" />
    <FilingExportPreview
      v-if="exportRows.length"
      :bridge="bridge"
      :rows="exportRows"
      :token="exportToken"
      :download-token="downloadToken"
    />
  </div>
</template>
