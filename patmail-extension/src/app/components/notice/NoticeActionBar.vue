<script setup lang="ts">
import { ref } from 'vue'
import type { NoticeTabId } from '../../../api/notice-types'

const props = defineProps<{
  tab: NoticeTabId
  importStatus: '0' | '1'
  selectedCount: number
  busyAction: string
}>()

const emit = defineEmits<{
  trigger: [action: string]
  uploadCpc: [kind: 'cpc' | 'gf', file: File]
}>()

const cpcInput = ref<HTMLInputElement | null>(null)
const uploadKind = ref<'cpc' | 'gf'>('cpc')

function pickZip(kind: 'cpc' | 'gf'): void {
  uploadKind.value = kind
  if (cpcInput.value) {
    cpcInput.value.value = ''
    cpcInput.value.click()
  }
}

function onZipPicked(e: Event): void {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  emit('uploadCpc', uploadKind.value, file)
  input.value = ''
}

function busy(key: string): boolean {
  return props.busyAction === key
}
</script>

<template>
  <div class="card notice-action-bar">
    <div class="toolbar">
      <input ref="cpcInput" class="sr-only" type="file" accept=".zip" @change="onZipPicked" />

      <template v-if="tab === 'import'">
        <template v-if="importStatus === '0'">
          <button type="button" class="solid" :disabled="Boolean(busyAction)" @click="emit('trigger', 'importNotice')">
            {{ busy('importNotice') ? '正在导入…' : '导入系统' }}
          </button>
          <button type="button" class="ghost" :disabled="Boolean(busyAction)" @click="emit('trigger', 'importEmail')">
            {{ busy('importEmail') ? '正在导入并邮寄…' : '导入并邮寄' }}
          </button>
          <button type="button" class="ghost" :disabled="Boolean(busyAction)" @click="emit('trigger', 'reMatch')">
            {{ busy('reMatch') ? '正在匹配…' : '重新匹配' }}
          </button>
          <button type="button" class="ghost" :disabled="Boolean(busyAction)" @click="emit('trigger', 'updateDone')">
            {{ busy('updateDone') ? '更新中…' : '更新已完成' }}
          </button>
          <button type="button" class="ghost" :disabled="Boolean(busyAction)" @click="emit('trigger', 'markNolaiuto')">
            添加到无需导入来文
          </button>
          <button type="button" class="ghost" :disabled="Boolean(busyAction)" @click="emit('trigger', 'updateCaseName')">
            更新案件名称
          </button>
          <button type="button" class="ghost" :disabled="Boolean(busyAction)" @click="pickZip('cpc')">
            {{ busy('uploadCpc') ? '上传中…' : '上传 CPC 官文' }}
          </button>
          <button type="button" class="ghost" :disabled="Boolean(busyAction)" @click="pickZip('gf')">
            上传国防官文
          </button>
          <button type="button" class="ghost" :disabled="Boolean(busyAction)" @click="emit('trigger', 'viewUploadProcess')">
            查看上传进度
          </button>
        </template>
        <template v-else>
          <button type="button" class="solid" :disabled="Boolean(busyAction)" @click="emit('trigger', 'mailCustomer')">
            发文给客户
          </button>
          <button type="button" class="ghost" :disabled="Boolean(busyAction)" @click="emit('trigger', 'recover')">
            恢复未处理
          </button>
          <button type="button" class="ghost" :disabled="Boolean(busyAction)" @click="emit('trigger', 'markNolaiuto')">
            添加到无需导入来文
          </button>
        </template>
        <button type="button" class="ghost" :disabled="Boolean(busyAction)" @click="emit('trigger', 'export')">
          {{ busy('export') ? '正在导出…' : '导出 Excel' }}
        </button>
      </template>

      <template v-else-if="tab === 'download'">
        <button type="button" class="solid" :disabled="Boolean(busyAction)" @click="emit('trigger', 'fetchTzsList')">
          {{ busy('fetchTzsList') ? '正在获取官文列表…' : '获取官文列表' }}
        </button>
        <button type="button" class="ghost" :disabled="Boolean(busyAction)" @click="emit('trigger', 'downloadAllTzs')">
          {{ busy('downloadAllTzs') ? '下载解析中…' : '下载所有官文' }}
        </button>
        <button type="button" class="ghost" :disabled="Boolean(busyAction)" @click="emit('trigger', 'downloadCheckedTzs')">
          下载勾选官文
        </button>
        <button type="button" class="ghost" :disabled="Boolean(busyAction)" @click="emit('trigger', 'deleteTzs')">
          删除勾选官文
        </button>
        <button type="button" class="ghost" :disabled="Boolean(busyAction)" @click="emit('trigger', 'export')">
          导出 Excel
        </button>
      </template>

      <template v-else-if="tab === 'cert'">
        <button type="button" class="solid" :disabled="Boolean(busyAction)" @click="emit('trigger', 'fetchCertList')">
          {{ busy('fetchCertList') ? '正在获取证书列表…' : '获取证书列表' }}
        </button>
        <button type="button" class="ghost" :disabled="Boolean(busyAction)" @click="emit('trigger', 'downloadAllCert')">
          {{ busy('downloadAllCert') ? '证书解析中…' : '下载所有待下载证书' }}
        </button>
        <button type="button" class="ghost" :disabled="Boolean(busyAction)" @click="emit('trigger', 'downloadCheckedCert')">
          下载勾选证书
        </button>
        <button type="button" class="ghost" :disabled="Boolean(busyAction)" @click="emit('trigger', 'export')">
          导出 Excel
        </button>
      </template>

      <template v-else-if="tab === 'replay'">
        <button type="button" class="solid" :disabled="Boolean(busyAction)" @click="emit('trigger', 'replayDownload')">
          {{ busy('replayDownload') ? '正在分析下载…' : '分析下载已勾选官文' }}
        </button>
        <button type="button" class="ghost" :disabled="Boolean(busyAction)" @click="emit('trigger', 'export')">
          导出核对清单 Excel
        </button>
      </template>

      <template v-else-if="tab === 'hand'">
        <button type="button" class="solid" :disabled="Boolean(busyAction)" @click="emit('trigger', 'updateDone')">
          更新状态（已完成）
        </button>
        <button type="button" class="ghost" :disabled="Boolean(busyAction)" @click="emit('trigger', 'refresh')">
          刷新列表
        </button>
      </template>

      <template v-else-if="tab === 'handHis'">
        <button type="button" class="solid" :disabled="Boolean(busyAction)" @click="emit('trigger', 'recover')">
          恢复未处理
        </button>
        <button type="button" class="ghost" :disabled="Boolean(busyAction)" @click="emit('trigger', 'recoverAnalyse')">
          恢复未处理并重新分析
        </button>
        <button type="button" class="ghost" :disabled="Boolean(busyAction)" @click="emit('trigger', 'refresh')">
          刷新列表
        </button>
      </template>

      <template v-else-if="tab === 'nolaiuto'">
        <button type="button" class="solid" :disabled="Boolean(busyAction)" @click="emit('trigger', 'restoreNolaiuto')">
          恢复到导入来文
        </button>
        <button type="button" class="ghost" :disabled="Boolean(busyAction)" @click="emit('trigger', 'refresh')">
          刷新列表
        </button>
      </template>

      <template v-else-if="tab === 'handExcel'">
        <button type="button" class="solid" :disabled="Boolean(busyAction)" @click="emit('trigger', 'updateHandExcel')">
          更新处理状态
        </button>
        <button type="button" class="ghost" :disabled="Boolean(busyAction)" @click="emit('trigger', 'refresh')">
          刷新列表
        </button>
      </template>

      <button type="button" class="ghost push" :disabled="Boolean(busyAction)" @click="emit('trigger', 'openEasyTab')">
        原站来文页
      </button>
      <span class="notice-selected-badge">已勾选 {{ selectedCount }} 项</span>
    </div>
  </div>
</template>
