<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import type { WorkflowOceanIconId } from './workflow-ocean.types'

const props = defineProps<{
  icon: WorkflowOceanIconId
}>()

const uid = useId()
const imgFailed = ref(false)

const KNOWN_3D_ICONS = new Set<WorkflowOceanIconId>([
  'pct-bell',
  'pct-layers',
  'file-folder',
  'filing-export',
  'hague-globe',
  'jihua-flask',
  'billing-coins',
  'pct-cloud',
  'fee-shield',
  'ocean-add',
  'custom-crystal'
])

const assetSrc = computed(() =>
  KNOWN_3D_ICONS.has(props.icon) ? `/assets/workflow-ocean/${props.icon}.webp` : ''
)

watch(
  () => props.icon,
  () => {
    imgFailed.value = false
  }
)
</script>

<template>
  <img
    v-if="assetSrc && !imgFailed"
    class="ocean-icon-img"
    :src="assetSrc"
    alt=""
    width="52"
    height="52"
    decoding="async"
    aria-hidden="true"
    @error="imgFailed = true"
  />
  <svg
    v-else
    class="ocean-icon-svg"
    viewBox="0 0 48 48"
    fill="none"
    aria-hidden="true"
  >
    <defs>
      <linearGradient :id="`${uid}-rose`" x1="8" y1="6" x2="40" y2="42" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#ffd5e8" />
        <stop offset="52%" stop-color="#ff6ea9" />
        <stop offset="100%" stop-color="#d63376" />
      </linearGradient>
      <linearGradient :id="`${uid}-lilac`" x1="8" y1="6" x2="40" y2="42" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#efe8ff" />
        <stop offset="55%" stop-color="#b495f7" />
        <stop offset="100%" stop-color="#6c4ec9" />
      </linearGradient>
      <linearGradient :id="`${uid}-peach`" x1="8" y1="6" x2="40" y2="42" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#fff0e2" />
        <stop offset="55%" stop-color="#ffb182" />
        <stop offset="100%" stop-color="#d4622b" />
      </linearGradient>
      <linearGradient :id="`${uid}-glacier`" x1="8" y1="6" x2="40" y2="42" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#e8f5ff" />
        <stop offset="55%" stop-color="#7bc0ff" />
        <stop offset="100%" stop-color="#2768b3" />
      </linearGradient>
      <linearGradient :id="`${uid}-gold`" x1="8" y1="6" x2="40" y2="42" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#fff7db" />
        <stop offset="55%" stop-color="#ffcb66" />
        <stop offset="100%" stop-color="#b57112" />
      </linearGradient>
      <linearGradient :id="`${uid}-prism`" x1="8" y1="6" x2="40" y2="42" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#ffe4f5" />
        <stop offset="50%" stop-color="#d29bff" />
        <stop offset="100%" stop-color="#7c4dff" />
      </linearGradient>
    </defs>

    <!-- 底部柔和环境阴影 -->
    <ellipse cx="24" cy="42.5" rx="13" ry="2.8" fill="rgba(108, 69, 152, 0.16)" />

    <!-- PCT提醒：立体水晶提醒铃铛 -->
    <template v-if="icon === 'pct-bell'">
      <path d="M24 8a3 3 0 0 1 3 3v1.2c5.4 1.3 9 6 9 11.8v6.2l3 3.2v1.6H9v-1.6l3-3.2V24c0-5.8 3.6-10.5 9-11.8V11a3 3 0 0 1 3-3Z" :fill="`url(#${uid}-rose)`" />
      <path d="M24 10c-5 0-9.5 3.6-10 9.6 3.5-2.6 8.2-3.4 14.5-2.2 1.6.3 3.1.9 4.4 1.6C32 13.6 28.4 10 24 10Z" fill="rgba(255,255,255,0.45)" />
      <circle cx="24" cy="38" r="3.4" fill="#ff9cc6" stroke="#fff" stroke-width="1.2" />
      <circle cx="35" cy="13" r="4" fill="#fff5fa" stroke="#ff5b9d" stroke-width="1.4" />
    </template>

    <!-- PCT鹏城专案：层叠水晶文件与邮件 -->
    <template v-else-if="icon === 'pct-layers'">
      <rect x="9" y="9" width="23" height="27" rx="5" fill="rgba(210, 190, 255, 0.55)" stroke="rgba(255,255,255,0.85)" />
      <rect x="14" y="13" width="25" height="26" rx="5" :fill="`url(#${uid}-lilac)`" stroke="rgba(255,255,255,0.9)" />
      <path d="M16 17.5 26.5 25 37 17.5" stroke="#fff" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M18 31h12" stroke="rgba(255,255,255,0.85)" stroke-width="2" stroke-linecap="round" />
    </template>

    <!-- 文件管理：半透明立体文件夹 -->
    <template v-else-if="icon === 'file-folder'">
      <path d="M8 15a4 4 0 0 1 4-4h7.5l3 3.2H36a4 4 0 0 1 4 4v15a4 4 0 0 1-4 4H12a4 4 0 0 1-4-4V15Z" :fill="`url(#${uid}-peach)`" />
      <rect x="10" y="18" width="28" height="17" rx="3.5" fill="rgba(255,255,255,0.34)" stroke="rgba(255,255,255,0.85)" />
      <path d="M16 25.5h16M16 30h10" stroke="#fff" stroke-width="2" stroke-linecap="round" />
    </template>

    <!-- 递交管理-已完成导出：文档与向上导出箭头 -->
    <template v-else-if="icon === 'filing-export'">
      <rect x="10" y="9" width="22" height="29" rx="4.5" :fill="`url(#${uid}-glacier)`" stroke="rgba(255,255,255,0.88)" />
      <path d="M15 18h11M15 23.5h8M15 29h6" stroke="rgba(255,255,255,0.88)" stroke-width="2" stroke-linecap="round" />
      <circle cx="33.5" cy="30.5" r="8.5" fill="#fff" stroke="#4ea3f0" stroke-width="1.5" />
      <path d="M33.5 34.5v-8m0 0-3.2 3.2m3.2-3.2 3.2 3.2" stroke="#2768b3" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </template>

    <!-- 海牙新申请：水晶地球与环绕轨道 -->
    <template v-else-if="icon === 'hague-globe'">
      <circle cx="24" cy="24" r="12.5" :fill="`url(#${uid}-lilac)`" stroke="rgba(255,255,255,0.9)" stroke-width="1.2" />
      <ellipse cx="24" cy="24" rx="5.5" ry="12.2" stroke="rgba(255,255,255,0.65)" stroke-width="1.4" />
      <path d="M12.2 24h23.6" stroke="rgba(255,255,255,0.65)" stroke-width="1.4" />
      <ellipse cx="24" cy="24" rx="18" ry="6.5" transform="rotate(-22 24 24)" stroke="#fff" stroke-width="1.8" />
      <circle cx="38.5" cy="17.5" r="2.5" fill="#ffd6ec" stroke="#fff" stroke-width="1" />
    </template>

    <!-- 季华实验室-文件导入：立体实验瓶与文件 -->
    <template v-else-if="icon === 'jihua-flask'">
      <path d="M19 10h10v6.5l8.4 15.2A4.2 4.2 0 0 1 33.7 38H14.3a4.2 4.2 0 0 1-3.7-6.3L19 16.5V10Z" :fill="`url(#${uid}-prism)`" stroke="rgba(255,255,255,0.9)" stroke-width="1.2" />
      <path d="M14.5 29c3.2-1.8 6.4 1.6 9.5 0 3.1-1.6 6.2.8 9.5-.2l2 3.5a2.4 2.4 0 0 1-2.1 3.7H14.6a2.4 2.4 0 0 1-2.1-3.7l2-3.3Z" fill="rgba(255,255,255,0.38)" />
      <rect x="17" y="8" width="14" height="3.2" rx="1.6" fill="#fff" />
      <circle cx="23" cy="25" r="1.7" fill="#fff" />
      <circle cx="27.5" cy="21.5" r="1.2" fill="rgba(255,255,255,0.85)" />
    </template>

    <!-- 请款：叠放金币与账单 -->
    <template v-else-if="icon === 'billing-coins'">
      <rect x="10" y="9" width="20" height="27" rx="4" fill="rgba(255,244,218,0.92)" stroke="#e5b35d" stroke-width="1.3" />
      <path d="M14.5 16h11M14.5 21h9M14.5 26h6" stroke="#b57112" stroke-width="1.8" stroke-linecap="round" />
      <circle cx="31.5" cy="29.5" r="9" :fill="`url(#${uid}-gold)`" stroke="#fff" stroke-width="1.4" />
      <path d="M31.5 25v9m-2.5-6.5h5m-5 4h5" stroke="#fff" stroke-width="1.6" stroke-linecap="round" />
    </template>

    <!-- PCT官文下载上传：双向箭头与水晶云朵 -->
    <template v-else-if="icon === 'pct-cloud'">
      <path d="M16 32h17.5a6.5 6.5 0 0 0 1-12.9A8.5 8.5 0 0 0 18 16.5a7 7 0 0 0-2 15.5Z" :fill="`url(#${uid}-glacier)`" stroke="rgba(255,255,255,0.9)" stroke-width="1.2" />
      <path d="M20.5 21.5v8.5m0 0-2.6-2.6m2.6 2.6 2.6-2.6M27.5 30v-8.5m0 0-2.6 2.6m2.6-2.6 2.6 2.6" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
    </template>

    <!-- 请求费用减缓：带货币符号的水晶盾牌 -->
    <template v-else-if="icon === 'fee-shield'">
      <path d="M24 8.5 37 13.8v9.8c0 7.7-5.5 13.7-13 15.9-7.5-2.2-13-8.2-13-15.9v-9.8L24 8.5Z" :fill="`url(#${uid}-rose)`" stroke="rgba(255,255,255,0.9)" stroke-width="1.2" />
      <path d="M24 11.2 13.5 15.4v8.2c0 2.6.6 5 1.8 7.1 3.6-8.4 9.7-13.2 18.2-14.9L24 11.2Z" fill="rgba(255,255,255,0.34)" />
      <path d="M20.8 18.2 24 22l3.2-3.8M20.5 23.5h7M20.5 27h7M24 22v9" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" />
    </template>

    <!-- 从知识海洋加一条：发光水晶立方体与加号 -->
    <template v-else-if="icon === 'ocean-add'">
      <path d="M24 7.5 37.5 15v16L24 38.5 10.5 31V15L24 7.5Z" :fill="`url(#${uid}-prism)`" stroke="rgba(255,255,255,0.95)" stroke-width="1.3" />
      <path d="M24 7.5 37.5 15 24 22.5 10.5 15 24 7.5Z" fill="rgba(255,255,255,0.42)" />
      <path d="M24 17v12m-6-6h12" stroke="#fff" stroke-width="2.4" stroke-linecap="round" />
    </template>

    <!-- 自定义工作流：默认多面水晶节点 -->
    <template v-else>
      <path d="M24 8 36 18.5 31.5 36.5h-15L12 18.5 24 8Z" :fill="`url(#${uid}-prism)`" stroke="rgba(255,255,255,0.92)" stroke-width="1.3" />
      <path d="M24 8 30 22l-6 14.5L18 22 24 8Z" fill="rgba(255,255,255,0.34)" />
      <circle cx="24" cy="22" r="3" fill="#fff" />
    </template>
  </svg>
</template>
