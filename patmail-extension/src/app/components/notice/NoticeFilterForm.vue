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

const props = withDefaults(defineProps<{
  tab: NoticeTabId
  initData: NoticeInitData | null
  userOptions: TreeOption[]
  backgroundLoading?: boolean
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
}>(), {
  backgroundLoading: false
})

const emit = defineEmits<{
  search: []
  reset: []
  refreshInit: []
  uploadExcel: [file: File]
  statusChange: [status: '0' | '1']
  'patch-query': [tab: NoticeTabId, key: string, value: string | boolean]
}>()

const conditionsOpen = ref(true)
const showAdvancedTime = ref(false)
const pickedExcelFile = ref<File | null>(null)
const excelPickWarning = ref('')
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

function onImportStatusChange(raw: string | number): void {
  const next = String(raw) === '1' ? '1' : '0'
  patch('import', 'status', next)
  emit('statusChange', next)
}

function treeStatus(list: readonly unknown[]): 'loading' | 'ready' | 'empty' {
  if (list.length > 0) return 'ready'
  if (props.loadingInit || props.backgroundLoading) return 'loading'
  return 'empty'
}

const applyTypeOptions = computed(() => [
  { value: '', label: props.initData?.applyTypes.length ? '全部申请类型' : props.backgroundLoading ? '正在读取选项…' : '请选择' },
  ...(props.initData?.applyTypes ?? []).map(item => ({ value: item.value, label: item.label }))
])

const agencyOptions = computed(() => [
  { value: '', label: props.initData?.agencies.length ? '全部代理机构' : props.backgroundLoading ? '正在读取选项…' : '请选择' },
  ...(props.initData?.agencies ?? []).map(item => ({ value: item.value, label: item.label }))
])

const cpcAccountOptionsAll = computed(() => [
  { value: '', label: '全部 CPC 账号' },
  ...(props.initData?.cpcAccounts ?? []).map(item => ({ value: item.value, label: item.label }))
])

const cpcAccountOptionsStrict = computed(() => {
  const accounts = props.initData?.cpcAccounts ?? []
  if (accounts.length === 0) return [{ value: '', label: props.backgroundLoading ? '正在读取 CPC 账号…' : '暂无可用 CPC 账号' }]
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
  (props.initData?.countries ?? []).map(item => ({
    value: item.value,
    label: item.label,
    ...(item.parent ? { parent: item.parent } : {})
  }))
)

function onPickExcel(e: Event): void {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0] ?? null
  excelPickWarning.value = ''
  if (file) {
    const ext = file.name.slice(file.name.lastIndexOf('.') + 1).toUpperCase()
    if (ext !== 'XLS' && ext !== 'XLSX') {
      excelPickWarning.value = '只能导入 Excel 文档（.xls / .xlsx）'
      pickedExcelFile.value = null
      input.value = ''
      return
    }
  }
  pickedExcelFile.value = file
}

function submitExcelUpload(): void {
  if (!pickedExcelFile.value) return
  emit('uploadExcel', pickedExcelFile.value)
}

function clearPickedExcel(): void {
  pickedExcelFile.value = null
  excelPickWarning.value = ''
  if (excelInput.value) excelInput.value.value = ''
}

defineExpose({ clearPickedExcel })
</script>

