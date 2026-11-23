<script setup lang="ts">
import { computed, ref } from 'vue'
import type { TreeOption } from '../../../query/option-tree'
import ThemeSelect from '../../../shell/components/ThemeSelect.vue'
import TreeOptionSelect from '../../../shell/components/TreeOptionSelect.vue'
import WDatePicker from '../../../shell/components/WDatePicker.vue'
import {
  NOTICE_CERT_STATUS_OPTIONS,
  NOTICE_EXCEL_DOWNLOAD_OPTIONS,
  NOTICE_EXCEL_HANDLE_OPTIONS,
  NOTICE_EXCEL_IMPORT_OPTIONS,
  NOTICE_ORDERBY_OPTIONS,
  NOTICE_REPLAY_APPLY_TYPE_OPTIONS,
  NOTICE_STATUS_OPTIONS,
  NOTICE_UNGET_STATUS_OPTIONS,
  NOTICE_YES_NO_OPTIONS
} from '../../../api/notice-params'
import type {
  NoticeCertQuery,
  NoticeDownloadQuery,
  NoticeHandExcelQuery,
  NoticeHandHisQuery,
  NoticeHandQuery,
  NoticeImportQuery,
  NoticeInitData,
  NoticeNolaiutoQuery,
  NoticeReplayQuery,
  NoticeTabId
} from '../../../api/notice-types'

const props = defineProps<{
  tab: NoticeTabId
  initData: NoticeInitData | null
  userOptions: TreeOption[]
  loadingInit: boolean
  loadingSearch: boolean
  uploadingExcel: boolean
  importQuery: NoticeImportQuery
  downloadQuery: NoticeDownloadQuery
  certQuery: NoticeCertQuery
  replayQuery: NoticeReplayQuery
  handQuery: NoticeHandQuery
  handHisQuery: NoticeHandHisQuery
  nolaiutoQuery: NoticeNolaiutoQuery
  handExcelQuery: NoticeHandExcelQuery
}>()

const emit = defineEmits<{
  search: []
  reset: []
  refreshInit: []
  uploadExcel: [file: File]
  'patch-query': [tab: NoticeTabId, key: string, value: string | boolean]
}>()

const showMoreImport = ref(false)
const pickedExcelFile = ref<File | null>(null)
const excelInput = ref<HTMLInputElement | null>(null)

function patch(targetTab: NoticeTabId, key: string, value: string | boolean): void {
  emit('patch-query', targetTab, key, value)
}

function inputVal(e: Event): string {
  return (e.target as HTMLInputElement).value
}

function checkedVal(e: Event): boolean {
  return (e.target as HTMLInputElement).checked
}

const applyTypeOptions = computed(() => [
  { value: '', label: '全部申请类型' },
  ...(props.initData?.applyTypes ?? []).map(item => ({ value: item.value, label: item.label }))
])

const agencyOptions = computed(() => [
  { value: '', label: '全部代理机构' },
  ...(props.initData?.agencies ?? []).map(item => ({ value: item.value, label: item.label }))
])

const cpcAccountOptionsAll = computed(() => [
  { value: '', label: '全部 CPC 账号' },
  ...(props.initData?.cpcAccounts ?? []).map(item => ({ value: item.value, label: item.label }))
])

const cpcAccountOptionsStrict = computed(() => {
  const accounts = props.initData?.cpcAccounts ?? []
  if (accounts.length === 0) return [{ value: '', label: '暂无可用 CPC 账号' }]
  return accounts.map(item => ({ value: item.value, label: item.label }))
})

const fileTypeTreeOptions = computed<TreeOption[]>(() =>
  (props.initData?.fileTypes ?? []).map(node => ({
    value: node.id,
    label: node.name,
    ...(node.parentId ? { parent: node.parentId } : {}),
    ...(node.selectable === false ? { selectable: false } : {})
  }))
)

const directionTreeOptions = computed<TreeOption[]>(() =>
  (props.initData?.directions ?? []).map(item => ({ value: item.value, label: item.label }))
)

const tagTreeOptions = computed<TreeOption[]>(() =>
  (props.initData?.applyTags ?? []).map(item => ({ value: item.value, label: item.label }))
)

const branchTreeOptions = computed<TreeOption[]>(() =>
  (props.initData?.branches ?? []).map(item => ({ value: item.value, label: item.label }))
)

const countryTreeOptions = computed<TreeOption[]>(() =>
  (props.initData?.countries ?? []).map(item => ({ value: item.value, label: item.label }))
)

const pickerStatus = computed<'loading' | 'ready' | 'empty'>(() =>
  props.loadingInit ? 'loading' : props.initData ? 'ready' : 'empty'
)

