<script setup lang="ts">
import type { NoticeTabId } from '../../../api/notice-types'

const props = withDefaults(defineProps<{
  tab: NoticeTabId
  importStatus: '0' | '1'
  selectedCount: number
  busyAction: string
  noticeGfEnabled?: boolean
}>(), {
  noticeGfEnabled: false
})

const emit = defineEmits<{
  trigger: [action: string]
}>()

function busy(key: string): boolean {
  return props.busyAction === key
}
</script>

<template>
  <div class="card notice-action-bar">
    <div class="toolbar">
      <template v-if="tab === 'import'">
        <button type="button" class="solid" :disabled="Boolean(busyAction)" @click="emit('trigger', 'search')">
          查询
        </button>
        <button type="button" class="ghost" :disabled="Boolean(busyAction)" @click="emit('trigger', 'export')">
          {{ busy('export') ? '正在导出…' : '导出Excel' }}
        </button>
        <template v-if="importStatus === '0'">
          <button type="button" class="ghost" :disabled="Boolean(busyAction)" @click="emit('trigger', 'importNotice')">
            {{ busy('importNotice') ? '正在导入…' : '导入系统' }}
          </button>
          <button
            type="button"
            class="ghost"
            v-hint="'重新匹配案件'"
            :disabled="Boolean(busyAction)"
            @click="emit('trigger', 'reMatch')"
          >
            {{ busy('reMatch') ? '正在匹配…' : '重新匹配' }}
          </button>
          <button
            type="button"
            class="ghost"
            v-hint="'设定该来文无需发文给客户'"
            :disabled="Boolean(busyAction)"
            @click="emit('trigger', 'updateDone')"
          >
            {{ busy('updateDone') ? '更新中…' : '更新已完成' }}
          </button>
          <button
            type="button"
            class="ghost"
            v-hint="'将来文移到无需导入来文中'"
            :disabled="Boolean(busyAction)"
            @click="emit('trigger', 'markNolaiuto')"
          >
            添加到无需导入来文
          </button>
        </template>
        <template v-else>
          <button
            type="button"
            class="ghost"
            v-hint="'设定该来文无需发文给客户'"
            :disabled="Boolean(busyAction)"
            @click="emit('trigger', 'recover')"
          >
            恢复未处理
          </button>
          <button
            type="button"
            class="ghost"
            v-hint="'选择发文模式建立客户发文草稿'"
            :disabled="Boolean(busyAction)"
            @click="emit('trigger', 'mailCustomer')"
          >
            发文给客户
          </button>
        </template>
        <button
          type="button"
          class="ghost"
          v-hint="'上传CPC官文'"
          :disabled="Boolean(busyAction)"
          @click="emit('trigger', 'openUploadCpc')"
        >
          {{ busy('uploadCpc') ? '上传中…' : '上传CPC官文' }}
        </button>
        <button
          v-if="noticeGfEnabled"
          type="button"
          class="ghost"
          v-hint="'上传国防官文'"
          :disabled="Boolean(busyAction)"
          @click="emit('trigger', 'openUploadGf')"
        >
          上传国防官文
        </button>
        <button
          v-if="noticeGfEnabled"
          type="button"
          class="ghost"
          v-hint="'查看上传进度'"
          :disabled="Boolean(busyAction)"
          @click="emit('trigger', 'viewUploadProcess')"
        >
          查看上传进度
        </button>
        <button
          type="button"
          class="ghost"
          v-hint="'更新案件名称'"
          :disabled="Boolean(busyAction)"
          @click="emit('trigger', 'updateCaseName')"
        >
          更新案件名称
        </button>
      </template>

      <template v-else-if="tab === 'download'">
        <button
          type="button"
          class="solid"
          v-hint="'获取CPC官方的未确认通知书列表'"
          :disabled="Boolean(busyAction)"
          @click="emit('trigger', 'fetchTzsList')"
        >
          {{ busy('fetchTzsList') ? '正在获取官文列表…' : '获取官文列表' }}
        </button>
        <button
          type="button"
          class="ghost"
          v-hint="'下载所有未确认的官文'"
          :disabled="Boolean(busyAction)"
          @click="emit('trigger', 'downloadAllTzs')"
        >
          {{ busy('downloadAllTzs') ? '下载解析中…' : '下载所有官文' }}
        </button>
        <button
          type="button"
          class="ghost"
          v-hint="'下载勾选官文'"
          :disabled="Boolean(busyAction)"
          @click="emit('trigger', 'downloadCheckedTzs')"
        >
          下载勾选官文
        </button>
        <button
          type="button"
          class="ghost"
          v-hint="'删除勾选官文'"
          :disabled="Boolean(busyAction)"
          @click="emit('trigger', 'deleteTzs')"
        >
          删除勾选官文
        </button>
        <button type="button" class="ghost" :disabled="Boolean(busyAction)" @click="emit('trigger', 'export')">
          导出Excel
        </button>
      </template>

      <template v-else-if="tab === 'cert'">
        <button
          type="button"
          class="solid"
          v-hint="'获取CPC官方账户的证书列表'"
          :disabled="Boolean(busyAction)"
          @click="emit('trigger', 'fetchCertList')"
        >
          {{ busy('fetchCertList') ? '正在获取证书列表…' : '获取证书列表' }}
        </button>
        <button type="button" class="ghost" :disabled="Boolean(busyAction)" @click="emit('trigger', 'export')">
          导出Excel
        </button>
        <button
          type="button"
          class="ghost"
          v-hint="'下载所有未确认的官文'"
          :disabled="Boolean(busyAction)"
          @click="emit('trigger', 'downloadAllCert')"
        >
          {{ busy('downloadAllCert') ? '证书解析中…' : '下载所有待下载证书' }}
        </button>
        <button
          type="button"
          class="ghost"
          v-hint="'下载勾选官文'"
          :disabled="Boolean(busyAction)"
          @click="emit('trigger', 'downloadCheckedCert')"
        >
          下载勾选证书
        </button>
      </template>

      <template v-else-if="tab === 'replay'">
        <button type="button" class="solid" :disabled="Boolean(busyAction)" @click="emit('trigger', 'replayDownload')">
          {{ busy('replayDownload') ? '正在分析下载…' : '分析下载已勾选官文' }}
        </button>
        <button type="button" class="ghost" :disabled="Boolean(busyAction)" @click="emit('trigger', 'export')">
          导出核对清单Excel
        </button>
      </template>

      <template v-else-if="tab === 'hand'">
        <button
          type="button"
          class="solid"
          v-hint="'更新该异常来文已手动处理'"
          :disabled="Boolean(busyAction)"
          @click="emit('trigger', 'updateDone')"
        >
          更新状态
        </button>
        <button
          type="button"
          class="ghost"
          v-hint="'刷新列表'"
          :disabled="Boolean(busyAction)"
          @click="emit('trigger', 'refresh')"
        >
          刷新列表
        </button>
      </template>

      <template v-else-if="tab === 'handHis'">
        <button
          type="button"
          class="solid"
          v-hint="'恢复未处理'"
          :disabled="Boolean(busyAction)"
          @click="emit('trigger', 'recover')"
        >
          恢复未处理
        </button>
        <button
          type="button"
          class="ghost"
          v-hint="'恢复未处理并重新分析'"
          :disabled="Boolean(busyAction)"
          @click="emit('trigger', 'recoverAnalyse')"
        >
          恢复未处理并重新分析
        </button>
        <button
          type="button"
          class="ghost"
          v-hint="'刷新列表'"
          :disabled="Boolean(busyAction)"
          @click="emit('trigger', 'refresh')"
        >
          刷新列表
        </button>
      </template>

      <template v-else-if="tab === 'nolaiuto'">
        <button
          type="button"
          class="solid"
          v-hint="'恢复到导入来文'"
          :disabled="Boolean(busyAction)"
          @click="emit('trigger', 'restoreNolaiuto')"
        >
          恢复到导入来文
        </button>
        <button
          type="button"
          class="ghost"
          v-hint="'刷新列表'"
          :disabled="Boolean(busyAction)"
          @click="emit('trigger', 'refresh')"
        >
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