<template>
  <form class="card notice-filter-form" @submit.prevent="emit('search')">
    <div v-if="tab === 'import' || tab === 'download' || tab === 'cert' || tab === 'replay'" class="notice-cond-head">
      <span class="notice-cond-title">查询条件</span>
      <button
        type="button"
        class="notice-cond-toggle"
        :aria-expanded="conditionsOpen"
        @click="conditionsOpen = !conditionsOpen"
      >
        {{ conditionsOpen ? '收起条件' : '展开条件' }}
      </button>
    </div>

    <template v-if="tab === 'import' && conditionsOpen">
      <div class="notice-form-2col">
        <!-- Row 1: 我方文号 | 申请号 -->
        <label class="notice-field">
          <span class="notice-field-label">我方文号</span>
          <div class="notice-textarea-wrap">
            <textarea
              :value="importQuery.case_volume"
              rows="2"
              class="notice-textarea"
              placeholder="多个中间用分；空格或者换行隔开，默认小于10条模糊查询，大于10条精确查询"
              @input="patch('import', 'case_volume', inputVal($event))"
            />
            <label class="page-check notice-inline-check">
              <input
                :checked="importQuery.is_fuzzy_query_case_volume"
                type="checkbox"
                @change="patch('import', 'is_fuzzy_query_case_volume', checkedVal($event))"
              />
              <span>是否模糊查询</span>
            </label>
          </div>
        </label>

        <label class="notice-field">
          <span class="notice-field-label">申请号</span>
          <textarea
            :value="importQuery.app_no"
            rows="2"
            class="notice-textarea"
            placeholder="多个中间用分；空格或者换行隔开"
            @input="patch('import', 'app_no', inputVal($event))"
          />
        </label>

        <!-- Row 2: 第一申请人行政区划 | 来文类型 -->
        <label class="notice-field">
          <span class="notice-field-label">
            第一申请人行政区划
            <i class="notice-field-help" tabindex="0" v-hint="'对应第一申请人信息中的行政区划'" aria-label="说明：对应第一申请人信息中的行政区划">?</i>
          </span>
          <input
            :value="importQuery.app_area_name"
            type="text"
            placeholder="例如：广东省深圳市"
            @input="patch('import', 'app_area_name', inputVal($event))"
          />
        </label>

        <label class="notice-field">
          <span class="notice-field-label">来文类型</span>
          <TreeOptionSelect
            :model-value="importQuery.filedesc"
            :options="fileTypeTreeOptions"
            :status="treeStatus(fileTypeTreeOptions)"
            empty-text="选择来文类型"
            @update:model-value="patch('import', 'filedesc', $event)"
          />
        </label>

        <!-- Row 3: 客户名称 | 申请人 -->
        <label class="notice-field">
          <span class="notice-field-label">客户名称</span>
          <input
            :value="importQuery.customer_name"
            type="text"
            maxlength="200"
            placeholder="请输入客户名称"
            @input="patch('import', 'customer_name', inputVal($event))"
          />
        </label>

        <label class="notice-field">
          <span class="notice-field-label">申请人</span>
          <input
            :value="importQuery.applicant_name"
            type="text"
            maxlength="200"
            placeholder="请输入申请人"
            @input="patch('import', 'applicant_name', inputVal($event))"
          />
        </label>

        <!-- Row 4: 客户代码 | 客户国家(地区) -->
        <label class="notice-field">
          <span class="notice-field-label">客户代码</span>
          <input
            :value="importQuery.customer_code"
            type="text"
            maxlength="100"
            placeholder="请输入客户代码"
            @input="patch('import', 'customer_code', inputVal($event))"
          />
        </label>

        <label class="notice-field">
          <span class="notice-field-label">客户国家(地区)</span>
          <TreeOptionSelect
            :model-value="importQuery.customer_country"
            :options="countryTreeOptions"
            :status="treeStatus(countryTreeOptions)"
            empty-text="暂无国家字典"
            @update:model-value="patch('import', 'customer_country', $event)"
          />
        </label>

        <!-- Row 5: 处理状态 | 排序栏位 -->
        <label class="notice-field">
          <span class="notice-field-label">处理状态</span>
          <ThemeSelect
            :model-value="importQuery.status"
            :options="[...NOTICE_STATUS_OPTIONS]"
            @update:model-value="onImportStatusChange"
          />
        </label>

        <label class="notice-field">
          <span class="notice-field-label">排序栏位</span>
          <ThemeSelect
            :model-value="importQuery.orderby"
            :options="[...NOTICE_ORDERBY_OPTIONS]"
            @update:model-value="patch('import', 'orderby', String($event))"
          />
        </label>

        <!-- Row 6: 优先审查 | 申请类型 -->
        <label class="notice-field">
          <span class="notice-field-label">优先审查</span>
          <ThemeSelect
            :model-value="importQuery.is_speed_checkd"
            :options="[...NOTICE_YES_NO_OPTIONS]"
            @update:model-value="patch('import', 'is_speed_checkd', String($event))"
          />
        </label>

        <label class="notice-field">
          <span class="notice-field-label">申请类型</span>
          <ThemeSelect
            :model-value="importQuery.apply_type"
            :options="applyTypeOptions"
            placeholder="请选择"
            @update:model-value="patch('import', 'apply_type', String($event))"
          />
        </label>

        <!-- Row 7: 业务助理 | 外部案源人 -->
        <label class="notice-field">
          <span class="notice-field-label">业务助理</span>
          <TreeOptionSelect
            :model-value="importQuery.sales_help"
            :options="userOptions"
            :status="treeStatus(userOptions)"
            empty-text="暂无人员字典"
            @update:model-value="patch('import', 'sales_help', $event)"
          />
        </label>

        <label class="notice-field">
          <span class="notice-field-label">外部案源人</span>
          <input
            :value="importQuery.introducer"
            type="text"
            placeholder="请输入外部案源人"
            @input="patch('import', 'introducer', inputVal($event))"
          />
        </label>

        <!-- Row 8: 代理机构 | 案件流向 -->
        <label class="notice-field">
          <span class="notice-field-label">代理机构</span>
          <ThemeSelect
            :model-value="importQuery.agency_id"
            :options="agencyOptions"
            placeholder="请选择"
            @update:model-value="patch('import', 'agency_id', String($event))"
          />
        </label>

        <label class="notice-field">
          <span class="notice-field-label">案件流向</span>
          <TreeOptionSelect
            :model-value="importQuery.flow_direction"
            :options="directionTreeOptions"
            :status="treeStatus(directionTreeOptions)"
            empty-text="选择案件流向"
            @update:model-value="patch('import', 'flow_direction', $event)"
          />
        </label>

        <!-- Row 9: 分析人员 | 所属分部 -->
        <label class="notice-field">
          <span class="notice-field-label">分析人员</span>
          <TreeOptionSelect
            :model-value="importQuery.assayer"
            :options="userOptions"
            :status="treeStatus(userOptions)"
            empty-text="暂无人员字典"
            @update:model-value="patch('import', 'assayer', $event)"
          />
        </label>

        <label class="notice-field">
          <span class="notice-field-label">所属分部</span>
          <TreeOptionSelect
            :model-value="importQuery.branch_dept_id"
            :options="branchTreeOptions"
            :status="treeStatus(branchTreeOptions)"
            empty-text="暂无所属分部"
            @update:model-value="patch('import', 'branch_dept_id', $event)"
          />
        </label>

        <!-- Row 10: 官方发文日 | 下载日期 -->
        <label class="notice-field">
          <span class="notice-field-label">官方发文日</span>
          <div class="date-pair">
            <WDatePicker
              :model-value="importQuery.post_date_s"
              :max="importQuery.post_date_e"
              placeholder="开始日期"
              @update:model-value="patch('import', 'post_date_s', $event)"
            />
            <span>到</span>
            <WDatePicker
              :model-value="importQuery.post_date_e"
              :min="importQuery.post_date_s"
              placeholder="结束日期"
              @update:model-value="patch('import', 'post_date_e', $event)"
            />
          </div>
        </label>

        <label class="notice-field">
          <span class="notice-field-label">下载日期</span>
          <div class="date-pair">
            <WDatePicker
              :model-value="importQuery.xiazairq_s"
              :max="importQuery.xiazairq_e"
              placeholder="开始日期"
              @update:model-value="patch('import', 'xiazairq_s', $event)"
            />
            <span>到</span>
            <WDatePicker
              :model-value="importQuery.xiazairq_e"
              :min="importQuery.xiazairq_s"
              placeholder="结束日期"
              @update:model-value="patch('import', 'xiazairq_e', $event)"
            />
          </div>
        </label>

        <!-- Row 11: 来文分析日期 | 专利标签 -->
        <label class="notice-field">
          <span class="notice-field-label">
            来文分析日期
            <i class="notice-field-help" tabindex="0" v-hint="'cpc客户端的分析来文日期'" aria-label="说明：cpc客户端的分析来文日期">?</i>
          </span>
          <div class="date-pair">
            <WDatePicker
              :model-value="importQuery.update_time_s"
              :max="importQuery.update_time_e"
              placeholder="开始日期"
              @update:model-value="patch('import', 'update_time_s', $event)"
            />
            <span>到</span>
            <WDatePicker
              :model-value="importQuery.update_time_e"
              :min="importQuery.update_time_s"
              placeholder="结束日期"
              @update:model-value="patch('import', 'update_time_e', $event)"
            />
          </div>
        </label>

        <label class="notice-field">
          <span class="notice-field-label">专利标签</span>
          <TreeOptionSelect
            :model-value="importQuery.apply_tags_id"
            :options="tagTreeOptions"
            :status="treeStatus(tagTreeOptions)"
            empty-text="暂无专利标签"
            @update:model-value="patch('import', 'apply_tags_id', $event)"
          />
        </label>

        <!-- Row 12: 预审案件 | 案件中是否导入 -->
        <label class="notice-field">
          <span class="notice-field-label">预审案件</span>
          <ThemeSelect
            :model-value="importQuery.hearing_the_case"
            :options="[...NOTICE_YES_NO_OPTIONS]"
            @update:model-value="patch('import', 'hearing_the_case', String($event))"
          />
        </label>

        <label class="notice-field">
          <span class="notice-field-label">案件中是否导入</span>
          <ThemeSelect
            :model-value="importQuery.files_is_case"
            :options="[...NOTICE_YES_NO_OPTIONS]"
            @update:model-value="patch('import', 'files_is_case', String($event))"
          />
        </label>

        <!-- 可选：来文分析时分秒 & 光华合作接口（原站按租户开关显隐） -->
        <template v-if="showAdvancedTime">
          <label class="notice-field">
            <span class="notice-field-label">分析时间(时分秒)</span>
            <div class="date-pair">
              <input
                :value="importQuery.update_time_shmm"
                type="text"
                placeholder="yyyy-MM-dd HH:mm:ss"
                @input="patch('import', 'update_time_shmm', inputVal($event))"
              />
              <span>到</span>
              <input
                :value="importQuery.update_time_ehmm"
                type="text"
                placeholder="yyyy-MM-dd HH:mm:ss"
                @input="patch('import', 'update_time_ehmm', inputVal($event))"
              />
            </div>
          </label>

          <label class="notice-field notice-checkbox-field">
            <span class="notice-field-label">接口接收</span>
            <label class="page-check">
              <input
                :checked="importQuery.is_hz_interfice"
                type="checkbox"
                @change="patch('import', 'is_hz_interfice', checkedVal($event))"
              />
              <span>光华导入官文</span>
            </label>
          </label>
        </template>
      </div>
    </template>

    <template v-else-if="tab === 'download' && conditionsOpen">
      <div class="notice-form-2col">
        <label class="notice-field">
          <span class="notice-field-label">收文账号</span>
          <ThemeSelect
            :model-value="downloadQuery.account"
            :options="cpcAccountOptionsAll"
            placeholder="全部 CPC 账号"
            @update:model-value="patch('download', 'account', String($event))"
          />
        </label>
        <label class="notice-field">
          <span class="notice-field-label">发明创造名称</span>
          <input
            :value="downloadQuery.casename"
            type="text"
            placeholder="请输入发明创造名称"
            @input="patch('download', 'casename', inputVal($event))"
          />
        </label>
        <label class="notice-field">
          <span class="notice-field-label">申请号</span>
          <input
            :value="downloadQuery.appno"
            type="text"
            placeholder="请输入申请号"
            @input="patch('download', 'appno', inputVal($event))"
          />
        </label>
        <label class="notice-field">
          <span class="notice-field-label">发文日期</span>
          <div class="date-pair">
            <WDatePicker
              :model-value="downloadQuery.startTime"
              :max="downloadQuery.endTime"
              placeholder="开始日期"
              @update:model-value="patch('download', 'startTime', $event)"
            />
            <span>到</span>
            <WDatePicker
              :model-value="downloadQuery.endTime"
              :min="downloadQuery.startTime"
              placeholder="结束日期"
              @update:model-value="patch('download', 'endTime', $event)"
            />
          </div>
        </label>
        <label class="notice-field">
          <span class="notice-field-label">下载状态</span>
          <ThemeSelect
            :model-value="downloadQuery.status"
            :options="[...NOTICE_UNGET_STATUS_OPTIONS]"
            @update:model-value="patch('download', 'status', String($event))"
          />
        </label>
      </div>
      <div class="notice-hints">
        <p>注意：此处只处理通知书文件，电子申请回执以及电子申请待处理回执不进行下载解析；已经在 CPC 离线客户端中确认过的通知书请到「来文二次下载」页面分析导入。</p>
      </div>
    </template>

    <template v-else-if="tab === 'cert' && conditionsOpen">
      <div class="notice-form-2col">
        <label class="notice-field">
          <span class="notice-field-label">收文账号</span>
          <ThemeSelect
            :model-value="certQuery.account"
            :options="cpcAccountOptionsAll"
            placeholder="全部 CPC 账号"
            @update:model-value="patch('cert', 'account', String($event))"
          />
        </label>
        <label class="notice-field">
          <span class="notice-field-label">发明创造名称</span>
          <input
            :value="certQuery.casename"
            type="text"
            placeholder="请输入发明创造名称"
            @input="patch('cert', 'casename', inputVal($event))"
          />
        </label>
        <label class="notice-field">
          <span class="notice-field-label">申请号</span>
          <input
            :value="certQuery.appno"
            type="text"
            placeholder="请输入申请号"
            @input="patch('cert', 'appno', inputVal($event))"
          />
        </label>
        <label class="notice-field">
          <span class="notice-field-label">发文日期</span>
          <div class="date-pair">
            <WDatePicker
              :model-value="certQuery.startTime"
              min="2023-02-07"
              :max="certQuery.endTime"
              placeholder="开始日期"
              @update:model-value="patch('cert', 'startTime', $event)"
            />
            <span>到</span>
            <WDatePicker
              :model-value="certQuery.endTime"
              :min="certQuery.startTime || '2023-02-07'"
              placeholder="结束日期"
              @update:model-value="patch('cert', 'endTime', $event)"
            />
          </div>
        </label>
        <label class="notice-field">
          <span class="notice-field-label">下载状态</span>
          <ThemeSelect
            :model-value="certQuery.status"
            :options="[...NOTICE_CERT_STATUS_OPTIONS]"
            @update:model-value="patch('cert', 'status', String($event))"
          />
        </label>
        <label class="notice-field">
          <span class="notice-field-label">发文序号</span>
          <input
            :value="certQuery.xlh"
            type="text"
            placeholder="请输入发文序列号"
            @input="patch('cert', 'xlh', inputVal($event))"
          />
        </label>
      </div>
      <div class="notice-hints">
        <p>注意：此处只能查看和处理 2023年02月07日 之后下发的专利证书。</p>
      </div>
    </template>

    <template v-else-if="tab === 'replay' && conditionsOpen">
      <div class="notice-form-2col">
        <label class="notice-field">
          <span class="notice-field-label">收文账号</span>
          <ThemeSelect
            :model-value="replayQuery.account"
            :options="cpcAccountOptionsStrict"
            placeholder="选择 CPC 账号"
            @update:model-value="patch('replay', 'account', String($event))"
          />
        </label>
        <label class="notice-field">
          <span class="notice-field-label">申请类型</span>
          <ThemeSelect
            :model-value="replayQuery.applyType"
            :options="[...NOTICE_REPLAY_APPLY_TYPE_OPTIONS]"
            @update:model-value="patch('replay', 'applyType', String($event))"
          />
        </label>
        <label class="notice-field">
          <span class="notice-field-label">申请号</span>
          <input
            :value="replayQuery.applyNo"
            type="text"
            placeholder="请输入申请号"
            @input="patch('replay', 'applyNo', inputVal($event))"
          />
        </label>
        <label class="notice-field">
          <span class="notice-field-label">发明创造名称</span>
          <input
            :value="replayQuery.caseName"
            type="text"
            placeholder="请输入发明创造名称"
            @input="patch('replay', 'caseName', inputVal($event))"
          />
        </label>
        <label class="notice-field">
          <span class="notice-field-label">来文名称</span>
          <input
            :value="replayQuery.noticeName"
            type="text"
            placeholder="请输入通知书名称"
            @input="patch('replay', 'noticeName', inputVal($event))"
          />
        </label>
        <label class="notice-field">
          <span class="notice-field-label">发文序号</span>
          <input
            :value="replayQuery.xlh"
            type="text"
            placeholder="请输入发文序列号"
            @input="patch('replay', 'xlh', inputVal($event))"
          />
        </label>
        <label class="notice-field notice-span-full">
          <span class="notice-field-label">发文日期</span>
          <div class="date-pair">
            <WDatePicker
              :model-value="replayQuery.startTime"
              :max="replayQuery.endTime"
              placeholder="开始日期"
              @update:model-value="patch('replay', 'startTime', $event)"
            />
            <span>到</span>
            <WDatePicker
              :model-value="replayQuery.endTime"
              :min="replayQuery.startTime"
              placeholder="结束日期"
              @update:model-value="patch('replay', 'endTime', $event)"
            />
          </div>
        </label>
      </div>
      <div class="notice-hints">
        <p>云端已确认列表（提示：默认查询近90天数据，可以通过指定发文时间范围查询。）</p>
      </div>
    </template>

    <template v-else-if="tab === 'hand'">
      <div class="notice-form-2col">
        <label class="notice-field">
          <span class="notice-field-label">分析人员</span>
          <TreeOptionSelect
            :model-value="handQuery.assayer"
            :options="userOptions"
            :status="treeStatus(userOptions)"
            empty-text="暂无人员字典"
            @update:model-value="patch('hand', 'assayer', $event)"
          />
        </label>
        <label class="notice-field">
          <span class="notice-field-label">快捷检索</span>
          <input
            :value="handQuery.keyword"
            type="search"
            placeholder="按来文名称、申请号、我方文号、客户名称实时过滤"
            @input="patch('hand', 'keyword', inputVal($event))"
          />
        </label>
      </div>
      <div class="notice-hints">
        <p>注意：异常来文列表中的通知书，可通过递交助手通知书管理再次分析；若异常通知继续存在，需将通知书手动上传到系统对应的案件中，再勾选已处理的通知书点击「更新状态」。</p>
        <p class="notice-legend">
          <span class="notice-legend-blue">字体蓝色--文件分析异常；</span>
          <span class="notice-legend-gray">字体灰色--无文件描述。</span>
        </p>
      </div>
    </template>

    <template v-else-if="tab === 'handHis'">
      <div class="notice-form-2col">
        <label class="notice-field">
          <span class="notice-field-label">分析人员</span>
          <TreeOptionSelect
            :model-value="handHisQuery.assayer"
            :options="userOptions"
            :status="treeStatus(userOptions)"
            empty-text="暂无人员字典"
            @update:model-value="patch('handHis', 'assayer', $event)"
          />
        </label>
        <label class="notice-field">
          <span class="notice-field-label">快捷检索</span>
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
      <div class="notice-form-2col">
        <label class="notice-field notice-span-full">
          <span class="notice-field-label">快捷检索</span>
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
      <div class="notice-hints notice-hints-info">
        <p>注意：请先上传中国电子申请网导出的 EXCEL 文件（.xls / .xlsx），上传后系统会根据清单自动进行匹配对比。</p>
      </div>
      <div class="notice-excel-upload">
        <label class="sheet-pick">
          <input ref="excelInput" type="file" accept=".xls,.xlsx" @change="onPickExcel" />
          <span class="sheet-pick-face" :class="{ picked: Boolean(pickedExcelFile) }">
            <span class="clip" v-hint.clip="pickedExcelFile ? pickedExcelFile.name : ''">{{ pickedExcelFile ? pickedExcelFile.name : '选择电子申请清单 Excel（.xls / .xlsx）' }}</span>
          </span>
        </label>
        <button
          type="button"
          class="solid"
          :disabled="!pickedExcelFile || uploadingExcel"
          @click="submitExcelUpload"
        >
          {{ uploadingExcel ? '正在上传清单…' : '导入清单' }}
        </button>
      </div>
      <p v-if="excelPickWarning" class="notice-status-inline-warn">{{ excelPickWarning }}</p>

      <div class="notice-form-3col">
        <label class="notice-field">
          <span class="notice-field-label">是否导入</span>
          <ThemeSelect
            :model-value="handExcelQuery.is_import"
            :options="[...NOTICE_EXCEL_IMPORT_OPTIONS]"
            @update:model-value="patch('handExcel', 'is_import', String($event))"
          />
        </label>
        <label class="notice-field">
          <span class="notice-field-label">下载状态</span>
          <ThemeSelect
            :model-value="handExcelQuery.is_download"
            :options="[...NOTICE_EXCEL_DOWNLOAD_OPTIONS]"
            @update:model-value="patch('handExcel', 'is_download', String($event))"
          />
        </label>
        <label class="notice-field">
          <span class="notice-field-label">是否处理</span>
          <ThemeSelect
            :model-value="handExcelQuery.is_handle"
            :options="[...NOTICE_EXCEL_HANDLE_OPTIONS]"
            @update:model-value="patch('handExcel', 'is_handle', String($event))"
          />
        </label>
      </div>
    </template>

    <div class="form-footer">
      <div class="inline-actions">
        <button
          v-if="tab === 'import'"
          type="button"
          class="ghost"
          @click="showAdvancedTime = !showAdvancedTime"
        >
          {{ showAdvancedTime ? '隐藏时分/接口项' : '时分/接口条件' }}
        </button>
        <button type="button" class="ghost" :disabled="loadingInit" @click="emit('refreshInit')">
          {{ loadingInit ? '正在刷新下拉…' : '刷新下拉选项' }}
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