function onPickExcel(e: Event): void {
  const input = e.target as HTMLInputElement
  pickedExcelFile.value = input.files?.[0] ?? null
}

function submitExcelUpload(): void {
  if (!pickedExcelFile.value) return
  emit('uploadExcel', pickedExcelFile.value)
}

function clearPickedExcel(): void {
  pickedExcelFile.value = null
  if (excelInput.value) excelInput.value.value = ''
}

defineExpose({ clearPickedExcel })
</script>

<template>
  <form class="card notice-filter-form" @submit.prevent="emit('search')">
    <template v-if="tab === 'import'">
      <div class="form-grid">
        <label class="span-all">
          我方文号
          <div class="notice-inline-pair">
            <input
              :value="importQuery.case_volume"
              type="text"
              placeholder="多个文号请用逗号、分号或空格分隔"
              @input="patch('import', 'case_volume', inputVal($event))"
            />
            <label class="page-check">
              <input
                :checked="importQuery.is_fuzzy_query_case_volume"
                type="checkbox"
                @change="patch('import', 'is_fuzzy_query_case_volume', checkedVal($event))"
              />
              <span>模糊</span>
            </label>
          </div>
        </label>

        <label>
          申请号
          <input
            :value="importQuery.app_no"
            type="text"
            placeholder="请输入申请号"
            @input="patch('import', 'app_no', inputVal($event))"
          />
        </label>

        <label>
          客户名称
          <input
            :value="importQuery.customer_name"
            type="text"
            placeholder="请输入客户名称"
            @input="patch('import', 'customer_name', inputVal($event))"
          />
        </label>

        <label>
          处理状态
          <ThemeSelect
            :model-value="importQuery.status"
            :options="[...NOTICE_STATUS_OPTIONS]"
            @update:model-value="patch('import', 'status', String($event))"
          />
        </label>

        <label>
          来文类型
          <TreeOptionSelect
            :model-value="importQuery.filedesc"
            :options="fileTypeTreeOptions"
            :status="pickerStatus"
            empty-text="暂无来文类型字典"
            @update:model-value="patch('import', 'filedesc', $event)"
          />
        </label>

        <label>
          代理机构
          <ThemeSelect
            :model-value="importQuery.agency_id"
            :options="agencyOptions"
            placeholder="全部代理机构"
            @update:model-value="patch('import', 'agency_id', String($event))"
          />
        </label>

        <label>
          申请类型
          <ThemeSelect
            :model-value="importQuery.apply_type"
            :options="applyTypeOptions"
            placeholder="全部申请类型"
            @update:model-value="patch('import', 'apply_type', String($event))"
          />
        </label>

        <label>
          官方发文日
          <div class="date-pair">
            <WDatePicker
              :model-value="importQuery.post_date_s"
              :max="importQuery.post_date_e"
              placeholder="开始日期"
              @update:model-value="patch('import', 'post_date_s', $event)"
            />
            <span>~</span>
            <WDatePicker
              :model-value="importQuery.post_date_e"
              :min="importQuery.post_date_s"
              placeholder="结束日期"
              @update:model-value="patch('import', 'post_date_e', $event)"
            />
          </div>
        </label>

        <label>
          排序方式
          <ThemeSelect
            :model-value="importQuery.orderby"
            :options="[...NOTICE_ORDERBY_OPTIONS]"
            @update:model-value="patch('import', 'orderby', String($event))"
          />
        </label>

        <label>
          分析人员
          <TreeOptionSelect
            :model-value="importQuery.assayer"
            :options="userOptions"
            :status="userOptions.length ? 'ready' : pickerStatus"
            empty-text="暂无人员字典"
            @update:model-value="patch('import', 'assayer', $event)"
          />
        </label>
      </div>

      <div v-if="showMoreImport" class="form-grid notice-advanced-grid">
        <label>
          客户代码
          <input
            :value="importQuery.customer_code"
            type="text"
            placeholder="请输入客户代码"
            @input="patch('import', 'customer_code', inputVal($event))"
          />
        </label>

        <label>
          申请人
          <input
            :value="importQuery.applicant_name"
            type="text"
            placeholder="请输入申请人"
            @input="patch('import', 'applicant_name', inputVal($event))"
          />
        </label>

        <label>
          客户国家
          <TreeOptionSelect
            :model-value="importQuery.customer_country"
            :options="countryTreeOptions"
            :status="pickerStatus"
            empty-text="暂无国家字典"
            @update:model-value="patch('import', 'customer_country', $event)"
          />
        </label>

        <label>
          业务助理
          <TreeOptionSelect
            :model-value="importQuery.sales_help"
            :options="userOptions"
            :status="userOptions.length ? 'ready' : pickerStatus"
            empty-text="暂无人员字典"
            @update:model-value="patch('import', 'sales_help', $event)"
          />
        </label>

        <label>
          外部案源人
          <input
            :value="importQuery.introducer"
            type="text"
            placeholder="请输入外部案源人"
            @input="patch('import', 'introducer', inputVal($event))"
          />
        </label>

        <label>
          第一申请人行政区划
          <input
            :value="importQuery.app_area_name"
            type="text"
            placeholder="例如：广东省深圳市"
            @input="patch('import', 'app_area_name', inputVal($event))"
          />
        </label>

        <label>
          案件流向
          <TreeOptionSelect
            :model-value="importQuery.flow_direction"
            :options="directionTreeOptions"
            :status="pickerStatus"
            empty-text="暂无案件流向字典"
            @update:model-value="patch('import', 'flow_direction', $event)"
          />
        </label>

        <label>
          专利标签
          <TreeOptionSelect
            :model-value="importQuery.apply_tags_id"
            :options="tagTreeOptions"
            :status="pickerStatus"
            empty-text="暂无专利标签"
            @update:model-value="patch('import', 'apply_tags_id', $event)"
          />
        </label>

        <label>
          所属分部
          <TreeOptionSelect
            :model-value="importQuery.branch_dept_id"
            :options="branchTreeOptions"
            :status="pickerStatus"
            empty-text="暂无所属分部"
            @update:model-value="patch('import', 'branch_dept_id', $event)"
          />
        </label>

        <label>
          下载日期
          <div class="date-pair">
            <WDatePicker
              :model-value="importQuery.xiazairq_s"
              :max="importQuery.xiazairq_e"
              placeholder="开始日期"
              @update:model-value="patch('import', 'xiazairq_s', $event)"
            />
            <span>~</span>
            <WDatePicker
              :model-value="importQuery.xiazairq_e"
              :min="importQuery.xiazairq_s"
              placeholder="结束日期"
              @update:model-value="patch('import', 'xiazairq_e', $event)"
            />
          </div>
        </label>

        <label>
          来文分析日期
          <div class="date-pair">
            <WDatePicker
              :model-value="importQuery.update_time_s"
              :max="importQuery.update_time_e"
              placeholder="开始日期"
              @update:model-value="patch('import', 'update_time_s', $event)"
            />
            <span>~</span>
            <WDatePicker
              :model-value="importQuery.update_time_e"
              :min="importQuery.update_time_s"
              placeholder="结束日期"
              @update:model-value="patch('import', 'update_time_e', $event)"
            />
          </div>
        </label>

        <label>
          分析时间(时分秒)
          <div class="date-pair">
            <input
              :value="importQuery.update_time_shmm"
              type="text"
              placeholder="00:00:00"
              @input="patch('import', 'update_time_shmm', inputVal($event))"
            />
            <span>~</span>
            <input
              :value="importQuery.update_time_ehmm"
              type="text"
              placeholder="23:59:59"
              @input="patch('import', 'update_time_ehmm', inputVal($event))"
            />
          </div>
        </label>

        <label>
          优先审查
          <ThemeSelect
            :model-value="importQuery.is_speed_checkd"
            :options="[...NOTICE_YES_NO_OPTIONS]"
            @update:model-value="patch('import', 'is_speed_checkd', String($event))"
          />
        </label>

        <label>
          预审案件
          <ThemeSelect
            :model-value="importQuery.hearing_the_case"
            :options="[...NOTICE_YES_NO_OPTIONS]"
            @update:model-value="patch('import', 'hearing_the_case', String($event))"
          />
        </label>

        <label>
          案件中是否导入
          <ThemeSelect
            :model-value="importQuery.files_is_case"
            :options="[...NOTICE_YES_NO_OPTIONS]"
            @update:model-value="patch('import', 'files_is_case', String($event))"
          />
        </label>

        <label class="page-check notice-checkbox-cell">
          <input
            :checked="importQuery.is_hz_interfice"
            type="checkbox"
            @change="patch('import', 'is_hz_interfice', checkedVal($event))"
          />
          <span>接口接收</span>
        </label>
      </div>
    </template>

    <template v-else-if="tab === 'download'">
      <div class="form-grid">
        <label>
          CPC 账号
          <ThemeSelect
            :model-value="downloadQuery.account"
            :options="cpcAccountOptionsAll"
            placeholder="全部 CPC 账号"
            @update:model-value="patch('download', 'account', String($event))"
          />
        </label>
        <label>
          案件名称
          <input
            :value="downloadQuery.casename"
            type="text"
            placeholder="请输入案件名称"
            @input="patch('download', 'casename', inputVal($event))"
          />
        </label>
        <label>
          申请号
          <input
            :value="downloadQuery.appno"
            type="text"
            placeholder="请输入申请号"
            @input="patch('download', 'appno', inputVal($event))"
          />
        </label>
        <label>
          发文日期
          <div class="date-pair">
            <WDatePicker
              :model-value="downloadQuery.startTime"
              :max="downloadQuery.endTime"
              placeholder="开始日期"
              @update:model-value="patch('download', 'startTime', $event)"
            />
            <span>~</span>
            <WDatePicker
              :model-value="downloadQuery.endTime"
              :min="downloadQuery.startTime"
              placeholder="结束日期"
              @update:model-value="patch('download', 'endTime', $event)"
            />
          </div>
        </label>
        <label>
          解析状态
          <ThemeSelect
            :model-value="downloadQuery.status"
            :options="[...NOTICE_UNGET_STATUS_OPTIONS]"
            @update:model-value="patch('download', 'status', String($event))"
          />
        </label>
      </div>
    </template>

    <template v-else-if="tab === 'cert'">
      <div class="form-grid">
        <label>
          CPC 账号
          <ThemeSelect
            :model-value="certQuery.account"
            :options="cpcAccountOptionsAll"
            placeholder="全部 CPC 账号"
            @update:model-value="patch('cert', 'account', String($event))"
          />
        </label>
        <label>
          案件名称
          <input
            :value="certQuery.casename"
            type="text"
            placeholder="请输入案件名称"
            @input="patch('cert', 'casename', inputVal($event))"
          />
        </label>
        <label>
          申请号
          <input
            :value="certQuery.appno"
            type="text"
            placeholder="请输入申请号"
            @input="patch('cert', 'appno', inputVal($event))"
          />
        </label>
        <label>
          发文序号
          <input
            :value="certQuery.xlh"
            type="text"
            placeholder="请输入发文序列号"
            @input="patch('cert', 'xlh', inputVal($event))"
          />
        </label>
        <label>
          发文日期
          <div class="date-pair">
            <WDatePicker
              :model-value="certQuery.startTime"
              :max="certQuery.endTime"
              placeholder="开始日期"
              @update:model-value="patch('cert', 'startTime', $event)"
            />
            <span>~</span>
            <WDatePicker
              :model-value="certQuery.endTime"
              :min="certQuery.startTime"
              placeholder="结束日期"
              @update:model-value="patch('cert', 'endTime', $event)"
            />
          </div>
        </label>
        <label>
          证书状态
          <ThemeSelect
            :model-value="certQuery.status"
            :options="[...NOTICE_CERT_STATUS_OPTIONS]"
            @update:model-value="patch('cert', 'status', String($event))"
          />
        </label>
      </div>
    </template>

    <template v-else-if="tab === 'replay'">
      <div class="form-grid">
        <label>
          CPC 账号
          <ThemeSelect
            :model-value="replayQuery.account"
            :options="cpcAccountOptionsStrict"
            placeholder="选择 CPC 账号"
            @update:model-value="patch('replay', 'account', String($event))"
          />
        </label>
        <label>
          申请类型
          <ThemeSelect
            :model-value="replayQuery.applyType"
            :options="[...NOTICE_REPLAY_APPLY_TYPE_OPTIONS]"
            @update:model-value="patch('replay', 'applyType', String($event))"
          />
        </label>
        <label>
          申请号
          <input
            :value="replayQuery.applyNo"
            type="text"
            placeholder="请输入申请号"
            @input="patch('replay', 'applyNo', inputVal($event))"
          />
        </label>
        <label>
          案件名称
          <input
            :value="replayQuery.caseName"
            type="text"
            placeholder="请输入案件名称"
            @input="patch('replay', 'caseName', inputVal($event))"
          />
        </label>
        <label>
          来文名称
          <input
            :value="replayQuery.noticeName"
            type="text"
            placeholder="请输入通知书名称"
            @input="patch('replay', 'noticeName', inputVal($event))"
          />
        </label>
        <label>
          发文序号
          <input
            :value="replayQuery.xlh"
            type="text"
            placeholder="请输入发文序列号"
            @input="patch('replay', 'xlh', inputVal($event))"
          />
        </label>
        <label>
          发文日期
          <div class="date-pair">
            <WDatePicker
              :model-value="replayQuery.startTime"
              :max="replayQuery.endTime"
              placeholder="开始日期"
              @update:model-value="patch('replay', 'startTime', $event)"
            />
            <span>~</span>
            <WDatePicker
              :model-value="replayQuery.endTime"
              :min="replayQuery.startTime"
              placeholder="结束日期"
              @update:model-value="patch('replay', 'endTime', $event)"
            />
          </div>
        </label>
      </div>
    </template>

    <template v-else-if="tab === 'hand'">
      <div class="form-grid">
        <label>
          分析人员
          <TreeOptionSelect
            :model-value="handQuery.assayer"
            :options="userOptions"
            :status="userOptions.length ? 'ready' : pickerStatus"
            empty-text="暂无人员字典"
            @update:model-value="patch('hand', 'assayer', $event)"
          />
        </label>
        <label class="notice-span-two">
          当前页快速检索
          <input
            :value="handQuery.keyword"
            type="search"
            placeholder="按来文名称、申请号、我方文号、客户名称实时过滤"
            @input="patch('hand', 'keyword', inputVal($event))"
          />
        </label>
      </div>
    </template>

    <template v-else-if="tab === 'handHis'">
      <div class="form-grid">
        <label>
          分析人员
          <TreeOptionSelect
            :model-value="handHisQuery.assayer"
            :options="userOptions"
            :status="userOptions.length ? 'ready' : pickerStatus"
            empty-text="暂无人员字典"
            @update:model-value="patch('handHis', 'assayer', $event)"
          />
        </label>
        <label class="notice-span-two">
          当前页快速检索
          <input
            :value="handHisQuery.keyword"
            type="search"
            placeholder="按来文名称、申请号、我方文号、处理人实时过滤"
            @input="patch('handHis', 'keyword', inputVal($event))"
          />
        </label>
      </div>
    </template>

    <template v-else-if="tab === 'nolaiuto'">
      <div class="form-grid">
        <label class="span-all">
          当前页快速检索
          <input
            :value="nolaiutoQuery.keyword"
            type="search"
            placeholder="按来文名称、申请号、我方文号、客户名称实时过滤"
            @input="patch('nolaiuto', 'keyword', inputVal($event))"
          />
        </label>
      </div>
    </template>

    <template v-else-if="tab === 'handExcel'">
      <div class="form-grid">
        <label>
          是否导入
          <ThemeSelect
            :model-value="handExcelQuery.is_import"
            :options="[...NOTICE_EXCEL_IMPORT_OPTIONS]"
            @update:model-value="patch('handExcel', 'is_import', String($event))"
          />
        </label>
        <label>
          是否下载
          <ThemeSelect
            :model-value="handExcelQuery.is_download"
            :options="[...NOTICE_EXCEL_DOWNLOAD_OPTIONS]"
            @update:model-value="patch('handExcel', 'is_download', String($event))"
          />
        </label>
        <label>
          是否处理
          <ThemeSelect
            :model-value="handExcelQuery.is_handle"
            :options="[...NOTICE_EXCEL_HANDLE_OPTIONS]"
            @update:model-value="patch('handExcel', 'is_handle', String($event))"
          />
        </label>
        <div class="span-all notice-excel-upload">
          <label class="sheet-pick">
            <input ref="excelInput" type="file" accept=".xls,.xlsx" @change="onPickExcel" />
            <span class="sheet-pick-face" :class="{ picked: Boolean(pickedExcelFile) }">
              <span>{{ pickedExcelFile ? pickedExcelFile.name : '选择电子申请清单 Excel（.xls / .xlsx）' }}</span>
            </span>
          </label>
          <button
            type="button"
            class="ghost"
            :disabled="!pickedExcelFile || uploadingExcel"
            @click="submitExcelUpload"
          >
            {{ uploadingExcel ? '正在上传清单…' : '上传清单' }}
          </button>
        </div>
      </div>
    </template>

    <div class="form-footer">
      <div class="inline-actions">
        <button
          v-if="tab === 'import'"
          type="button"
          class="ghost"
          @click="showMoreImport = !showMoreImport"
        >
          {{ showMoreImport ? '收起高级条件' : '展开全部条件' }}
        </button>
        <button type="button" class="ghost" :disabled="loadingInit" @click="emit('refreshInit')">
          {{ loadingInit ? '正在热加载下拉…' : '刷新下拉选项' }}
        </button>
      </div>
      <div class="form-actions">
        <button type="button" class="ghost" :disabled="loadingSearch" @click="emit('reset')">重置</button>
        <button type="submit" class="solid" :disabled="loadingSearch">
          {{ loadingSearch ? '查询中…' : '查询' }}
        </button>
      </div>
    </div>
  </form>
</template>
