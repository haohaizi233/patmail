<script setup lang="ts">
import { ref } from 'vue'
import FilingSearchQuery from './FilingSearchQuery.vue'
import FilingExportPreview from './FilingExportPreview.vue'
import type { FilingSearchRow } from '../../api/filing-search-types'
import type { MessageBridge } from '../../shared/message'

/**
 * 递交查询 + 导出预览一整套：上表现场查询和勾选，下表逐件出导出行。
 * 递交管理页和「递交管理-已完成导出」工作流都用这一份，表单不另抄。
 * 这里一律可查：可选布尔 prop 不传时会被 Vue 转成 false，别再用 `!== false` 当默认真。
 */
const props = defineProps<{ bridge?: MessageBridge; userId: string }>()

const exportRows = ref<FilingSearchRow[]>([])
const exportToken = ref(0)

function startExport(rows: FilingSearchRow[]): void {
  exportRows.value = rows
  exportToken.value += 1
}
</script>

<template>
  <div class="filing-export-panel">
    <FilingSearchQuery :bridge="bridge" :user-id="userId" :can-search="true" @export="startExport" />
    <FilingExportPreview v-if="exportRows.length" :bridge="bridge" :rows="exportRows" :token="exportToken" />
  </div>
</template>
